-- ============================================================================
-- NeoOrder — Migração de saneamento, segurança e camada de API (RPC)
-- Data: 2026-10-17
--
-- Objetivo:
--   1. Corrigir incompatibilidades entre front-end e schema (status, colunas).
--   2. Substituir o acesso direto às tabelas por uma API RPC transacional,
--      autenticada por token de sessão (mesa e funcionário).
--   3. Remover políticas RLS permissivas e conceder apenas EXECUTE nas RPCs.
--   4. Corrigir disponibilidade de pratos, imagens, pedidos e chamados.
--
-- Esta migração é idempotente (pode ser reaplicada com segurança).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. ESTRUTURA: senhas, sessões de funcionário e controle de tentativas
-- ----------------------------------------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS senha_hash text,
  ADD COLUMN IF NOT EXISTS senha_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sessoes_funcionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  ativa boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_sessoes_funcionario_funcionario
  ON public.sessoes_funcionario (funcionario_id);

CREATE TABLE IF NOT EXISTS public.login_tentativas (
  id bigserial PRIMARY KEY,
  login text NOT NULL,
  sucesso boolean NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_tentativas_login
  ON public.login_tentativas (lower(login), criado_em DESC);

-- Login único sem diferenciar maiúsculas/minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_lower_key
  ON public.usuarios (lower(login))
  WHERE login IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. STATUS DE PEDIDOS: alinhar dados e CHECK com o front-end
--    Conjunto canônico: Pendente, Em Preparo, Pronto, Entregue, Cancelado
-- ----------------------------------------------------------------------------

UPDATE public.pedidos SET status = 'Pendente'   WHERE status = 'Recebido';
UPDATE public.pedidos SET status = 'Em Preparo' WHERE status = 'Em preparo';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('Pendente', 'Em Preparo', 'Pronto', 'Entregue', 'Cancelado'));

ALTER TABLE public.chamados
  ALTER COLUMN status SET DEFAULT 'Pendente';

-- ----------------------------------------------------------------------------
-- 3. HELPERS INTERNOS (SECURITY DEFINER, não expostos ao cliente)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._hash_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._normalizar_login(p_login text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(p_login, '')));
$$;

