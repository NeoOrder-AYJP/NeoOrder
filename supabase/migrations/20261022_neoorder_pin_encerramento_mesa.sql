-- ============================================================================
-- NeoOrder — Migração 20261022: PIN individual de 6 dígitos para encerrar mesa
-- Data: 2026-10-22
-- Autor: Arena Agent (branch arena/bc7a1516-neoorder)
--
-- Objetivo:
--  1. Substituir senha de login por PIN individual de 6 dígitos no
--     encerramento de sessão de mesa (exigência stakeholder 22/10).
--  2. Corrigir backlog §9/10 (senha → PIN) e preservar P1/P2 intactos.
--  3. Preparar gestão de PINs por gerente (definir/revogar/listar).
--
-- Esta migração é IDEMPOTENTE e NÃO destrói dados.
-- NÃO aplicar em produção sem autorização explícita do stakeholder.
-- Depende de: 20261017_neoorder_hardening.sql + 20261020_neoorder_multisession_qr_staff_logout.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 0. Colunas de PIN (individuais por funcionário)
--    - pin_hash: hash bcrypt via crypt() — nunca plaintext
--    - pin_ativo: se PIN está configurado e habilitado
--    - pin_atualizado_em: auditoria
--    - pin_expira_em: opcional para rotação futura (NULL = sem expiração)
-- ----------------------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pin_expira_em timestamptz;

-- Índice para buscas de PIN ativo (status_pin_funcionarios)
CREATE INDEX IF NOT EXISTS idx_usuarios_pin_ativo ON public.usuarios (pin_ativo) WHERE pin_ativo = true;

COMMENT ON COLUMN public.usuarios.pin_hash IS 'Hash bcrypt do PIN individual de 6 dígitos para encerrar mesa. Nunca armazenar plaintext. NULL = sem PIN configurado.';
COMMENT ON COLUMN public.usuarios.pin_ativo IS 'Se true, PIN está configurado e pode autorizar encerramento de mesa.';
COMMENT ON COLUMN public.usuarios.pin_atualizado_em IS 'Quando o PIN foi definido/alterado pela última vez.';
COMMENT ON COLUMN public.usuarios.pin_expira_em IS 'Opcional: data de expiração do PIN para rotação periódica. NULL = sem expiração.';

