-- ============================================================================
-- NeoOrder — Migração 20261026: observações nos pedidos
-- Data: 2026-10-26
-- Objetivo: permitir comentários do cliente para a cozinha
--   - pedidos.observacao (geral, 0..500)
--   - pedido_itens.observacao (por prato, 0..200)
--   - valida tamanho, btrim, preserva dados existentes
--   - NÃO altera logout, PIN, QR
-- ============================================================================

-- 1. Colunas (idempotente, sem apagar dados)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS observacao text;

ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS observacao text;

-- Limites via CHECK (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_observacao_len_check') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_observacao_len_check
      CHECK (observacao IS NULL OR char_length(observacao) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_itens_observacao_len_check') THEN
    ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_observacao_len_check
      CHECK (observacao IS NULL OR char_length(observacao) <= 200);
  END IF;
END $$;

-- 2. Recriar criar_pedido_mesa preservando fidelidade e estoque, adicionando observações
-- Assinatura com 6º param opcional para compatibilidade retroativa
DROP FUNCTION IF EXISTS public.criar_pedido_mesa(text, jsonb);
DROP FUNCTION IF EXISTS public.criar_pedido_mesa(text, jsonb, text);
DROP FUNCTION IF EXISTS public.criar_pedido_mesa(text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.criar_pedido_mesa(text, jsonb, text, text, integer);

CREATE OR REPLACE FUNCTION public.criar_pedido_mesa(
  p_session_token text,
  p_itens jsonb,
  p_cliente_telefone text DEFAULT NULL,
  p_cliente_nome text DEFAULT NULL,
  p_resgatar_pontos integer DEFAULT 0,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mesa_id uuid; v_pedido_id uuid; v_item record; v_prato record; v_ing record;
  v_valor_total numeric(12,2) := 0; v_qtd_itens int := 0; v_tel text;
  v_cliente public.clientes%ROWTYPE; v_desconto numeric(12,2) := 0;
  v_pontos_resgatados int := 0; v_pontos_creditados int := 0;
  v_obs_pedido text;
  v_obs_item text;
BEGIN
  v_mesa_id := public.validar_sessao_mesa(p_session_token);

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'O pedido deve possuir pelo menos um item.' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_itens) > 50 THEN
    RAISE EXCEPTION 'Máximo de 50 linhas por pedido.' USING ERRCODE = '22023'; END IF;

  -- Validação observação geral (0..500)
  v_obs_pedido := NULLIF(btrim(COALESCE(p_observacao,'')), '');
  IF v_obs_pedido IS NOT NULL AND char_length(v_obs_pedido) > 500 THEN
    RAISE EXCEPTION 'Observação do pedido deve ter no máximo 500 caracteres.' USING ERRCODE = '22023'; END IF;

  v_tel := regexp_replace(COALESCE(p_cliente_telefone, ''), '\D', '', 'g');
  IF v_tel <> '' AND (length(v_tel) < 10 OR length(v_tel) > 13) THEN
    RAISE EXCEPTION 'Informe um telefone com DDD (10 a 13 dígitos) ou deixe em branco.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.pedidos (mesa_id, valor_total, status, observacao) VALUES (v_mesa_id, 0, 'Pendente', v_obs_pedido)
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_itens) AS x(prato_id uuid, quantidade int, observacao text)
  LOOP
    IF v_item.prato_id IS NULL THEN RAISE EXCEPTION 'Item de pedido inválido.' USING ERRCODE = '22023'; END IF;
    IF v_item.quantidade IS NULL OR v_item.quantidade < 1 OR v_item.quantidade > 50 THEN
      RAISE EXCEPTION 'Quantidade inválida (de 1 a 50 por item).' USING ERRCODE = '22023'; END IF;

    -- Validação observação por item (0..200)
    v_obs_item := NULLIF(btrim(COALESCE(v_item.observacao,'')), '');
    IF v_obs_item IS NOT NULL AND char_length(v_obs_item) > 200 THEN
      RAISE EXCEPTION 'Observação do item deve ter no máximo 200 caracteres.' USING ERRCODE = '22023'; END IF;

    SELECT id, preco, ativo INTO v_prato FROM public.pratos WHERE id = v_item.prato_id FOR SHARE;
    IF v_prato.id IS NULL OR v_prato.ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'Prato indisponível ou inativo.' USING ERRCODE = 'P0001'; END IF;

    FOR v_ing IN
      SELECT pi.ingrediente_id, pi.quantidade AS qtd_necessaria, e.nome, e.quantidade AS qtd_estoque
      FROM public.prato_ingredientes pi JOIN public.estoque e ON e.id = pi.ingrediente_id
      WHERE pi.prato_id = v_prato.id FOR UPDATE OF e
    LOOP
      IF v_ing.qtd_estoque < (v_ing.qtd_necessaria * v_item.quantidade) THEN
        RAISE EXCEPTION 'Estoque insuficiente do insumo "%" para o prato selecionado.', v_ing.nome
          USING ERRCODE = 'P0001'; END IF;
      UPDATE public.estoque SET quantidade = quantidade - (v_ing.qtd_necessaria * v_item.quantidade),
             atualizado_em = now() WHERE id = v_ing.ingrediente_id;
    END LOOP;

    INSERT INTO public.pedido_itens (pedido_id, prato_id, quantidade, preco_unitario, observacao)
    VALUES (v_pedido_id, v_prato.id, v_item.quantidade, v_prato.preco, v_obs_item);
    v_valor_total := v_valor_total + (v_prato.preco * v_item.quantidade);
    v_qtd_itens := v_qtd_itens + v_item.quantidade;
  END LOOP;

  IF v_tel <> '' THEN
    SELECT * INTO v_cliente FROM public.clientes WHERE telefone = v_tel FOR UPDATE;
    IF v_cliente.id IS NULL THEN
      INSERT INTO public.clientes (nome, telefone, total_visitas, pontos)
      VALUES (COALESCE(NULLIF(btrim(p_cliente_nome), ''), 'Cliente'), v_tel, 1, 10) RETURNING * INTO v_cliente;
      INSERT INTO public.fidelidade_movimentos (cliente_id, pedido_id, tipo, pontos, descricao)
      VALUES (v_cliente.id, v_pedido_id, 'bonus', 10, 'Bônus de boas-vindas');
    ELSE
      UPDATE public.clientes SET total_visitas = total_visitas + 1, ultimo_acesso_em = now(),
             nome = COALESCE(NULLIF(btrim(p_cliente_nome), ''), nome)
       WHERE id = v_cliente.id RETURNING * INTO v_cliente;
    END IF;

    IF COALESCE(p_resgatar_pontos, 0) > 0 THEN
      IF p_resgatar_pontos % 100 <> 0 THEN
        RAISE EXCEPTION 'O resgate deve ser em múltiplos de 100 pontos.' USING ERRCODE = '22023'; END IF;
      IF p_resgatar_pontos > v_cliente.pontos THEN
        RAISE EXCEPTION 'Saldo de pontos insuficiente (disponível: %).', v_cliente.pontos USING ERRCODE = '22023'; END IF;
      v_pontos_resgatados := p_resgatar_pontos;
      v_desconto := (v_pontos_resgatados / 100) * 10;
      IF v_desconto > (v_valor_total * 0.5) THEN
        RAISE EXCEPTION 'O resgate não pode ultrapassar 50%% do valor do pedido.' USING ERRCODE = '22023'; END IF;
      UPDATE public.clientes SET pontos = pontos - v_pontos_resgatados WHERE id = v_cliente.id;
      INSERT INTO public.fidelidade_movimentos (cliente_id, pedido_id, tipo, pontos, descricao)
      VALUES (v_cliente.id, v_pedido_id, 'resgate', -v_pontos_resgatados,
              format('Resgate de %s pontos', v_pontos_resgatados));
      v_cliente.pontos := v_cliente.pontos - v_pontos_resgatados;
    END IF;

    v_pontos_creditados := public._pontos_por_valor(v_valor_total - v_desconto);
    IF v_pontos_creditados > 0 THEN
      UPDATE public.clientes SET pontos = pontos + v_pontos_creditados WHERE id = v_cliente.id;
      INSERT INTO public.fidelidade_movimentos (cliente_id, pedido_id, tipo, pontos, descricao)
      VALUES (v_cliente.id, v_pedido_id, 'credito', v_pontos_creditados,
              format('Pedido de %s', to_char(v_valor_total - v_desconto, 'FM999999990.00')));
    END IF;
  END IF;

  UPDATE public.pedidos SET valor_total = v_valor_total - v_desconto, cliente_id = v_cliente.id,
         desconto_fidelidade = v_desconto, pontos_resgatados = v_pontos_resgatados,
         pontos_creditados = v_pontos_creditados, atualizado_em = now()
   WHERE id = v_pedido_id;

  RETURN jsonb_build_object('pedido_id', v_pedido_id, 'valor_total', v_valor_total - v_desconto,
    'valor_bruto', v_valor_total, 'desconto_fidelidade', v_desconto, 'itens', v_qtd_itens,
    'status', 'Pendente', 'observacao', v_obs_pedido,
    'cliente', CASE WHEN v_cliente.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_cliente.id, 'nome', v_cliente.nome, 'pontos', COALESCE(v_cliente.pontos, 0) + v_pontos_creditados) END,
    'pontos_resgatados', v_pontos_resgatados, 'pontos_creditados', v_pontos_creditados);
END;
$$;

-- 3. Atualizar leitura para incluir observações
CREATE OR REPLACE FUNCTION public.meus_pedidos_mesa(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_mesa uuid; v_out jsonb;
BEGIN
  v_mesa := public.validar_sessao_mesa(p_session_token);
  SELECT COALESCE(jsonb_agg(o ORDER BY o->>'criado_em' DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'status', p.status, 'valor_total', p.valor_total,
      'criado_em', p.criado_em, 'entregue_em', p.entregue_em,
      'observacao', p.observacao,
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('prato_id', pi.prato_id, 'nome', pr.nome,
               'quantidade', pi.quantidade, 'preco_unitario', pi.preco_unitario, 'observacao', pi.observacao) ORDER BY pr.nome)
        FROM public.pedido_itens pi JOIN public.pratos pr ON pr.id = pi.prato_id
        WHERE pi.pedido_id = p.id
      ), '[]'::jsonb)
    ) AS o
    FROM public.pedidos p
    WHERE p.mesa_id = v_mesa AND p.criado_em > now() - interval '30 days'
  ) t;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.painel_atendimento(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_chamados jsonb; v_pedidos jsonb;
BEGIN
  v_id := public._exigir_funcionario(p_session_token);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'mesa_id', c.mesa_id,
           'mesa_nome', COALESCE(u.nome, 'Mesa'), 'justificativa', c.justificativa,
           'status', c.status, 'criado_em', c.criado_em) ORDER BY c.criado_em), '[]'::jsonb)
  INTO v_chamados
  FROM public.chamados c LEFT JOIN public.usuarios u ON u.id = c.mesa_id
  WHERE c.status = 'Pendente';
  SELECT COALESCE(jsonb_agg(o ORDER BY o->>'criado_em'), '[]'::jsonb) INTO v_pedidos
  FROM (
    SELECT jsonb_build_object('id', p.id, 'mesa_id', p.mesa_id, 'mesa_nome', COALESCE(u.nome, 'Mesa'),
      'status', p.status, 'valor_total', p.valor_total, 'criado_em', p.criado_em, 'entregue_em', p.entregue_em,
      'observacao', p.observacao,
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('nome', pr.nome, 'quantidade', pi.quantidade,
               'preco_unitario', pi.preco_unitario, 'observacao', pi.observacao) ORDER BY pr.nome)
        FROM public.pedido_itens pi JOIN public.pratos pr ON pr.id = pi.prato_id
        WHERE pi.pedido_id = p.id), '[]'::jsonb)
    ) AS o
    FROM public.pedidos p LEFT JOIN public.usuarios u ON u.id = p.mesa_id
    WHERE p.status IN ('Pendente', 'Em Preparo', 'Pronto')
      AND p.criado_em > now() - interval '24 hours'
  ) t;
  RETURN jsonb_build_object('chamados', v_chamados, 'pedidos', v_pedidos, 'gerado_em', now());
END;
$$;

-- Permissões (mantidas)
GRANT EXECUTE ON FUNCTION public.criar_pedido_mesa(text, jsonb, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meus_pedidos_mesa(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.painel_atendimento(text) TO anon, authenticated;

-- Compatibilidade: garantir que funções antigas com 5 args ainda sejam válidas via default já cobre,
-- mas manter grant para variações caso cache antigo