-- Valida a sessão de mesa e devolve o mesa_id.
-- (Não exige mais qr_code_ativo: o login por senha também cria sessão.)
CREATE OR REPLACE FUNCTION public.validar_sessao_mesa(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_mesa uuid;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN
    RAISE EXCEPTION 'Sessão de mesa inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  SELECT s.mesa_id INTO v_mesa
  FROM public.sessoes_mesa s
  JOIN public.usuarios u ON u.id = s.mesa_id
  WHERE s.session_token_hash = v_hash
    AND s.ativa = true
    AND s.expira_em > now()
    AND u.ativo = true
    AND u.tipo = 'mesa'
  LIMIT 1;

  IF v_mesa IS NULL THEN
    RAISE EXCEPTION 'Sessão de mesa expirada ou inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.sessoes_mesa
     SET ultimo_acesso_em = now()
   WHERE session_token_hash = v_hash;

  RETURN v_mesa;
END;
$$;

-- Valida a sessão de funcionário e devolve id, perfil e nome.
CREATE OR REPLACE FUNCTION public.funcionario_da_sessao(p_session_token text)
RETURNS TABLE (funcionario_id uuid, perfil varchar, nome varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN
    RAISE EXCEPTION 'Sessão de funcionário inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  RETURN QUERY
    SELECT u.id, COALESCE(u.perfil, 'atendente')::varchar, u.nome::varchar
    FROM public.sessoes_funcionario s
    JOIN public.usuarios u ON u.id = s.funcionario_id
    WHERE s.session_token_hash = v_hash
      AND s.ativa = true
      AND s.expira_em > now()
      AND u.ativo = true
      AND u.tipo = 'funcionario';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de funcionário expirada ou inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.sessoes_funcionario
     SET ultimo_acesso_em = now()
   WHERE session_token_hash = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public._exigir_funcionario(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT f.funcionario_id INTO v_id FROM public.funcionario_da_sessao(p_session_token) f;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._exigir_gerente(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_perfil varchar;
BEGIN
  SELECT f.funcionario_id, f.perfil INTO v_id, v_perfil
  FROM public.funcionario_da_sessao(p_session_token) f;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  IF v_perfil IS DISTINCT FROM 'gerente' THEN
    RAISE EXCEPTION 'Acesso negado: apenas gerentes podem executar esta ação.' USING ERRCODE = '42501';
  END IF;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. AUTENTICAÇÃO
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sistema_precisa_bootstrap()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE tipo = 'funcionario' AND perfil = 'gerente' AND ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.criar_gerente_inicial(p_login text, p_senha text, p_nome text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(918273645);

  IF NOT public.sistema_precisa_bootstrap() THEN
    RAISE EXCEPTION 'O sistema já possui um gerente ativo.' USING ERRCODE = '42501';
  END IF;

  IF public._normalizar_login(p_login) = '' THEN
    RAISE EXCEPTION 'Informe um login.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_senha, '')) < 6 THEN
    RAISE EXCEPTION 'A senha deve ter no mínimo 6 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE lower(login) = public._normalizar_login(p_login)) THEN
    RAISE EXCEPTION 'Este login já está em uso.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.usuarios (tipo, nome, login, perfil, ativo, senha_hash, senha_atualizada_em)
  VALUES (
    'funcionario',
    COALESCE(NULLIF(btrim(p_nome), ''), btrim(p_login)),
    btrim(p_login),
    'gerente',
    true,
    extensions.crypt(p_senha, extensions.gen_salt('bf', 11)),
    now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'mensagem', 'Gerente inicial criado com sucesso.');
END;
$$;

CREATE OR REPLACE FUNCTION public.autenticar_usuario(p_login text, p_senha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_login text;
  v_user public.usuarios%ROWTYPE;
  v_falhas int;
  v_token text;
  v_expira timestamptz;
  v_tipo_sessao text;
BEGIN
  IF btrim(coalesce(p_login, '')) = '' OR coalesce(p_senha, '') = '' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', '22023',
      'mensagem', 'Informe o login e a senha.');
  END IF;

  v_login := public._normalizar_login(p_login);

  SELECT count(*) INTO v_falhas
  FROM public.login_tentativas
  WHERE login = v_login
    AND sucesso = false
    AND criado_em > now() - interval '15 minutes';

  IF v_falhas >= 5 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42901',
      'mensagem', 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE lower(login) = v_login LIMIT 1;

  -- Falhas de credencial são REGISTRADAS e retornadas como objeto.
  -- Lançar exceção aqui desfaria o INSERT (rollback da transação) e o
  -- bloqueio por tentativas nunca entraria em vigor.
  IF v_user.id IS NULL OR v_user.ativo IS NOT TRUE THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000',
      'mensagem', 'Usuário não encontrado ou inativo.');
  END IF;

  IF v_user.senha_hash IS NULL
     OR v_user.senha_hash <> extensions.crypt(p_senha, v_user.senha_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000',
      'mensagem', 'Senha incorreta.');
  END IF;

  -- Login bem-sucedido limpa o histórico de falhas daquele usuário.
  DELETE FROM public.login_tentativas WHERE login = v_login AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, true);

  DELETE FROM public.login_tentativas
  WHERE login = v_login AND criado_em < now() - interval '2 days';

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + interval '12 hours';

  IF v_user.tipo = 'mesa' THEN
    v_tipo_sessao := 'mesa';
    UPDATE public.sessoes_mesa SET ativa = false WHERE mesa_id = v_user.id;
    INSERT INTO public.sessoes_mesa (mesa_id, session_token_hash, expira_em, ativa)
    VALUES (v_user.id, public._hash_token(v_token), v_expira, true);
  ELSE
    v_tipo_sessao := 'funcionario';
    UPDATE public.sessoes_funcionario SET ativa = false WHERE funcionario_id = v_user.id;
    INSERT INTO public.sessoes_funcionario (funcionario_id, session_token_hash, expira_em, ativa)
    VALUES (v_user.id, public._hash_token(v_token), v_expira, true);
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'usuario', jsonb_build_object(
      'id', v_user.id,
      'nome', v_user.nome,
      'login', v_user.login,
      'tipo', v_user.tipo,
      'perfil', COALESCE(v_user.perfil, v_user.tipo)
    ),
    'tipo_sessao', v_tipo_sessao,
    'session_token', v_token,
    'expira_em', v_expira
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_sessao(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash;
  UPDATE public.sessoes_funcionario SET ativa = false WHERE session_token_hash = v_hash;

  RETURN jsonb_build_object('mensagem', 'Sessão encerrada.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. CARDÁPIO PÚBLICO (com disponibilidade calculada, sem expor estoque)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pratos_cardapio()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'nome'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'nome', p.nome,
      'descricao', COALESCE(p.descricao, ''),
      'preco', p.preco,
      'imagem', COALESCE(NULLIF(btrim(p.imagem), ''), 'assets/pratos/sem-imagem.svg'),
      'destaque', p.destaque,
      'disponivel', (r.porcoes IS NULL OR r.porcoes > 0),
      'porcoes', r.porcoes
    ) AS item
    FROM public.pratos p
    LEFT JOIN LATERAL (
      SELECT MIN(GREATEST(FLOOR(e.quantidade / NULLIF(pi.quantidade, 0)), 0))::int AS porcoes
      FROM public.prato_ingredientes pi
      JOIN public.estoque e ON e.id = pi.ingrediente_id
      WHERE pi.prato_id = p.id
        AND pi.quantidade > 0
    ) r ON true
    WHERE p.ativo = true
  ) t;
$$;

-- ----------------------------------------------------------------------------
-- 6. PEDIDOS (mesa) — transacional e com estoque debitado no banco
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.criar_pedido_mesa(text, jsonb);

CREATE OR REPLACE FUNCTION public.criar_pedido_mesa(p_session_token text, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mesa_id uuid;
  v_pedido_id uuid;
  v_item record;
  v_prato record;
  v_ing record;
  v_valor_total numeric(12,2) := 0;
  v_qtd_itens int := 0;
BEGIN
  v_mesa_id := public.validar_sessao_mesa(p_session_token);

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'O pedido deve possuir pelo menos um item.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_itens) > 50 THEN
    RAISE EXCEPTION 'Máximo de 50 linhas por pedido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pedidos (mesa_id, valor_total, status)
  VALUES (v_mesa_id, 0, 'Pendente')
  RETURNING id INTO v_pedido_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_itens) AS x(prato_id uuid, quantidade int, observacao text)
  LOOP
    IF v_item.prato_id IS NULL THEN
      RAISE EXCEPTION 'Item de pedido inválido.' USING ERRCODE = '22023';
    END IF;
    IF v_item.quantidade IS NULL OR v_item.quantidade < 1 OR v_item.quantidade > 50 THEN
      RAISE EXCEPTION 'Quantidade inválida (de 1 a 50 por item).' USING ERRCODE = '22023';
    END IF;

    SELECT id, preco, ativo INTO v_prato
    FROM public.pratos
    WHERE id = v_item.prato_id
    FOR SHARE;

    IF v_prato.id IS NULL OR v_prato.ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'Prato indisponível ou inativo.' USING ERRCODE = 'P0001';
    END IF;

    FOR v_ing IN
      SELECT pi.ingrediente_id, pi.quantidade AS qtd_necessaria, e.nome, e.quantidade AS qtd_estoque
      FROM public.prato_ingredientes pi
      JOIN public.estoque e ON e.id = pi.ingrediente_id
      WHERE pi.prato_id = v_prato.id
      FOR UPDATE OF e
    LOOP
      IF v_ing.qtd_estoque < (v_ing.qtd_necessaria * v_item.quantidade) THEN
        RAISE EXCEPTION 'Estoque insuficiente do insumo "%" para o prato selecionado.', v_ing.nome
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.estoque
         SET quantidade = quantidade - (v_ing.qtd_necessaria * v_item.quantidade),
             atualizado_em = now()
       WHERE id = v_ing.ingrediente_id;
    END LOOP;

    INSERT INTO public.pedido_itens (pedido_id, prato_id, quantidade, preco_unitario)
    VALUES (v_pedido_id, v_prato.id, v_item.quantidade, v_prato.preco);

    v_valor_total := v_valor_total + (v_prato.preco * v_item.quantidade);
    v_qtd_itens := v_qtd_itens + v_item.quantidade;
  END LOOP;

  UPDATE public.pedidos
     SET valor_total = v_valor_total,
         atualizado_em = now()
   WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', v_pedido_id,
    'valor_total', v_valor_total,
    'itens', v_qtd_itens,
    'status', 'Pendente'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.meus_pedidos_mesa(text);

CREATE OR REPLACE FUNCTION public.meus_pedidos_mesa(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mesa uuid;
  v_out jsonb;
BEGIN
  v_mesa := public.validar_sessao_mesa(p_session_token);

  SELECT COALESCE(jsonb_agg(o ORDER BY o->>'criado_em' DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'status', p.status,
      'valor_total', p.valor_total,
      'criado_em', p.criado_em,
      'entregue_em', p.entregue_em,
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'prato_id', pi.prato_id,
          'nome', pr.nome,
          'quantidade', pi.quantidade,
          'preco_unitario', pi.preco_unitario
        ) ORDER BY pr.nome)
        FROM public.pedido_itens pi
        JOIN public.pratos pr ON pr.id = pi.prato_id
        WHERE pi.pedido_id = p.id
      ), '[]'::jsonb)
    ) AS o
    FROM public.pedidos p
    WHERE p.mesa_id = v_mesa
      AND p.criado_em > now() - interval '30 days'
  ) t;

  RETURN v_out;
END;
$$;

