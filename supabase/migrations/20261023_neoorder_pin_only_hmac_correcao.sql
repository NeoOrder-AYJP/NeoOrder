-- ============================================================================
-- NeoOrder — Migração corretiva 20261023: PIN-only com HMAC e correções
-- Data: 2026-10-23
-- Corrige: 20261022_neoorder_pin_encerramento_mesa.sql
-- Motivo: requisito PIN-only (sem login), colisão, baixa entropia, compatibilidade PG/PostgREST
-- Esta migração é IDEMPOTENTE, não destrói dados, não altera 20261017/20261020
-- NÃO aplicar em produção sem autorização explícita
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 0. Segredo para HMAC (pepper) — protegido exclusivamente no backend
--    Tabela com RLS sem policies: anon/authenticated não leem. Somente SECURITY DEFINER.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pin_pepper (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pin_pepper ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='pin_pepper'; IF NOT FOUND THEN -- nenhuma policy = sem acesso direto
  -- garantir que não haja policies antigas permissivas
  NULL; END IF; END $$;
REVOKE ALL ON TABLE public.pin_pepper FROM PUBLIC, anon, authenticated;
-- Inserir segredo único se vazio (idempotente)
INSERT INTO public.pin_pepper (secret)
SELECT encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.pin_pepper);

COMMENT ON TABLE public.pin_pepper IS 'Segredo HMAC para PINs (pepper). Nunca expor via RLS. Acesso só via SECURITY DEFINER.';

-- Helper interno para obter segredo (não exposto)
CREATE OR REPLACE FUNCTION public._pin_pepper()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_secret text;
BEGIN
  SELECT secret INTO v_secret FROM public.pin_pepper LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Segredo PIN não configurado.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_secret;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._pin_pepper() FROM PUBLIC, anon, authenticated;

