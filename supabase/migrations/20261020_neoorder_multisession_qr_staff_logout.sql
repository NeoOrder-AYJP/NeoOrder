-- ============================================================================
-- NeoOrder — Migração 20261020: múltiplas sessões, QR de staff e logout com senha
-- Data: 2026-10-20
--
-- Prioridades:
--  1. Permitir múltiplas sessões simultâneas por usuário (não invalidar anteriores)
--  2. QR Codes individuais para gerente e atendente (tokens seguros, revogáveis)
--  3. Exigir senha de staff (gerente/atendente) para encerrar sessão de mesa
--
-- Esta migração é idempotente e não destrói dados existentes.
-- IMPORTANTE: revisar e aplicar manualmente no Supabase (não aplica automaticamente).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 0. Garantir colunas de QR (podem já existir no banco de produção mas não
--    estavam na migração 20261017)
-- ----------------------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS qr_code_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_token_hash text;
-- Índice para busca por hash do QR (consultado em iniciar_sessao_* )
CREATE INDEX IF NOT EXISTS idx_usuarios_qr_token_hash ON public.usuarios (qr_token_hash) WHERE qr_token_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. MÚLTIPLAS SESSÕES SIMULTÂNEAS
--    - Remover o comportamento de invalidar sessões anteriores no login
--    - Gerar QR da mesa não deve mais encerrar sessões ativas
-- ----------------------------------------------------------------------------

-- Autenticar usuário: versão sem UPDATE ativa=false (permitindo N sessões)
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

  DELETE FROM public.login_tentativas WHERE login = v_login AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, true);
  DELETE FROM public.login_tentativas WHERE login = v_login AND criado_em < now() - interval '2 days';

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + interval '12 hours';

  IF v_user.tipo = 'mesa' THEN
    v_tipo_sessao := 'mesa';
    -- P1: não inativar sessões anteriores; cada dispositivo tem token independente
    INSERT INTO public.sessoes_mesa (mesa_id, session_token_hash, expira_em, ativa)
    VALUES (v_user.id, public._hash_token(v_token), v_expira, true);
  ELSE
    v_tipo_sessao := 'funcionario';
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
COMMENT ON FUNCTION public.autenticar_usuario(text,text) IS 'Autentica com bcrypt e cria sessão sem invalidar sessões anteriores (multi-dispositivo). Bloqueio de força bruta preservado.';

-- ----------------------------------------------------------------------------
-- 2. QR CODE DA MESA: redefinir para NÃO encerrar sessões ao gerar
--    (mantém compatibilidade com contrato anterior, apenas remove side-effect)
--    Se as funções já existem no banco com comportamento antigo, esta redefinição
--    substitui para o comportamento P1.
-- ----------------------------------------------------------------------------

-- Necessário garantir que as funções existam antes de redefinir; se não existirem,
-- a criação abaixo as provisiona com comportamento correto P1+P2.