-- ----------------------------------------------------------------------------
-- 1. Helper: validar formato do PIN (6 dígitos numéricos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._validar_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_pin ~ '^[0-9]{6}$';
END;
$$;
COMMENT ON FUNCTION public._validar_pin(text) IS 'Valida se PIN tem exatamente 6 dígitos numéricos (000000-999999).';
REVOKE EXECUTE ON FUNCTION public._validar_pin(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. GESTÃO DE PINs (somente gerente via _exigir_gerente)
-- ----------------------------------------------------------------------------

-- Definir / alterar PIN de um funcionário (gerente only)
CREATE OR REPLACE FUNCTION public.definir_pin_funcionario(
  p_session_token text,
  p_target_usuario_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_gerente uuid;
  v_target public.usuarios%ROWTYPE;
  v_hash text;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  IF p_target_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário alvo não informado.' USING ERRCODE = '22023';
  END IF;

  IF NOT public._validar_pin(p_pin) THEN
    RAISE EXCEPTION 'PIN deve ter exatamente 6 dígitos numéricos (000000 a 999999).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.usuarios WHERE id = p_target_usuario_id FOR UPDATE;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.tipo <> 'funcionario' THEN
    RAISE EXCEPTION 'PIN só pode ser definido para contas de funcionário (gerente/atendente).' USING ERRCODE = '22023';
  END IF;
  IF v_target.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Funcionário inativo. Ative a conta antes de definir o PIN.' USING ERRCODE = 'P0001';
  END IF;

  -- Hash bcrypt com salt automático (mesmo padrão de senha_hash)
  v_hash := extensions.crypt(p_pin, extensions.gen_salt('bf', 11));

  UPDATE public.usuarios
     SET pin_hash = v_hash,
         pin_ativo = true,
         pin_atualizado_em = now(),
         pin_expira_em = NULL,
         atualizado_em = now()
   WHERE id = p_target_usuario_id;

  RETURN jsonb_build_object(
    'funcionario_id', p_target_usuario_id,
    'funcionario_nome', v_target.nome,
    'pin_ativo', true,
    'pin_atualizado_em', now(),
    'definido_por', v_gerente
  );
END;
$$;
COMMENT ON FUNCTION public.definir_pin_funcionario(text,uuid,text) IS 'Define PIN de 6 dígitos para funcionário (gerente only). Armazena só hash bcrypt, nunca plaintext. Valida formato 000000-999999.';

-- Revogar / limpar PIN (gerente only) — mantém histórico mas desativa
CREATE OR REPLACE FUNCTION public.remover_pin_funcionario(
  p_session_token text,
  p_target_usuario_id uuid
)
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
     SET pin_hash = NULL,
         pin_ativo = false,
         pin_atualizado_em = now(),
         pin_expira_em = NULL,
         atualizado_em = now()
   WHERE id = p_target_usuario_id AND tipo = 'funcionario';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('funcionario_id', p_target_usuario_id, 'pin_ativo', false, 'removido_por', v_gerente);
END;
$$;
COMMENT ON FUNCTION public.remover_pin_funcionario(text,uuid) IS 'Revoga PIN de funcionário (gerente only). PIN deixa de autorizar encerramentos.';

-- Status agregado de PINs para painel de contas (gerente only)
CREATE OR REPLACE FUNCTION public.status_pin_funcionarios(p_session_token text)
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
      'pin_ativo', COALESCE(u.pin_ativo, false),
      'pin_atualizado_em', u.pin_atualizado_em,
      'pin_expira_em', u.pin_expira_em
    ) ORDER BY u.perfil, u.nome), '[]'::jsonb),
    'gerado_em', now()
  ) INTO v_out
  FROM public.usuarios u
  WHERE u.tipo = 'funcionario';

  RETURN v_out;
END;
$$;
COMMENT ON FUNCTION public.status_pin_funcionarios(text) IS 'Lista status de PIN por funcionário (gerente only). Não expõe hash.';