DROP FUNCTION IF EXISTS public.criar_chamado_mesa(text, text);

CREATE OR REPLACE FUNCTION public.criar_chamado_mesa(p_session_token text, p_justificativa text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mesa uuid;
  v_id uuid;
  v_pendentes int;
BEGIN
  v_mesa := public.validar_sessao_mesa(p_session_token);

  IF btrim(coalesce(p_justificativa, '')) = '' THEN
    RAISE EXCEPTION 'Informe a justificativa do chamado.' USING ERRCODE = '22023';
  END IF;

  IF length(p_justificativa) > 500 THEN
    RAISE EXCEPTION 'A justificativa deve ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_pendentes
  FROM public.chamados
  WHERE mesa_id = v_mesa AND status = 'Pendente' AND criado_em > now() - interval '30 minutes';

  IF v_pendentes >= 3 THEN
    RAISE EXCEPTION 'Já existem chamados pendentes para esta mesa. Aguarde o atendimento.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chamados (mesa_id, justificativa, status)
  VALUES (v_mesa, btrim(p_justificativa), 'Pendente')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('chamado_id', v_id, 'status', 'Pendente');
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. ATENDIMENTO (funcionário)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.painel_atendimento(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_chamados jsonb;
  v_pedidos jsonb;
BEGIN
  v_id := public._exigir_funcionario(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'mesa_id', c.mesa_id,
           'mesa_nome', COALESCE(u.nome, 'Mesa'),
           'justificativa', c.justificativa,
           'status', c.status,
           'criado_em', c.criado_em
         ) ORDER BY c.criado_em), '[]'::jsonb)
  INTO v_chamados
  FROM public.chamados c
  LEFT JOIN public.usuarios u ON u.id = c.mesa_id
  WHERE c.status = 'Pendente';

  SELECT COALESCE(jsonb_agg(o ORDER BY o->>'criado_em'), '[]'::jsonb)
  INTO v_pedidos
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'mesa_id', p.mesa_id,
      'mesa_nome', COALESCE(u.nome, 'Mesa'),
      'status', p.status,
      'valor_total', p.valor_total,
      'criado_em', p.criado_em,
      'entregue_em', p.entregue_em,
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'nome', pr.nome,
          'quantidade', pi.quantidade,
          'preco_unitario', pi.preco_unitario
        ) ORDER BY pr.nome)
        FROM public.pedido_itens pi
        JOIN public.pratos pr ON pr.id = pi.prato_id
        WHERE pi.pedido_id = p.id
      ), '[]'::jsonb)
    ) AS o
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.mesa_id
    WHERE p.status IN ('Pendente', 'Em Preparo', 'Pronto')
      AND p.criado_em > now() - interval '24 hours'
  ) t;

  RETURN jsonb_build_object(
    'chamados', v_chamados,
    'pedidos', v_pedidos,
    'gerado_em', now()
  );
END;
$$;

DROP FUNCTION IF EXISTS public.atualizar_status_pedido(uuid, character varying);

