-- ============================================================================
-- NeoOrder — Migração corretiva 20261024: logout de mesa com senha validada
-- Data: 2026-10-24
-- Prioridade: CORRIGIR autorização do encerramento de sessão de mesa
-- NÃO implementa PIN (adiado). Foca em senha de staff.
-- NOTA: Esta migration é LOGOUT-ONLY — QR Code (seções 2,3) removidas para merge separado (QR pendente).
--
-- Causa da falha: encerrar_sessao() atual permite qualquer token de mesa
-- encerrar a si mesmo sem validar staff; frontend em produção faz fallback
-- inseguro para encerrar_sessao quando RPC não existe (aceita qualquer login/senha).
--
-- Esta migração é IDEMPOTENTE, não destrói dados, não altera 20261017.
-- NÃO aplicar em produção sem autorização explícita.
-- Base: 20261020_neoorder_multisession_qr_staff_logout.sql (seções logout) com correções:
--   - gen_salt bf 11 (compatível senha_hash), advisory lock, login_tentativas
--     persiste via RETURN json (RAISE causava rollback), grants/revokes.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 0. Garantir colunas de QR (já existem em produção mas idempotente)
-- ----------------------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS qr_code_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_token_hash text;
CREATE INDEX IF NOT EXISTS idx_usuarios_qr_token_hash ON public.usuarios (qr_token_hash) WHERE qr_token_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. Múltiplas sessões simultâneas (não invalidar anteriores)
--    Corrige autenticar_usuario: cada login gera token independente
-- ----------------------------------------------------------------------------
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
    RETURN jsonb_build_object('sucesso', false, 'codigo', '22023', 'mensagem', 'Informe o login e a senha.');
  END IF;
  v_login := public._normalizar_login(p_login);
  SELECT count(*) INTO v_falhas FROM public.login_tentativas WHERE login = v_login AND sucesso = false AND criado_em > now() - interval '15 minutes';
  IF v_falhas >= 5 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42901', 'mensagem', 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.');
  END IF;
  SELECT * INTO v_user FROM public.usuarios WHERE lower(login) = v_login LIMIT 1;
  IF v_user.id IS NULL OR v_user.ativo IS NOT TRUE THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'Usuário não encontrado ou inativo.');
  END IF;
  IF v_user.senha_hash IS NULL OR v_user.senha_hash <> extensions.crypt(p_senha, v_user.senha_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'Senha incorreta.');
  END IF;
  DELETE FROM public.login_tentativas WHERE login = v_login AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login, true);
  DELETE FROM public.login_tentativas WHERE login = v_login AND criado_em < now() - interval '2 days';
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + interval '12 hours';
  IF v_user.tipo = 'mesa' THEN
    v_tipo_sessao := 'mesa';
    INSERT INTO public.sessoes_mesa (mesa_id, session_token_hash, expira_em, ativa) VALUES (v_user.id, public._hash_token(v_token), v_expira, true);
  ELSE
    v_tipo_sessao := 'funcionario';
    INSERT INTO public.sessoes_funcionario (funcionario_id, session_token_hash, expira_em, ativa) VALUES (v_user.id, public._hash_token(v_token), v_expira, true);
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'usuario', jsonb_build_object('id', v_user.id, 'nome', v_user.nome, 'login', v_user.login, 'tipo', v_user.tipo, 'perfil', COALESCE(v_user.perfil, v_user.tipo)), 'tipo_sessao', v_tipo_sessao, 'session_token', v_token, 'expira_em', v_expira));
END;
$$;
COMMENT ON FUNCTION public.autenticar_usuario(text,text) IS 'Autentica com bcrypt e cria sessão sem invalidar anteriores (multi-dispositivo).';