CREATE OR REPLACE FUNCTION public.gerar_qr_code_mesa(p_session_token text, p_mesa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_mesa public.usuarios%ROWTYPE;
  v_token text;
  v_url text;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT * INTO v_mesa FROM public.usuarios WHERE id = p_mesa_id FOR UPDATE;
  IF v_mesa.id IS NULL THEN
    RAISE EXCEPTION 'Mesa não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_mesa.tipo <> 'mesa' THEN
    RAISE EXCEPTION 'O QR Code de mesa só pode ser gerado para contas do tipo mesa.' USING ERRCODE = '22023';
  END IF;
  IF v_mesa.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Mesa inativa. Ative a conta antes de gerar o QR Code.' USING ERRCODE = 'P0001';
  END IF;

  -- Token seguro: MESA- + 64 hex (256 bits)
  v_token := 'MESA-' || encode(extensions.gen_random_bytes(32), 'hex');
  -- Guarda apenas hash
  UPDATE public.usuarios
     SET qr_token_hash = public._hash_token(v_token),
         qr_code_ativo = true,
         atualizado_em = now()
   WHERE id = p_mesa_id;

  -- P1: NÃO encerrar sessões existentes da mesa (sessões são independentes)
  -- Gerar novo QR apenas revoga o token anterior; sessões já abertas continuam válidas até expirarem
  -- ou até o logout com autorização.

  v_url := 'login.html?qr=' || v_token;

  RETURN jsonb_build_object(
    'mesa_id', p_mesa_id,
    'mesa_nome', v_mesa.nome,
    'qr_token', v_token,
    'url_relativa', v_url,
    'gerado_por', v_gerente,
    'gerado_em', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_sessao_mesa(p_qr_token text, p_duracao_horas integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_mesa public.usuarios%ROWTYPE;
  v_token text;
  v_expira timestamptz;
BEGIN
  IF p_qr_token IS NULL OR length(p_qr_token) < 20 THEN
    RAISE EXCEPTION 'QR Code inválido, expirado ou mesa inativa.' USING ERRCODE = '28000';
  END IF;

  v_hash := public._hash_token(p_qr_token);

  SELECT * INTO v_mesa
  FROM public.usuarios
  WHERE qr_token_hash = v_hash
    AND qr_code_ativo = true
    AND tipo = 'mesa'
    AND ativo = true
  LIMIT 1;

  IF v_mesa.id IS NULL THEN
    RAISE EXCEPTION 'QR Code inválido, expirado ou mesa inativa.' USING ERRCODE = '28000';
  END IF;

  IF p_duracao_horas IS NULL OR p_duracao_horas < 1 OR p_duracao_horas > 72 THEN
    p_duracao_horas := 12;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + (p_duracao_horas || ' hours')::interval;

  -- P1: não encerrar outras sessões da mesma mesa; cada dispositivo mantém sua sessão
  INSERT INTO public.sessoes_mesa (mesa_id, session_token_hash, expira_em, ativa)
  VALUES (v_mesa.id, public._hash_token(v_token), v_expira, true);

  RETURN jsonb_build_object(
    'sucesso', true,
    'usuario', jsonb_build_object(
      'id', v_mesa.id,
      'nome', v_mesa.nome,
      'login', v_mesa.login,
      'tipo', v_mesa.tipo,
      'perfil', 'mesa'
    ),
    'tipo_sessao', 'mesa',
    'session_token', v_token,
    'expira_em', v_expira,
    'via', 'qr_code'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.status_qr_mesas(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_out jsonb;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT jsonb_build_object(
    'mesas', COALESCE(jsonb_agg(jsonb_build_object(
      'mesa_id', u.id,
      'mesa_nome', u.nome,
      'ativo', u.ativo,
      'qr_code_ativo', u.qr_code_ativo,
      'sessao_aberta', EXISTS (
        SELECT 1 FROM public.sessoes_mesa s
        WHERE s.mesa_id = u.id AND s.ativa = true AND s.expira_em > now()
      )
    ) ORDER BY u.nome), '[]'::jsonb),
    'gerado_em', now()
  ) INTO v_out
  FROM public.usuarios u
  WHERE u.tipo = 'mesa';

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_qr_mesa(p_session_token text, p_mesa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  UPDATE public.usuarios
     SET qr_code_ativo = false,
         qr_token_hash = NULL,
         atualizado_em = now()
   WHERE id = p_mesa_id AND tipo = 'mesa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Desativar QR não encerra automaticamente sessões (decisão P1); sessões expiram sozinhas
  -- Se quiser encerrar, o gerente pode usar encerrar_sessao_mesa_autorizada ou inativar conta.
  RETURN jsonb_build_object('mesa_id', p_mesa_id, 'qr_code_ativo', false);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. QR CODES DE EQUIPE (gerente e atendente) — individuais por funcionário
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gerar_qr_code_funcionario(p_session_token text, p_funcionario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_func public.usuarios%ROWTYPE;
  v_token text;
  v_url text;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT * INTO v_func FROM public.usuarios WHERE id = p_funcionario_id FOR UPDATE;
  IF v_func.id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_func.tipo <> 'funcionario' THEN
    RAISE EXCEPTION 'QR Code de equipe só pode ser gerado para contas de funcionário.' USING ERRCODE = '22023';
  END IF;
  IF v_func.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Funcionário inativo. Ative a conta antes de gerar o QR Code.' USING ERRCODE = 'P0001';
  END IF;
  -- Não permitir gerar QR para si mesmo sem ser gerente? Já validado _exigir_gerente, mas permitimos gerente gerar para qualquer, inclusive si.
  v_token := 'FUNC-' || encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.usuarios
     SET qr_token_hash = public._hash_token(v_token),
         qr_code_ativo = true,
         atualizado_em = now()
   WHERE id = p_funcionario_id;

  -- Não encerra sessões existentes (multi-sessão)

  v_url := 'login.html?qr=' || v_token;

  RETURN jsonb_build_object(
    'funcionario_id', p_funcionario_id,
    'funcionario_nome', v_func.nome,
    'perfil', v_func.perfil,
    'qr_token', v_token,
    'url_relativa', v_url,
    'gerado_por', v_gerente,
    'gerado_em', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_sessao_funcionario_qr(p_qr_token text, p_duracao_horas integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_func public.usuarios%ROWTYPE;
  v_token text;
  v_expira timestamptz;
  v_tipo_sessao text;
BEGIN
  IF p_qr_token IS NULL OR length(p_qr_token) < 20 THEN
    RAISE EXCEPTION 'QR Code inválido, expirado ou funcionário inativo.' USING ERRCODE = '28000';
  END IF;

  -- Exige prefixo FUNC- para evitar que QR de mesa seja aceito aqui
  IF p_qr_token NOT LIKE 'FUNC-%' THEN
    RAISE EXCEPTION 'QR Code inválido, expirado ou funcionário inativo.' USING ERRCODE = '28000';
  END IF;

  v_hash := public._hash_token(p_qr_token);

  SELECT * INTO v_func
  FROM public.usuarios
  WHERE qr_token_hash = v_hash
    AND qr_code_ativo = true
    AND tipo = 'funcionario'
    AND ativo = true
  LIMIT 1;

  IF v_func.id IS NULL THEN
    RAISE EXCEPTION 'QR Code inválido, expirado ou funcionário inativo.' USING ERRCODE = '28000';
  END IF;

  IF p_duracao_horas IS NULL OR p_duracao_horas < 1 OR p_duracao_horas > 72 THEN
    p_duracao_horas := 12;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + (p_duracao_horas || ' hours')::interval;

  INSERT INTO public.sessoes_funcionario (funcionario_id, session_token_hash, expira_em, ativa)
  VALUES (v_func.id, public._hash_token(v_token), v_expira, true);

  v_tipo_sessao := 'funcionario';

  RETURN jsonb_build_object(
    'sucesso', true,
    'usuario', jsonb_build_object(
      'id', v_func.id,
      'nome', v_func.nome,
      'login', v_func.login,
      'tipo', v_func.tipo,
      'perfil', COALESCE(v_func.perfil, 'atendente')
    ),
    'tipo_sessao', v_tipo_sessao,
    'session_token', v_token,
    'expira_em', v_expira,
    'via', 'qr_code'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.status_qr_funcionarios(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_out jsonb;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  SELECT jsonb_build_object(
    'funcionarios', COALESCE(jsonb_agg(jsonb_build_object(
      'funcionario_id', u.id,
      'funcionario_nome', u.nome,
      'login', u.login,
      'perfil', COALESCE(u.perfil, 'atendente'),
      'ativo', u.ativo,
      'qr_code_ativo', u.qr_code_ativo,
      'sessao_aberta', EXISTS (
        SELECT 1 FROM public.sessoes_funcionario s
        WHERE s.funcionario_id = u.id AND s.ativa = true AND s.expira_em > now()
      )
    ) ORDER BY u.perfil, u.nome), '[]'::jsonb),
    'gerado_em', now()
  ) INTO v_out
  FROM public.usuarios u
  WHERE u.tipo = 'funcionario';

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_qr_funcionario(p_session_token text, p_funcionario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  UPDATE public.usuarios
     SET qr_code_ativo = false,
         qr_token_hash = NULL,
         atualizado_em = now()
   WHERE id = p_funcionario_id AND tipo = 'funcionario';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('funcionario_id', p_funcionario_id, 'qr_code_ativo', false);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. ENCERRAMENTO DE SESSÃO DE MESA COM AUTORIZAÇÃO DE STAFF
--    A sessão da mesa só pode ser encerrada mediante validação de credenciais
--    de um funcionário ativo (gerente ou atendente). Isso impede que um cliente
--    encerre a própria sessão sem autorização ou que feche a sessão de outra mesa.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.encerrar_sessao_mesa_autorizada(
  p_session_token_mesa text,
  p_staff_login text,
  p_staff_senha text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_staff public.usuarios%ROWTYPE;
  v_hash_mesa text;
  v_mesa_id uuid;
  v_falhas int;
  v_login_norm text;
BEGIN
  IF p_session_token_mesa IS NULL OR length(p_session_token_mesa) < 20 THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  IF btrim(coalesce(p_staff_login, '')) = '' OR coalesce(p_staff_senha, '') = '' THEN
    RAISE EXCEPTION 'Informe o login e a senha do funcionário autorizador.' USING ERRCODE = '22023';
  END IF;

  v_login_norm := public._normalizar_login(p_staff_login);

  SELECT count(*) INTO v_falhas
  FROM public.login_tentativas
  WHERE login = v_login_norm
    AND sucesso = false
    AND criado_em > now() - interval '15 minutes';

  IF v_falhas >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas de login do autorizador. Aguarde 15 minutos.' USING ERRCODE = '42901';
  END IF;

  SELECT * INTO v_staff FROM public.usuarios WHERE lower(login) = v_login_norm LIMIT 1;

  IF v_staff.id IS NULL OR v_staff.ativo IS NOT TRUE THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RAISE EXCEPTION 'Funcionário autorizador não encontrado ou inativo.' USING ERRCODE = '28000';
  END IF;

  IF v_staff.tipo <> 'funcionario' THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RAISE EXCEPTION 'Apenas funcionários podem autorizar o encerramento.' USING ERRCODE = '42501';
  END IF;

  -- Permitir gerente e atendente (conforme escolha do stakeholder)
  IF v_staff.perfil NOT IN ('gerente', 'atendente') THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RAISE EXCEPTION 'Perfil do autorizador não permitido.' USING ERRCODE = '42501';
  END IF;

  IF v_staff.senha_hash IS NULL
     OR v_staff.senha_hash <> extensions.crypt(p_staff_senha, v_staff.senha_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RAISE EXCEPTION 'Senha do funcionário incorreta.' USING ERRCODE = '28000';
  END IF;

  -- Credencial válida: limpa falhas e registra sucesso
  DELETE FROM public.login_tentativas WHERE login = v_login_norm AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, true);

  v_hash_mesa := public._hash_token(p_session_token_mesa);

  SELECT mesa_id INTO v_mesa_id
  FROM public.sessoes_mesa
  WHERE session_token_hash = v_hash_mesa
    AND ativa = true
  LIMIT 1;

  IF v_mesa_id IS NULL THEN
    -- Sessão já encerrada ou expirada: idempotente
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  -- Verificação adicional: a sessão pertence à mesa que o autorizador tenta encerrar.
  -- Como o token é opaco e veio do dispositivo da mesa, não há risco de fechar outra mesa
  -- sem ter o token dela. Ainda assim, encerramos apenas a sessão específica.
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash_mesa;

  RETURN jsonb_build_object(
    'mensagem', 'Sessão da mesa encerrada com autorização.',
    'mesa_id', v_mesa_id,
    'autorizado_por', v_staff.nome
  );
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text,text) IS 'Encerra sessão de mesa apenas com validação de credencial de staff (gerente/atendente). Impede logout não autorizado.';

-- ----------------------------------------------------------------------------
-- 5. ENDURECER encerrar_sessao PARA SESSÕES DE MESA
--    Se o token for de mesa, exigir o uso da função autorizada acima.
--    Sessões de funcionário continuam podendo usar encerrar_sessao diretamente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encerrar_sessao(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_is_mesa boolean;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  v_hash := public._hash_token(p_session_token);

  -- Verifica se é sessão de mesa ativa
  SELECT EXISTS (
    SELECT 1 FROM public.sessoes_mesa WHERE session_token_hash = v_hash AND ativa = true
  ) INTO v_is_mesa;

  IF v_is_mesa THEN
    RAISE EXCEPTION 'Encerramento de sessão de mesa requer autorização de funcionário. Use encerrar_sessao_mesa_autorizada.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash;
  UPDATE public.sessoes_funcionario SET ativa = false WHERE session_token_hash = v_hash;

  RETURN jsonb_build_object('mensagem', 'Sessão encerrada.');
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao(text) IS 'Encerra sessão de funcionário; sessões de mesa exigem autorização explícita via encerrar_sessao_mesa_autorizada.';

-- ----------------------------------------------------------------------------
-- 6. PERMISSÕES (GRANT EXECUTE) — novas RPCs
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.gerar_qr_code_mesa(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sessao_mesa(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.status_qr_mesas(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desativar_qr_mesa(text, uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_qr_code_funcionario(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sessao_funcionario_qr(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.status_qr_funcionarios(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desativar_qr_funcionario(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) TO anon, authenticated;

-- Garantir que encerrar_sessao continue exposta
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;

-- Helpers continuam privados
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. DEMO PÚBLICO (pendência de alta prioridade) — estrutura preparatória
--    Perfil demo: conta tipo 'funcionario' com perfil 'demo' (somente leitura)
--    Não cria tarefa numerada no roadmap; apenas documenta preparação.
-- ----------------------------------------------------------------------------
-- Constraint atual permite apenas 'atendente'/'gerente' para funcionario.
-- Criamos tipo especial sem alterar constraint: usamos perfil = 'atendente' + flag demonstrativo
-- Para evolução futura, recomenda-se coluna dedicada (ex: is_demo boolean).
-- Aqui apenas documentamos a intenção; nenhuma mudança de schema de demo é aplicada nesta migração
-- para não impactar produção sem aprovação de regra de negócio de dados fictícios.
COMMENT ON FUNCTION public.status_qr_mesas(text) IS 'Retorna QR ativo e sessão aberta por mesa (gerente only). Sessões multi-dispositivo preservadas.';
COMMENT ON FUNCTION public.gerar_qr_code_funcionario(text,uuid) IS 'Gera QR individual por funcionário (gerente only). Token FUNC- + 64hex, hash único, revogável.';
COMMENT ON FUNCTION public.iniciar_sessao_funcionario_qr(text,integer) IS 'Login por QR de staff: valida hash FUNC-, cria sessão 12h, permissões do perfil original.';