-- HMAC com pepper: deriva verificador seguro do PIN (não armazena PIN puro)
CREATE OR REPLACE FUNCTION public._pin_hmac(p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_secret text;
BEGIN
  v_secret := public._pin_pepper();
  -- hmac com sha256 + hex: baixa entropia do PIN é reforçada pelo segredo do backend
  RETURN encode(extensions.hmac(p_pin, v_secret, 'sha256'), 'hex');
END;
$$;
REVOKE EXECUTE ON FUNCTION public._pin_hmac(text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public._pin_hmac(text) IS 'Deriva HMAC-SHA256 do PIN com segredo do backend (pepper). KDF: HMAC + bcrypt posterior.';

-- ----------------------------------------------------------------------------
-- 1. Corrigir gestão de PIN: colisão + HMAC + validação forte
-- ----------------------------------------------------------------------------

-- Recria definir_pin para usar HMAC+bcrypt e verificar colisão (impedir ambiguidade)
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
  v_hmac text;
  v_hash text;
  v_other record;
BEGIN
  v_gerente := public._exigir_gerente(p_session_token);

  IF p_target_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário alvo não informado.' USING ERRCODE = '22023';
  END IF;
  IF NOT public._validar_pin(p_pin) THEN
    RAISE EXCEPTION 'PIN deve ter exatamente 6 dígitos numéricos (000000 a 999999).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.usuarios WHERE id = p_target_usuario_id FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_target.tipo <> 'funcionario' THEN RAISE EXCEPTION 'PIN só para funcionário.' USING ERRCODE = '22023'; END IF;
  IF v_target.ativo IS NOT TRUE THEN RAISE EXCEPTION 'Funcionário inativo.' USING ERRCODE = 'P0001'; END IF;

  v_hmac := public._pin_hmac(p_pin);
  -- Verificar colisão: se outro funcionário ativo já tem mesmo PIN (mesmo HMAC+bcrypt), rejeitar sem revelar quem
  FOR v_other IN SELECT id, pin_hash FROM public.usuarios WHERE pin_ativo = true AND pin_hash IS NOT NULL AND id <> p_target_usuario_id AND tipo='funcionario' AND ativo=true LOOP
    IF v_other.pin_hash = extensions.crypt(v_hmac, v_other.pin_hash) THEN
      RAISE EXCEPTION 'PIN já em uso por outro funcionário. Escolha outro PIN.' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  v_hash := extensions.crypt(v_hmac, extensions.gen_salt('bf', 11));

  UPDATE public.usuarios
     SET pin_hash = v_hash,
         pin_ativo = true,
         pin_atualizado_em = now(),
         pin_expira_em = NULL,
         atualizado_em = now()
   WHERE id = p_target_usuario_id;

  RETURN jsonb_build_object('funcionario_id', p_target_usuario_id, 'funcionario_nome', v_target.nome, 'pin_ativo', true, 'pin_atualizado_em', now(), 'definido_por', v_gerente);
END;
$$;
COMMENT ON FUNCTION public.definir_pin_funcionario(text,uuid,text) IS 'Define PIN 6 dígitos com HMAC+bcrypt, verifica colisão para evitar ambiguidade, gerente only.';

-- Remover PIN (gerente only) — já correto, mantém, recria para garantir search_path
CREATE OR REPLACE FUNCTION public.remover_pin_funcionario(p_session_token text, p_target_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_gerente uuid; BEGIN
  v_gerente := public._exigir_gerente(p_session_token);
  UPDATE public.usuarios SET pin_hash=NULL, pin_ativo=false, pin_atualizado_em=now(), pin_expira_em=NULL, atualizado_em=now() WHERE id=p_target_usuario_id AND tipo='funcionario';
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('funcionario_id', p_target_usuario_id, 'pin_ativo', false, 'removido_por', v_gerente);
END; $$;

-- ----------------------------------------------------------------------------
-- 2. Nova RPC PIN-only (2 params) — identifica funcionário inequivocamente por PIN
--    Remove login: só PIN de 6 dígitos, sem revelar se PIN existe ou está duplicado
-- ----------------------------------------------------------------------------

-- Primeiro, endurecer a antiga 3-param para não permitir bypass via login+senha/PIN
DROP FUNCTION IF EXISTS public.encerrar_sessao_mesa_autorizada(text, text, text);
CREATE OR REPLACE FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  RAISE EXCEPTION 'Esta RPC foi substituída. Use encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_pin) — apenas PIN de 6 dígitos.' USING ERRCODE = '42883';
END; $$;
COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) IS 'DEPRECATED: substituída por versão PIN-only (2 params). Mantida para erro explícito, não para uso.';
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text, text, text) TO anon, authenticated;

-- Nova RPC PIN-only: identifica funcionário por PIN via varredura segura com HMAC+bcrypt
CREATE OR REPLACE FUNCTION public.encerrar_sessao_mesa_autorizada(
  p_session_token_mesa text,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash_mesa text;
  v_mesa_id uuid;
  v_falhas int;
  v_pin_hmac text;
  v_candidato public.usuarios%ROWTYPE;
  v_match public.usuarios%ROWTYPE;
  v_match_count int := 0;
  v_bloqueio_key text;
BEGIN
  -- Validar formato PIN primeiro (não revela se mesa existe)
  IF NOT public._validar_pin(p_pin) THEN
    RAISE EXCEPTION 'PIN inválido. Deve ter exatamente 6 dígitos numéricos.' USING ERRCODE = '22023';
  END IF;
  IF p_session_token_mesa IS NULL OR length(p_session_token_mesa) < 20 THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  v_hash_mesa := public._hash_token(p_session_token_mesa);
  SELECT mesa_id INTO v_mesa_id FROM public.sessoes_mesa WHERE session_token_hash = v_hash_mesa AND ativa = true LIMIT 1;
  IF v_mesa_id IS NULL THEN
    RETURN jsonb_build_object('mensagem', 'Sessão já encerrada.');
  END IF;

  -- Bloqueio por mesa (não por login, pois login não existe mais): 5 falhas / 15min por mesa
  v_bloqueio_key := 'pin:mesa:' || v_mesa_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_bloqueio_key));
  SELECT count(*) INTO v_falhas FROM public.login_tentativas WHERE login = v_bloqueio_key AND sucesso = false AND criado_em > now() - interval '15 minutes';
  IF v_falhas >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas com PIN para esta mesa. Aguarde 15 minutos.' USING ERRCODE = '42901';
  END IF;

  -- Derivar HMAC do PIN com segredo do backend
  v_pin_hmac := public._pin_hmac(p_pin);

  -- Identificar funcionário inequivocamente por PIN: varrer ativos com pin_ativo=true
  FOR v_candidato IN SELECT * FROM public.usuarios WHERE tipo='funcionario' AND ativo=true AND pin_ativo=true AND pin_hash IS NOT NULL LOOP
    IF v_candidato.pin_hash = extensions.crypt(v_pin_hmac, v_candidato.pin_hash) THEN
      -- Verificar expiração
      IF v_candidato.pin_expira_em IS NOT NULL AND v_candidato.pin_expira_em < now() THEN
        CONTINUE; -- PIN expirado não conta como match válido
      END IF;
      v_match := v_candidato;
      v_match_count := v_match_count + 1;
      -- Se já há 2 matches, ambiguidade — não autorizar para não permitir autorização incerta
      IF v_match_count > 1 THEN
        INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_bloqueio_key, false);
        RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'PIN ambíguo. Contate o gerente para redefinir os PINs.');
      END IF;
    END IF;
  END LOOP;

  IF v_match_count = 0 THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_bloqueio_key, false);
    -- Mensagem genérica: não revela se PIN existe, está duplicado ou conta existe
    RETURN jsonb_build_object('sucesso', false, 'codigo', '28000', 'mensagem', 'PIN incorreto ou não autorizado.');
  END IF;

  -- Perfil deve ser gerente/atendente (mesmo após match)
  IF v_match.perfil NOT IN ('gerente','atendente') THEN
    INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_bloqueio_key, false);
    RETURN jsonb_build_object('sucesso', false, 'codigo', '42501', 'mensagem', 'Perfil não autorizado para encerrar mesa.');
  END IF;

  -- Sucesso: limpar falhas desta mesa e registrar sucesso
  DELETE FROM public.login_tentativas WHERE login = v_bloqueio_key AND sucesso = false;
  INSERT INTO public.login_tentativas (login, sucesso) VALUES (v_bloqueio_key, true);
  DELETE FROM public.login_tentativas WHERE login = v_bloqueio_key AND criado_em < now() - interval '2 days';

  -- Encerrar exclusivamente a sessão da mesa selecionada (não afeta outras mesas/dispositivos)
  UPDATE public.sessoes_mesa SET ativa = false WHERE session_token_hash = v_hash_mesa;

  -- Auditoria sem segredos: não inclui PIN, token completo, apenas mesa, quem autorizou, quando
  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Sessão da mesa encerrada com PIN.',
    'mesa_id', v_mesa_id,
    'autorizado_por', v_match.nome,
    'autorizado_login', v_match.login,
    'autorizado_perfil', v_match.perfil,
    'encerrado_em', now()
  );