-- ----------------------------------------------------------------------------
-- 4. ENCERRAMENTO DE SESSÃO DE MESA COM AUTORIZAÇÃO DE STAFF (senha)
--    Corrige falha crítica: valida funcionário existe/ativo/permissão e senha_hash
--    com bcrypt, sem aceitar combinações arbitrárias. Autorização no banco.
-- ----------------------------------------------------------------------------
-- Remover stubs PIN-only se existirem (adiado), para garantir senha é o vigente
DROP FUNCTION IF EXISTS public.encerrar_sessao_mesa_autorizada(text, text);
DROP FUNCTION IF EXISTS public.encerrar_sessao_mesa_autorizada(text, text, text);

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
  -- Bloqueio 5 tentativas / 15min com lock para concorrência
  PERFORM pg_advisory_xact_lock(hashtext(v_login_norm));
  SELECT count(*) INTO v_falhas FROM public.login_tentativas WHERE login = v_login_norm AND sucesso = false AND criado_em > now() - interval '15 minutes';
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
  -- Valida senha com bcrypt (sem armazenar plaintext, sem logar senha)
  IF v_staff.senha_hash IS NULL OR v_staff.senha_hash <> extensions.crypt(p_staff_senha, v_staff.senha_hash) THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'Senha do funcionário incorreta.');
  END IF;
  -- Sucesso: limpa falhas anteriores e registra sucesso (persiste, não faz ROLLBACK)
  DELETE FROM public.login_tentativas WHERE login = v_login_norm AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_login_norm, true);
  DELETE FROM public.login_tentativas WHERE login = v_login_norm AND criado_em < now() - interval '2 days';
  v_hash_mesa := public._hash_token(p_session_token_mesa);
  SELECT mesa_id INTO v_mesa_id FROM public.sessoes_mesa WHERE session_token_hash = v_hash_mesa AND ativa = true LIMIT 1;
  IF v_mesa_id IS NULL THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;
  -- Encerra exclusivamente a sessão cujo token foi fornecido (não afeta outras mesas/dispositivos)
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash_mesa;
  RETURN jsonb_build_object('mensagem', 'Sessão da mesa encerrada com autorização.', 'mesa_id', v_mesa_id, 'autorizado_por', v_staff.nome, 'autorizado_login', v_staff.login, 'autorizado_perfil', v_staff.perfil);
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text,text) IS 'Encerra sessão de mesa apenas com validação de credencial de staff (gerente/atendente) via senha_hash bcrypt. Impede logout não autorizado.';
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. ENDURECER encerrar_sessao para sessões de mesa (exige RPC autorizada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encerrar_sessao(p_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text; v_is_mesa boolean;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.'); END IF;
  v_hash := public._hash_token(p_session_token);
  SELECT EXISTS (SELECT 1 FROM public.sessoes_mesa WHERE session_token_hash = v_hash AND ativa = true) INTO v_is_mesa;
  IF v_is_mesa THEN RAISE EXCEPTION 'Encerramento de sessão de mesa requer autorização de funcionário. Use encerrar_sessao_mesa_autorizada.' USING ERRCODE = '42501'; END IF;
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash;
  UPDATE public.sessoes_funcionario SET ativa = false WHERE session_token_hash = v_hash;
  RETURN jsonb_build_object('mensagem', 'Sessão encerrada.');
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao(text) IS 'Encerra sessão de funcionário; sessões de mesa exigem autorização via encerrar_sessao_mesa_autorizada.';

-- ----------------------------------------------------------------------------
-- 6. Permissões e limpeza PIN (adiado)
--    Garante que funções PIN não fiquem acessíveis quando não são o requisito vigente.
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;
-- Se colunas PIN existirem por engano, não as usa; mantém mas sem grants
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='pin_hash') THEN
    COMMENT ON COLUMN public.usuarios.pin_hash IS 'PIN adiado 24/10 — não usar; encerramento vigente usa senha_hash.';
  END IF;
END $$;

-- Dependências: 20261017_neoorder_hardening.sql (base). Compatível com 20261020 anterior (idempotente).