CREATE OR REPLACE FUNCTION public.atualizar_status_pedido(
  p_session_token text,
  p_pedido_id uuid,
  p_novo_status varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_func uuid;
  v_pedido public.pedidos%ROWTYPE;
  v_item record;
  v_ing record;
BEGIN
  v_func := public._exigir_funcionario(p_session_token);

  IF p_novo_status NOT IN ('Em Preparo', 'Pronto', 'Entregue', 'Cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %.', p_novo_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;

  IF v_pedido.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_pedido.status = p_novo_status THEN
    RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', p_novo_status, 'alterado', false);
  END IF;

  IF v_pedido.status IN ('Entregue', 'Cancelado') THEN
    RAISE EXCEPTION 'Pedido já finalizado (%) não pode mudar de status.', v_pedido.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pedido.status = 'Pendente' AND p_novo_status IN ('Pronto', 'Entregue') THEN
    RAISE EXCEPTION 'O pedido precisa passar por "Em Preparo" antes de "Pronto/Entregue".'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pedido.status = 'Em Preparo' AND p_novo_status = 'Entregue' THEN
    RAISE EXCEPTION 'Marque o pedido como "Pronto" antes de entregá-lo.' USING ERRCODE = 'P0001';
  END IF;

  -- Estorno de estoque ao cancelar (RN-04), apenas uma vez
  IF p_novo_status = 'Cancelado' THEN
    FOR v_item IN
      SELECT prato_id, quantidade FROM public.pedido_itens WHERE pedido_id = p_pedido_id
    LOOP
      FOR v_ing IN
        SELECT ingrediente_id, quantidade FROM public.prato_ingredientes WHERE prato_id = v_item.prato_id
      LOOP
        UPDATE public.estoque
           SET quantidade = quantidade + (v_ing.quantidade * v_item.quantidade),
               atualizado_em = now()
         WHERE id = v_ing.ingrediente_id;
      END LOOP;
    END LOOP;
  END IF;

  UPDATE public.pedidos
     SET status = p_novo_status,
         entregue_em = CASE WHEN p_novo_status = 'Entregue' THEN now() ELSE entregue_em END,
         atualizado_em = now()
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'status', p_novo_status,
    'alterado', true,
    'por', (SELECT nome FROM public.usuarios WHERE id = v_func)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_chamado(p_session_token text, p_chamado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_func uuid;
  v_chamado public.chamados%ROWTYPE;
BEGIN
  v_func := public._exigir_funcionario(p_session_token);

  SELECT * INTO v_chamado FROM public.chamados WHERE id = p_chamado_id FOR UPDATE;

  IF v_chamado.id IS NULL THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_chamado.status <> 'Pendente' THEN
    RETURN jsonb_build_object('chamado_id', p_chamado_id, 'status', v_chamado.status);
  END IF;

  UPDATE public.chamados
     SET status = 'Atendido', atendido_em = now()
   WHERE id = p_chamado_id;

  RETURN jsonb_build_object('chamado_id', p_chamado_id, 'status', 'Atendido');
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. ESTOQUE (gerente)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_estoque(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_out jsonb;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'nome', e.nome,
           'quantidade', e.quantidade,
           'unidade', e.unidade,
           'atualizado_em', e.atualizado_em,
           'pratos_vinculados', (
              SELECT count(*) FROM public.prato_ingredientes pi WHERE pi.ingrediente_id = e.id
           )
         ) ORDER BY e.nome), '[]'::jsonb)
  INTO v_out
  FROM public.estoque e;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_ingrediente(
  p_session_token text,
  p_id uuid,
  p_nome text,
  p_unidade text,
  p_quantidade numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_id uuid;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  IF btrim(coalesce(p_nome, '')) = '' THEN
    RAISE EXCEPTION 'Informe o nome do insumo.' USING ERRCODE = '22023';
  END IF;

  IF p_unidade NOT IN ('kg', 'g', 'un', 'l', 'ml') THEN
    RAISE EXCEPTION 'Unidade inválida. Use kg, g, un, l ou ml.' USING ERRCODE = '22023';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'A quantidade não pode ser negativa.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.estoque (nome, unidade, quantidade)
    VALUES (btrim(p_nome), p_unidade, p_quantidade)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.estoque
       SET nome = btrim(p_nome),
           unidade = p_unidade,
           quantidade = p_quantidade,
           atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Insumo não encontrado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'mensagem', 'Insumo salvo com sucesso.');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um insumo com este nome.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_ingrediente(p_session_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_vinculos int;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT count(*) INTO v_vinculos
  FROM public.prato_ingredientes WHERE ingrediente_id = p_id;

  IF v_vinculos > 0 THEN
    RAISE EXCEPTION 'Este insumo é usado em % prato(s). Remova-o da ficha técnica antes de excluir.', v_vinculos
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.estoque WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('mensagem', 'Insumo excluído.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. PRATOS / FICHA TÉCNICA (gerente)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_pratos_admin(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_out jsonb;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'nome', p.nome,
           'descricao', COALESCE(p.descricao, ''),
           'preco', p.preco,
           'imagem', COALESCE(p.imagem, ''),
           'destaque', p.destaque,
           'ativo', p.ativo,
           'disponivel', (r.porcoes IS NULL OR r.porcoes > 0),
           'porcoes', r.porcoes,
           'receita', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'ingrediente_id', pi.ingrediente_id,
                'nome', e.nome,
                'unidade', e.unidade,
                'quantidade', pi.quantidade
              ) ORDER BY e.nome)
              FROM public.prato_ingredientes pi
              JOIN public.estoque e ON e.id = pi.ingrediente_id
              WHERE pi.prato_id = p.id
           ), '[]'::jsonb)
         ) ORDER BY p.nome), '[]'::jsonb)
  INTO v_out
  FROM public.pratos p
  LEFT JOIN LATERAL (
    SELECT MIN(GREATEST(FLOOR(e.quantidade / NULLIF(pi.quantidade, 0)), 0))::int AS porcoes
    FROM public.prato_ingredientes pi
    JOIN public.estoque e ON e.id = pi.ingrediente_id
    WHERE pi.prato_id = p.id AND pi.quantidade > 0
  ) r ON true;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_prato(
  p_session_token text,
  p_id uuid,
  p_dados jsonb,
  p_receita jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_id uuid;
  v_nome text;
  v_descricao text;
  v_preco numeric;
  v_imagem text;
  v_destaque boolean;
  v_ativo boolean;
  v_item jsonb;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  v_nome := btrim(coalesce(p_dados->>'nome', ''));
  v_descricao := coalesce(p_dados->>'descricao', '');
  v_preco := NULLIF(p_dados->>'preco', '')::numeric;
  v_imagem := btrim(coalesce(p_dados->>'imagem', ''));
  v_destaque := COALESCE((p_dados->>'destaque')::boolean, false);
  v_ativo := COALESCE((p_dados->>'ativo')::boolean, true);

  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome do prato.' USING ERRCODE = '22023';
  END IF;

  IF v_preco IS NULL OR v_preco < 0 THEN
    RAISE EXCEPTION 'Informe um preço válido.' USING ERRCODE = '22023';
  END IF;

  IF p_receita IS NOT NULL AND jsonb_typeof(p_receita) <> 'array' THEN
    RAISE EXCEPTION 'A ficha técnica deve ser uma lista de insumos.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.pratos (nome, descricao, preco, imagem, destaque, ativo)
    VALUES (v_nome, v_descricao, v_preco, v_imagem, v_destaque, v_ativo)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.pratos
       SET nome = v_nome,
           descricao = v_descricao,
           preco = v_preco,
           imagem = v_imagem,
           destaque = v_destaque,
           ativo = v_ativo
     WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Prato não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.prato_ingredientes WHERE prato_id = v_id;
  END IF;

  IF p_receita IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_receita)
    LOOP
      IF (v_item->>'ingrediente_id') IS NULL OR NULLIF(v_item->>'quantidade', '') IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.prato_ingredientes (prato_id, ingrediente_id, quantidade)
      VALUES (
        v_id,
        (v_item->>'ingrediente_id')::uuid,
        (v_item->>'quantidade')::numeric
      )
      ON CONFLICT (prato_id, ingrediente_id)
      DO UPDATE SET quantidade = EXCLUDED.quantidade;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'mensagem', 'Prato salvo com sucesso.');
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Insumo da ficha técnica não encontrado.' USING ERRCODE = '23503';
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_prato(p_session_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_usos int;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT count(*) INTO v_usos FROM public.pedido_itens WHERE prato_id = p_id;

  IF v_usos > 0 THEN
    UPDATE public.pratos SET ativo = false WHERE id = p_id;
    RETURN jsonb_build_object(
      'id', p_id,
      'mensagem', 'Prato possui pedidos no histórico e foi inativado (não removido).'
    );
  END IF;

  DELETE FROM public.prato_ingredientes WHERE prato_id = p_id;
  DELETE FROM public.pratos WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prato não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', p_id, 'mensagem', 'Prato removido do cardápio.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. CONTAS (gerente)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_contas(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_out jsonb;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'tipo', u.tipo,
           'nome', u.nome,
           'login', u.login,
           'perfil', COALESCE(u.perfil, u.tipo),
           'ativo', u.ativo,
           'criado_em', u.criado_em,
           'tem_senha', (u.senha_hash IS NOT NULL)
         ) ORDER BY u.tipo, u.nome), '[]'::jsonb)
  INTO v_out
  FROM public.usuarios u;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_conta(
  p_session_token text,
  p_id uuid,
  p_tipo text,
  p_nome text,
  p_login text,
  p_senha text,
  p_perfil text,
  p_ativo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_id uuid;
  v_perfil text;
  v_login text;
  v_gerentes_ativos int;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  IF p_tipo NOT IN ('mesa', 'funcionario') THEN
    RAISE EXCEPTION 'Tipo de conta inválido.' USING ERRCODE = '22023';
  END IF;

  v_login := btrim(coalesce(p_login, ''));
  IF btrim(coalesce(p_nome, '')) = '' OR v_login = '' THEN
    RAISE EXCEPTION 'Informe o nome e o login da conta.' USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'funcionario' THEN
    v_perfil := COALESCE(NULLIF(p_perfil, ''), 'atendente');
    IF v_perfil NOT IN ('atendente', 'gerente') THEN
      RAISE EXCEPTION 'Perfil inválido para funcionário.' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_perfil := NULL; -- mesas não possuem perfil de permissão
  END IF;

  IF p_id IS NULL THEN
    IF length(coalesce(p_senha, '')) < 6 THEN
      RAISE EXCEPTION 'Defina uma senha com no mínimo 6 caracteres.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.usuarios (tipo, nome, login, perfil, ativo, senha_hash, senha_atualizada_em)
    VALUES (
      p_tipo,
      btrim(p_nome),
      v_login,
      v_perfil,
      COALESCE(p_ativo, true),
      extensions.crypt(p_senha, extensions.gen_salt('bf', 11)),
      now()
    )
    RETURNING id INTO v_id;
  ELSE
    IF p_id = v_gerente AND COALESCE(p_ativo, true) = false THEN
      RAISE EXCEPTION 'Você não pode inativar a própria conta.' USING ERRCODE = '42501';
    END IF;

    IF p_id = v_gerente AND v_perfil IS DISTINCT FROM 'gerente' THEN
      RAISE EXCEPTION 'Você não pode remover seu próprio perfil de gerente.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_gerentes_ativos
    FROM public.usuarios
    WHERE tipo = 'funcionario' AND perfil = 'gerente' AND ativo = true AND id <> p_id;

    IF v_perfil IS DISTINCT FROM 'gerente' OR COALESCE(p_ativo, true) = false THEN
      IF v_gerentes_ativos = 0 AND EXISTS (
        SELECT 1 FROM public.usuarios WHERE id = p_id AND perfil = 'gerente'
      ) THEN
        RAISE EXCEPTION 'O sistema precisa de pelo menos um gerente ativo.' USING ERRCODE = '42501';
      END IF;
    END IF;

    UPDATE public.usuarios
       SET tipo = p_tipo,
           nome = btrim(p_nome),
           login = v_login,
           perfil = v_perfil,
           ativo = COALESCE(p_ativo, true),
           senha_hash = CASE
             WHEN length(coalesce(p_senha, '')) >= 6
               THEN extensions.crypt(p_senha, extensions.gen_salt('bf', 11))
             ELSE senha_hash
           END,
           senha_atualizada_em = CASE
             WHEN length(coalesce(p_senha, '')) >= 6 THEN now()
             ELSE senha_atualizada_em
           END,
           atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(p_ativo, true) = false OR p_tipo <> 'funcionario' OR v_perfil IS DISTINCT FROM 'gerente' THEN
      UPDATE public.sessoes_funcionario SET ativa = false WHERE funcionario_id = p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'mensagem', 'Conta salva com sucesso.');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este login já está em uso.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_status_conta(p_session_token text, p_id uuid, p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_alvo public.usuarios%ROWTYPE;
  v_outros int;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT * INTO v_alvo FROM public.usuarios WHERE id = p_id FOR UPDATE;
  IF v_alvo.id IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_id = v_gerente AND p_ativo = false THEN
    RAISE EXCEPTION 'Você não pode inativar a própria conta.' USING ERRCODE = '42501';
  END IF;

  IF v_alvo.perfil = 'gerente' AND p_ativo = false THEN
    SELECT count(*) INTO v_outros
    FROM public.usuarios
    WHERE perfil = 'gerente' AND ativo = true AND id <> p_id;

    IF v_outros = 0 THEN
      RAISE EXCEPTION 'O sistema precisa de pelo menos um gerente ativo.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.usuarios
     SET ativo = p_ativo, atualizado_em = now()
   WHERE id = p_id;

  IF p_ativo = false THEN
    UPDATE public.sessoes_mesa SET ativa = false WHERE mesa_id = p_id;
    UPDATE public.sessoes_funcionario SET ativa = false WHERE funcionario_id = p_id;
  END IF;

  RETURN jsonb_build_object('id', p_id, 'ativo', p_ativo);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_conta(p_session_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_alvo public.usuarios%ROWTYPE;
  v_refs int;
  v_outros int;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  IF p_id = v_gerente THEN
    RAISE EXCEPTION 'Você não pode excluir a própria conta.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alvo FROM public.usuarios WHERE id = p_id FOR UPDATE;
  IF v_alvo.id IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_alvo.perfil = 'gerente' THEN
    SELECT count(*) INTO v_outros
    FROM public.usuarios WHERE perfil = 'gerente' AND ativo = true AND id <> p_id;
    IF v_outros = 0 THEN
      RAISE EXCEPTION 'O sistema precisa de pelo menos um gerente ativo.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT (
    (SELECT count(*) FROM public.pedidos WHERE mesa_id = p_id) +
    (SELECT count(*) FROM public.chamados WHERE mesa_id = p_id)
  ) INTO v_refs;

  IF v_refs > 0 THEN
    UPDATE public.usuarios SET ativo = false, atualizado_em = now() WHERE id = p_id;
    UPDATE public.sessoes_mesa SET ativa = false WHERE mesa_id = p_id;
    UPDATE public.sessoes_funcionario SET ativa = false WHERE funcionario_id = p_id;
    RETURN jsonb_build_object(
      'id', p_id,
      'mensagem', 'Conta possui histórico e foi inativada em vez de excluída.'
    );
  END IF;

  DELETE FROM public.usuarios WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'mensagem', 'Conta excluída.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. FATURAMENTO (gerente) — RN-08 e RN-09
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.relatorio_faturamento(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.relatorio_faturamento(
  p_session_token text,
  p_data_inicio timestamptz,
  p_data_fim timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_total numeric := 0;
  v_qtd int := 0;
  v_ticket numeric := 0;
  v_cancelados int := 0;
  v_top jsonb;
  v_log jsonb;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim <= p_data_inicio THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO v_total, v_qtd
  FROM public.pedidos
  WHERE status = 'Entregue'
    AND entregue_em >= p_data_inicio
    AND entregue_em < p_data_fim;

  IF v_qtd > 0 THEN
    v_ticket := ROUND(v_total / v_qtd, 2);
  END IF;

  SELECT COUNT(*) INTO v_cancelados
  FROM public.pedidos
  WHERE status = 'Cancelado'
    AND criado_em >= p_data_inicio
    AND criado_em < p_data_fim;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'nome', nome,
           'quantidade', qtd,
           'receita', receita
         ) ORDER BY qtd DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT pr.nome,
           SUM(pi.quantidade)::int AS qtd,
           SUM(pi.quantidade * pi.preco_unitario) AS receita
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.pratos pr ON pr.id = pi.prato_id
    WHERE p.status = 'Entregue'
      AND p.entregue_em >= p_data_inicio
      AND p.entregue_em < p_data_fim
    GROUP BY pr.nome
    ORDER BY qtd DESC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'mesa_nome', COALESCE(u.nome, 'Mesa'),
           'status', p.status,
           'valor_total', p.valor_total,
           'criado_em', p.criado_em,
           'entregue_em', p.entregue_em
         ) ORDER BY p.criado_em DESC), '[]'::jsonb)
  INTO v_log
  FROM public.pedidos p
  LEFT JOIN public.usuarios u ON u.id = p.mesa_id
  WHERE p.criado_em >= p_data_inicio
    AND p.criado_em < p_data_fim;

  RETURN jsonb_build_object(
    'faturamento_total', v_total,
    'qtd_pedidos', v_qtd,
    'ticket_medio', v_ticket,
    'qtd_cancelados', v_cancelados,
    'pratos_mais_vendidos', v_top,
    'pedidos', v_log,
    'periodo', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. BACKUP (gerente) — RF-41 / RF-42
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backup_exportar(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'sistema', 'NeoOrder',
      'versao', '2.0',
      'exportado_em', now(),
      'exportado_por', (SELECT nome FROM public.usuarios WHERE id = v_id)
    ),
    'tabelas', jsonb_build_object(
      'usuarios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'tipo', tipo, 'nome', nome, 'login', login,
          'perfil', perfil, 'ativo', ativo, 'criado_em', criado_em
        ) ORDER BY nome) FROM public.usuarios
      ), '[]'::jsonb),
      'estoque', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'nome', nome, 'quantidade', quantidade, 'unidade', unidade,
          'criado_em', criado_em, 'atualizado_em', atualizado_em
        ) ORDER BY nome) FROM public.estoque
      ), '[]'::jsonb),
      'pratos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'nome', nome, 'descricao', descricao, 'preco', preco,
          'imagem', imagem, 'destaque', destaque, 'ativo', ativo, 'criado_em', criado_em
        ) ORDER BY nome) FROM public.pratos
      ), '[]'::jsonb),
      'prato_ingredientes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'prato_id', prato_id, 'ingrediente_id', ingrediente_id, 'quantidade', quantidade
        )) FROM public.prato_ingredientes
      ), '[]'::jsonb),
      'pedidos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'mesa_id', mesa_id, 'valor_total', valor_total, 'status', status,
          'criado_em', criado_em, 'atualizado_em', atualizado_em, 'entregue_em', entregue_em
        ) ORDER BY criado_em) FROM public.pedidos
      ), '[]'::jsonb),
      'pedido_itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'pedido_id', pedido_id, 'prato_id', prato_id,
          'quantidade', quantidade, 'preco_unitario', preco_unitario
        )) FROM public.pedido_itens
      ), '[]'::jsonb),
      'chamados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'mesa_id', mesa_id, 'justificativa', justificativa,
          'status', status, 'criado_em', criado_em, 'atendido_em', atendido_em
        ) ORDER BY criado_em) FROM public.chamados
      ), '[]'::jsonb),
      'clientes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'nome', nome, 'telefone', telefone, 'total_visitas', total_visitas,
          'pontos', pontos, 'criado_em', criado_em, 'ultimo_acesso_em', ultimo_acesso_em
        ) ORDER BY nome) FROM public.clientes
      ), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backup_importar(
  p_session_token text,
  p_payload jsonb,
  p_modo text DEFAULT 'merge'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_tabelas jsonb;
  v_total int := 0;
BEGIN
  v_id := public._exigir_gerente(p_session_token);

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Arquivo de backup inválido.' USING ERRCODE = '22023';
  END IF;

  v_tabelas := p_payload->'tabelas';
  IF v_tabelas IS NULL OR jsonb_typeof(v_tabelas) <> 'object' THEN
    RAISE EXCEPTION 'O backup não contém a chave "tabelas".' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_modo, 'merge') NOT IN ('merge', 'replace') THEN
    RAISE EXCEPTION 'Modo de importação inválido (use merge ou replace).' USING ERRCODE = '22023';
  END IF;

  IF p_modo = 'replace' THEN
    DELETE FROM public.pedido_itens;
    DELETE FROM public.pedidos;
    DELETE FROM public.chamados;
    DELETE FROM public.prato_ingredientes;
    DELETE FROM public.pratos;
    DELETE FROM public.estoque;
  END IF;

  -- Insumos
  INSERT INTO public.estoque (id, nome, quantidade, unidade, criado_em, atualizado_em)
  SELECT x.id, x.nome, x.quantidade, x.unidade,
         COALESCE(x.criado_em, now()), COALESCE(x.atualizado_em, now())
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'estoque', '[]'::jsonb))
    AS x(id uuid, nome varchar, quantidade numeric, unidade varchar,
         criado_em timestamptz, atualizado_em timestamptz)
  ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome, quantidade = EXCLUDED.quantidade,
        unidade = EXCLUDED.unidade, atualizado_em = now();
  GET DIAGNOSTICS v_total = ROW_COUNT;

  -- Pratos
  INSERT INTO public.pratos (id, nome, descricao, preco, imagem, destaque, ativo, criado_em)
  SELECT x.id, x.nome, x.descricao, x.preco, x.imagem,
         COALESCE(x.destaque, false), COALESCE(x.ativo, true), COALESCE(x.criado_em, now())
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'pratos', '[]'::jsonb))
    AS x(id uuid, nome varchar, descricao text, preco numeric, imagem text,
         destaque boolean, ativo boolean, criado_em timestamptz)
  ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, preco = EXCLUDED.preco,
        imagem = EXCLUDED.imagem, destaque = EXCLUDED.destaque, ativo = EXCLUDED.ativo;

  -- Ficha técnica
  INSERT INTO public.prato_ingredientes (prato_id, ingrediente_id, quantidade)
  SELECT x.prato_id, x.ingrediente_id, x.quantidade
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'prato_ingredientes', '[]'::jsonb))
    AS x(prato_id uuid, ingrediente_id uuid, quantidade numeric)
  ON CONFLICT (prato_id, ingrediente_id) DO UPDATE SET quantidade = EXCLUDED.quantidade;

  -- Pedidos
  INSERT INTO public.pedidos (id, mesa_id, valor_total, status, criado_em, atualizado_em, entregue_em)
  SELECT x.id, x.mesa_id, x.valor_total, x.status,
         COALESCE(x.criado_em, now()), COALESCE(x.atualizado_em, now()), x.entregue_em
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'pedidos', '[]'::jsonb))
    AS x(id uuid, mesa_id uuid, valor_total numeric, status varchar,
         criado_em timestamptz, atualizado_em timestamptz, entregue_em timestamptz)
  ON CONFLICT (id) DO UPDATE
    SET status = EXCLUDED.status, valor_total = EXCLUDED.valor_total,
        entregue_em = EXCLUDED.entregue_em, atualizado_em = now();

  -- Itens
  INSERT INTO public.pedido_itens (id, pedido_id, prato_id, quantidade, preco_unitario)
  SELECT x.id, x.pedido_id, x.prato_id, x.quantidade, x.preco_unitario
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'pedido_itens', '[]'::jsonb))
    AS x(id uuid, pedido_id uuid, prato_id uuid, quantidade int, preco_unitario numeric)
  ON CONFLICT (id) DO NOTHING;

  -- Chamados
  INSERT INTO public.chamados (id, mesa_id, justificativa, status, criado_em, atendido_em)
  SELECT x.id, x.mesa_id, x.justificativa, x.status,
         COALESCE(x.criado_em, now()), x.atendido_em
  FROM jsonb_to_recordset(COALESCE(v_tabelas->'chamados', '[]'::jsonb))
    AS x(id uuid, mesa_id uuid, justificativa text, status varchar,
         criado_em timestamptz, atendido_em timestamptz)
  ON CONFLICT (id) DO UPDATE
    SET status = EXCLUDED.status, atendido_em = EXCLUDED.atendido_em;

  RETURN jsonb_build_object(
    'mensagem', 'Backup importado com sucesso.',
    'modo', p_modo,
    'insumos_processados', v_total
  );
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Backup inconsistente: existem referências a registros inexistentes.' USING ERRCODE = '23503';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Backup inconsistente: valores inválidos em status, tipo ou quantidade.' USING ERRCODE = '23514';
END;
$$;