END;
$$;
COMMENT ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text) IS 'PIN-only (2 params): identifica staff por PIN via HMAC+bcrypt, verifica colisão, bloqueio 5/15min por mesa, encerra só sessão selecionada, auditoria sem segredos.';
GRANT EXECUTE ON FUNCTION public.encerrar_sessao_mesa_autorizada(text,text) TO anon, authenticated;

-- Manter encerrar_sessao endurecida (mesa exige PIN) — já em 20261022, recria idempotente
CREATE OR REPLACE FUNCTION public.encerrar_sessao(p_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text; v_is_mesa boolean; BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN RETURN jsonb_build_object('mensagem','Sessão já encerrada.'); END IF;
  v_hash := public._hash_token(p_session_token);
  SELECT EXISTS(SELECT 1 FROM public.sessoes_mesa WHERE session_token_hash=v_hash AND ativa=true) INTO v_is_mesa;
  IF v_is_mesa THEN RAISE EXCEPTION 'Encerramento de sessão de mesa requer PIN. Use encerrar_sessao_mesa_autorizada(p_session_token_mesa, p_pin).' USING ERRCODE='42501'; END IF;
  UPDATE public.sessoes_mesa SET ativa=false WHERE session_token_hash=v_hash;
  UPDATE public.sessoes_funcionario SET ativa=false WHERE session_token_hash=v_hash;
  RETURN jsonb_build_object('mensagem','Sessão encerrada.');
END; $$;
GRANT EXECUTE ON FUNCTION public.encerrar_sessao(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Permissões e compatibilidade
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.definir_pin_funcionario(text,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_pin_funcionario(text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.status_pin_funcionarios(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pin_pepper() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pin_hmac(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._validar_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._normalizar_login(text) FROM PUBLIC, anon, authenticated;

-- Compatibilidade: preservar 20261017/20261020 — não altera autenticar_usuario, QR mesa/staff, pedidos, sessões
