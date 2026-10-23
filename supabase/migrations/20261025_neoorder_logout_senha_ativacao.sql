-- ============================================================================
-- NeoOrder — Migração corretiva 20261025: ativar logout de mesa com senha
-- Data: 2026-10-25
-- Prioridade: CORRIGIR validação de autorização encerrar_sessao_mesa_autorizada
--
-- Causa raiz (24/10): função public.encerrar_sessao_mesa_autorizada não existe
-- no banco conectado nurnxrtxdcasrjcwxvky (PGRST202/42883). Frontend exibia
-- "Validação de autorização ainda não ativa" — não era fallback visual, era
-- ausência real da RPC. A função antiga encerrar_sessao(p_session_token)
-- encerrava qualquer mesa sem validar staff (vulnerabilidade).
--
-- Escopo estrito desta migração:
--  - NÃO altera QR Code (gerar_qr_code_mesa, iniciar_sessao_mesa etc. permanecem
--    como estão em produção até conclusão da pendência QR).
--  - NÃO implementa PIN (20261022/23 adiados, sem pin_hash).
--  - NÃO altera autenticar_usuario (multi-sessão é parte da pendência QR P1).
--  - Apenas: cria encerrar_sessao_mesa_autorizada com validação segura e
--    endurece encerrar_sessao para exigir autorização em mesas.
--
-- Idempotente, não destrói dados, preserva 20261017.
-- Aplicar via Supabase migrations (POST /rest/v1/rpc ou SQL Editor).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- Limpeza de stubs divergentes (PIN adiado deixava assinatura com 2 params)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.encerrar_sessao_mesa_autorizada(text, text);
DROP FUNCTION IF EXISTS public.encerrar_sessao_mesa_autorizada(text, text, text);

-- ----------------------------------------------------------------------------
-- encerrar_sessao_mesa_autorizada — validação no banco, sem fallback
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

  -- Bloqueio 5 tentativas/15min com lock para concorrência
  PERFORM pg_advisory_xact_lock(hashtext(v_login_norm));

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

  -- Validação segura com bcrypt (sem logar senha, sem expor hash)
  IF v_staff.senha_hash IS NULL OR v_staff.senha_hash <> extensions.crypt(p_staff_senha, v_staff.senha_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'Senha do funcionário incorreta.');
  END IF;

  -- Sucesso: limpa falhas e registra login válido
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

  -- Encerra exclusivamente a sessão identificada (não afeta outras mesas)
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash_mesa;

  RETURN jsonb_build_object(
    'mensagem', 'Sessão da mesa encerrada com autorização.',
    'mesa_id', v_mesa_id,
    'autorizado_por', v_staff.nome,
    'autorizado_login', v_staff.login,
    'autorizado_perfil', v_staff.perfil
  );
END;
$$;

COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text,text) IS 'Encerra sessão de mesa apenas com credencial de staff (gerente/atendente) validada via senha_hash bcrypt. Impede logout não autorizado.';

-- ----------------------------------------------------------------------------
-- Endurecer encerrar_sessao: mesa exige autorização
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

COMMENT ON FUNCTION public.encerrar_sessao(text) IS 'Encerra sessão de funcionário; sessões de mesa exigem autorização via encerrar_sessao_mesa_autorizada.';

-- ----------------------------------------------------------------------------
-- Grants mínimos — sem alterar QR Code
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;

-- Helpers permanecem privados
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;

-- Se coluna pin_hash existir por engano (PIN adiado), documenta sem usar
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='pin_hash') THEN
    COMMENT ON COLUMN public.usuarios.pin_hash IS 'PIN adiado 24/10 — não usar; validação vigente usa senha_hash.';
  END IF;
END $$;