-- ----------------------------------------------------------------------------
-- 13. SEED DE DEMONSTRAÇÃO (idempotente; apenas dados de exemplo)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_dados_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Insumos base
  INSERT INTO public.estoque (nome, unidade, quantidade) VALUES
    ('Arroz branco', 'kg', 20),
    ('Feijão preto', 'kg', 12),
    ('Linguiça calabresa', 'kg', 6),
    ('Filé mignon', 'kg', 8),
    ('Farofa pronta', 'kg', 5),
    ('Cogumelo paris', 'kg', 4),
    ('Cogumelo shimeji', 'kg', 3),
    ('Arroz arbóreo', 'kg', 10),
    ('Queijo parmesão', 'kg', 4),
    ('Manteiga', 'kg', 6),
    ('Massa spaghetti', 'kg', 8),
    ('Guanciale', 'kg', 4),
    ('Ovos', 'un', 120),
    ('Queijo pecorino', 'kg', 3),
    ('Pão brioche', 'un', 40),
    ('Blend angus 180g', 'un', 40),
    ('Queijo cheddar', 'kg', 4),
    ('Bacon', 'kg', 4),
    ('Batata', 'kg', 20),
    ('Salmão fresco', 'kg', 6),
    ('Aspargos', 'kg', 4),
    ('Farinha de trigo', 'kg', 15),
    ('Molho de tomate', 'l', 8),
    ('Queijo mussarela', 'kg', 8),
    ('Queijo gorgonzola', 'kg', 3),
    ('Queijo provolone', 'kg', 3),
    ('Manjericão', 'un', 20)
  ON CONFLICT (nome) DO NOTHING;

  -- Pratos (idempotente: pratos não têm índice único em nome)
  INSERT INTO public.pratos (nome, descricao, preco, imagem, destaque, ativo)
  SELECT v.nome, v.descricao, v.preco, v.imagem, v.destaque, true
  FROM (VALUES
    ('Arroz com Feijão Preto', 'Arroz branco soltinho, feijão preto encorpado com linguiça, filé mignon grelhado e farofa da casa.', 35.00, 'assets/pratos/arroz-feijao-preto.jpg', true),
    ('Cogumelos Salteados', 'Mix de cogumelos paris e shimeji salteados na manteiga com alho, ervas e parmesão.', 50.00, 'assets/pratos/cogumelos-salteados.jpg', false),
    ('Pizza de 4 Queijos', 'Massa artesanal de fermentação natural com mussarela, gorgonzola, provolone e parmesão.', 70.00, 'assets/pratos/pizza-quatro-queijos.jpg', true),
    ('Risoto de Cogumelos', 'Arroz arbóreo cremoso com cogumelos frescos, manteiga e parmesão, finalizado com ervas.', 90.00, 'assets/pratos/risoto-cogumelos.jpg', true),
    ('Filé Mignon ao Roti', 'Medalhão de filé mignon com molho roti, batatas rústicas e aspargos salteados.', 89.90, 'assets/pratos/file-mignon.jpg', true),
    ('Salmão Grelhado', 'Posta de salmão grelhado com manteiga de ervas, alcaparras e aspargos ao vapor.', 98.00, 'assets/pratos/salmao-grelhado.jpg', false),
    ('Pasta Carbonara', 'Spaghetti com guanciale crocante, gemas, pecorino romano e pimenta-do-reino.', 49.00, 'assets/pratos/pasta-carbonara.jpg', false),
    ('Burger Artesanal NeoOrder', 'Blend angus 180g, cheddar, bacon crocante e maionese da casa no pão brioche, com batatas rústicas.', 42.00, 'assets/pratos/burger-artesanal.jpg', false)
  ) AS v(nome, descricao, preco, imagem, destaque)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pratos p WHERE lower(p.nome) = lower(v.nome)
  );

  -- Ficha técnica (quantidade por porção)
  INSERT INTO public.prato_ingredientes (prato_id, ingrediente_id, quantidade)
  SELECT p.id, e.id, r.qtd
  FROM (VALUES
    ('Arroz com Feijão Preto', 'Arroz branco', 0.15),
    ('Arroz com Feijão Preto', 'Feijão preto', 0.12),
    ('Arroz com Feijão Preto', 'Linguiça calabresa', 0.08),
    ('Arroz com Feijão Preto', 'Filé mignon', 0.10),
    ('Arroz com Feijão Preto', 'Farofa pronta', 0.05),
    ('Cogumelos Salteados', 'Cogumelo paris', 0.15),
    ('Cogumelos Salteados', 'Cogumelo shimeji', 0.10),
    ('Cogumelos Salteados', 'Manteiga', 0.02),
    ('Cogumelos Salteados', 'Queijo parmesão', 0.02),
    ('Pizza de 4 Queijos', 'Farinha de trigo', 0.25),
    ('Pizza de 4 Queijos', 'Queijo mussarela', 0.15),
    ('Pizza de 4 Queijos', 'Queijo gorgonzola', 0.05),
    ('Pizza de 4 Queijos', 'Queijo provolone', 0.05),
    ('Pizza de 4 Queijos', 'Molho de tomate', 0.10),
    ('Pizza de 4 Queijos', 'Manjericão', 3),
    ('Risoto de Cogumelos', 'Arroz arbóreo', 0.10),
    ('Risoto de Cogumelos', 'Cogumelo paris', 0.08),
    ('Risoto de Cogumelos', 'Cogumelo shimeji', 0.06),
    ('Risoto de Cogumelos', 'Queijo parmesão', 0.03),
    ('Risoto de Cogumelos', 'Manteiga', 0.02),
    ('Filé Mignon ao Roti', 'Filé mignon', 0.20),
    ('Filé Mignon ao Roti', 'Batata', 0.15),
    ('Filé Mignon ao Roti', 'Aspargos', 0.08),
    ('Filé Mignon ao Roti', 'Manteiga', 0.02),
    ('Salmão Grelhado', 'Salmão fresco', 0.22),
    ('Salmão Grelhado', 'Aspargos', 0.08),
    ('Salmão Grelhado', 'Manteiga', 0.02),
    ('Pasta Carbonara', 'Massa spaghetti', 0.12),
    ('Pasta Carbonara', 'Guanciale', 0.05),
    ('Pasta Carbonara', 'Ovos', 1),
    ('Pasta Carbonara', 'Queijo pecorino', 0.03),
    ('Burger Artesanal NeoOrder', 'Pão brioche', 1),
    ('Burger Artesanal NeoOrder', 'Blend angus 180g', 1),
    ('Burger Artesanal NeoOrder', 'Queijo cheddar', 0.04),
    ('Burger Artesanal NeoOrder', 'Bacon', 0.04),
    ('Burger Artesanal NeoOrder', 'Batata', 0.15)
  ) AS r(prato, insumo, qtd)
  JOIN public.pratos p ON lower(p.nome) = lower(r.prato)
  JOIN public.estoque e ON lower(e.nome) = lower(r.insumo)
  ON CONFLICT (prato_id, ingrediente_id) DO UPDATE SET quantidade = EXCLUDED.quantidade;

  -- Contas de demonstração (devem ser trocadas em produção)
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(login) = 'gerente') THEN
    INSERT INTO public.usuarios (tipo, nome, login, perfil, ativo, senha_hash, senha_atualizada_em)
    VALUES ('funcionario', 'Gerente NeoOrder', 'gerente', 'gerente', true,
            extensions.crypt('gerente123', extensions.gen_salt('bf', 11)), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(login) = 'atendente') THEN
    INSERT INTO public.usuarios (tipo, nome, login, perfil, ativo, senha_hash, senha_atualizada_em)
    VALUES ('funcionario', 'Atendente NeoOrder', 'atendente', 'atendente', true,
            extensions.crypt('atendente123', extensions.gen_salt('bf', 11)), now());
  END IF;

  INSERT INTO public.usuarios (tipo, nome, login, perfil, ativo, senha_hash, senha_atualizada_em)
  SELECT 'mesa', 'Mesa ' || lpad(n::text, 2, '0'), 'Mesa ' || lpad(n::text, 2, '0'), NULL, true,
         extensions.crypt('mesa123', extensions.gen_salt('bf', 11)), now()
  FROM generate_series(1, 6) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE lower(u.login) = lower('Mesa ' || lpad(n::text, 2, '0'))
  );

  RETURN jsonb_build_object('mensagem', 'Dados de demonstração aplicados.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 14. SEGURANÇA: acesso às tabelas apenas via RPC
-- ----------------------------------------------------------------------------

-- Remove todas as políticas antigas (inclusive as permissivas com USING true)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_mesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_tentativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prato_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso direto às tabelas para papéis públicos
-- (inclui PUBLIC: o GRANT padrão do PostgreSQL vale para todos os papéis)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Funções legadas que não devem ser expostas
REVOKE EXECUTE ON FUNCTION public.identificar_cliente_fidelidade(varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_qr_code_mesa(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.iniciar_sessao_mesa(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.eh_funcionario() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.eh_gerente() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_funcionario() FROM PUBLIC, anon, authenticated;

-- Helpers internos não devem ser chamáveis diretamente
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._exigir_funcionario(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._exigir_gerente(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.funcionario_da_sessao(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_sessao_mesa(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_dados_demo() FROM PUBLIC, anon, authenticated;

-- API pública (EXECUTE explícito)
GRANT EXECUTE ON FUNCTION public.pratos_cardapio() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autenticar_usuario(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_precisa_bootstrap() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_gerente_inicial(text, text, text) TO anon, authenticated;

-- API da mesa
GRANT EXECUTE ON FUNCTION public.criar_pedido_mesa(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meus_pedidos_mesa(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_chamado_mesa(text, text) TO anon, authenticated;

-- API do atendimento
GRANT EXECUTE ON FUNCTION public.painel_atendimento(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_pedido(text, uuid, varchar) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_chamado(text, uuid) TO anon, authenticated;

-- API da gerência
GRANT EXECUTE ON FUNCTION public.listar_estoque(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_ingrediente(text, uuid, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_ingrediente(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_pratos_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_prato(text, uuid, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_prato(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_contas(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_conta(text, uuid, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_status_conta(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_conta(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_faturamento(text, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_exportar(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_importar(text, jsonb, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 15. IMAGENS E DADOS LEGADOS: padronizar pratos criados manualmente
-- ----------------------------------------------------------------------------

UPDATE public.pratos SET
  nome = 'Arroz com Feijão Preto',
  descricao = 'Arroz branco soltinho, feijão preto encorpado com linguiça, filé mignon grelhado e farofa da casa.',
  preco = 35.00,
  imagem = 'assets/pratos/arroz-feijao-preto.jpg',
  destaque = true
WHERE lower(nome) = 'arroz com feijão preto';

UPDATE public.pratos SET
  nome = 'Cogumelos Salteados',
  descricao = 'Mix de cogumelos paris e shimeji salteados na manteiga com alho, ervas e parmesão.',
  preco = 50.00,
  imagem = 'assets/pratos/cogumelos-salteados.jpg'
WHERE lower(nome) = 'cogumelos';

UPDATE public.pratos SET
  nome = 'Pizza de 4 Queijos',
  descricao = 'Massa artesanal de fermentação natural com mussarela, gorgonzola, provolone e parmesão.',
  preco = 70.00,
  imagem = 'assets/pratos/pizza-quatro-queijos.jpg',
  destaque = true
WHERE lower(nome) = 'pizza de 4 queijos';

UPDATE public.pratos SET
  nome = 'Risoto de Cogumelos',
  descricao = 'Arroz arbóreo cremoso com cogumelos frescos, manteiga e parmesão, finalizado com ervas.',
  preco = 90.00,
  imagem = 'assets/pratos/risoto-cogumelos.jpg'
WHERE lower(nome) = 'risoto';

UPDATE public.pratos SET imagem = 'assets/pratos/arroz-feijao-preto.jpg'
WHERE lower(nome) LIKE 'arroz com feij%' AND (imagem IS NULL OR btrim(imagem) = '');

UPDATE public.pratos SET imagem = 'assets/pratos/cogumelos-salteados.jpg'
WHERE lower(nome) LIKE 'cogumelos%' AND (imagem IS NULL OR btrim(imagem) = '');

UPDATE public.pratos SET imagem = 'assets/pratos/pizza-quatro-queijos.jpg'
WHERE lower(nome) LIKE 'pizza%' AND (imagem IS NULL OR btrim(imagem) = '');

UPDATE public.pratos SET imagem = 'assets/pratos/risoto-cogumelos.jpg'
WHERE lower(nome) LIKE 'risoto%' AND (imagem IS NULL OR btrim(imagem) = '');

-- Pratos de teste automatizados: saem do cardápio (histórico preservado)
UPDATE public.pratos SET ativo = false
WHERE nome ILIKE 'Prato Teste%';

COMMENT ON FUNCTION public.pratos_cardapio() IS
  'Cardápio público com disponibilidade calculada (RN-02) sem expor quantidades de estoque (RF-25).';
COMMENT ON FUNCTION public.criar_pedido_mesa(text, jsonb) IS
  'Cria pedido com débito atômico de estoque e preço lido do banco (RN-03).';
COMMENT ON FUNCTION public.atualizar_status_pedido(text, uuid, varchar) IS
  'Atualiza status com estorno de estoque no cancelamento (RN-04) e grava entregue_em.';