-- ----------------------------------------------------------------------------
-- 3. ENCERRAMENTO DE SESSÃO DE MESA COM PIN (substitui validação por senha)
--    Assinatura mantida compatível com migração 20261020 (3 params) mas
--    semântica trocada: p_pin é 6 dígitos validado contra pin_hash, não senha_hash.
--    Mantém auditoria de quem autorizou e proteção contra brute-force.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.encerrar_sessao_mesa_autorizada(
  p_session_token_mesa text,
  p_staff_login text,
  p_pin text
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
  -- Validação do token da mesa (opaco, 64 hex)
  IF p_session_token_mesa IS NULL OR length(p_session_token_mesa) < 20 THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  IF btrim(coalesce(p_staff_login, '')) = '' OR coalesce(p_pin, '') = '' THEN
    RAISE EXCEPTION 'Informe o login do funcionário e o PIN de 6 dígitos.' USING ERRCODE = '22023';
  END IF;

  -- Validar formato PIN antes de qualquer consulta (evita timing leak)
  IF NOT public._validar_pin(p_pin) THEN
    RAISE EXCEPTION 'PIN inválido. Deve ter exatamente 6 dígitos numéricos.' USING ERRCODE = '22023';
  END IF;

  v_login_norm := public._normalizar_login(p_staff_login);

  PERFORM pg_advisory_xact_lock(hashtext(v_login_norm));

  -- Brute-force: 5 falhas / 15 min por login do autorizador (reutiliza login_tentativas)
  SELECT count(*) INTO v_falhas
  FROM public.login_tentativas
  WHERE login = v_login_norm
    AND sucesso = false
    AND criado_em > now() - interval '15 minutes';

  IF v_falhas >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas com este PIN. Aguarde 15 minutos.' USING ERRCODE = '42901';
  END IF;

  SELECT * INTO v_staff FROM public.usuarios WHERE lower(login) = v_login_norm LIMIT 1;

  IF v_staff.id IS NULL OR v_staff.ativo IS NOT TRUE THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'Funcionário autorizador não encontrado ou inativo.');
  END IF;

  IF v_staff.tipo <> 'funcionario' THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42501', 'mensagem', 'Apenas funcionários podem autorizar o encerramento.');
  END IF;

  IF v_staff.perfil NOT IN ('gerente', 'atendente') THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42501', 'mensagem', 'Perfil do autorizador não permitido.');
  END IF;

  -- PIN deve estar configurado e ativo
  IF v_staff.pin_hash IS NULL OR v_staff.pin_ativo IS NOT TRUE THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42501', 'mensagem', 'Funcionário sem PIN configurado. Peça ao gerente para definir o PIN em Contas.');
  END IF;

  -- Verificar expiração opcional
  IF v_staff.pin_expira_em IS NOT NULL AND v_staff.pin_expira_em < now() THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'PIN expirado. Solicite renovação ao gerente.');
  END IF;

  -- Validação criptográfica: PIN vs pin_hash (bcrypt)
  -- Para preservar login_tentativas (RAISE faz rollback), retorna JSON em vez de RAISE
  IF v_staff.pin_hash <> extensions.crypt(p_pin, v_staff.pin_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'PIN incorreto.');
  END IF;

  -- Sucesso: limpa falhas e registra
  DELETE FROM public.login_tentativas WHERE login = v_login_norm AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, true);
  DELETE FROM public.login_tentativas WHERE login = v_login_norm AND criado_em < now() - interval '2 days';

  v_hash_mesa := public._hash_token(p_session_token_mesa);

  SELECT mesa_id INTO v_mesa_id
  FROM public.sessoes_mesa
  WHERE session_token_hash = v_hash_mesa
    AND ativa = true
  LIMIT 1;

  IF v_mesa_id IS NULL THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  -- Encerra apenas a sessão específica do token informado (não afeta outras mesas)
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash_mesa;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Sessão da mesa encerrada com PIN.',
    'mesa_id', v_mesa_id,
    'autorizado_por', v_staff.nome,
    'autorizado_login', v_staff.login,
    'autorizado_perfil', v_staff.perfil,
    'encerrado_em', now()
  );
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text,text) IS 'Encerra sessão de mesa com PIN individual de 6 dígitos (login + PIN). Valida pin_hash via bcrypt, bloqueia 5/15min, audita autorizador. Substitui validação por senha (20261020).';

-- Mantém encerrar_sessao endurecida da migração anterior (mesa exige PIN)
-- Recria para garantir comentário atualizado, sem alterar lógica de bloqueio
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

  SELECT EXISTS (
    SELECT 1 FROM public.sessoes_mesa WHERE session_token_hash = v_hash AND ativa = true
  ) INTO v_is_mesa;

  IF v_is_mesa THEN
    RAISE EXCEPTION 'Encerramento de sessão de mesa requer PIN. Use encerrar_sessao_mesa_autorizada com login e PIN de 6 dígitos.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash;
  UPDATE public.sessoes_funcionario SET ativa = false WHERE session_token_hash = v_hash;

  RETURN jsonb_build_object('mensagem', 'Sessão encerrada.');
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao(text) IS 'Encerra sessão de funcionário; sessões de mesa exigem PIN via encerrar_sessao_mesa_autorizada.';

-- ----------------------------------------------------------------------------
-- 4. PERMISSÕES
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.definir_pin_funcionario(text,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_pin_funcionario(text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.status_pin_funcionarios(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;

-- Helpers permanecem privados
REVOKE EXECUTE ON FUNCTION public._validar_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Compatibilidade: preservar QR e multi-sessão da migração 20261020
--    Nenhuma alteração em: autenticar_usuario, gerar_qr_code_mesa,
--    iniciar_sessao_mesa, gerar_qr_code_funcionario, iniciar_sessao_funcionario_qr,
--    status_qr_mesas, status_qr_funcionarios, desativar_qr_*.
--    Demo público permanece pendente sem tarefa numerada (não alterado).
-- ----------------------------------------------------------------------------
