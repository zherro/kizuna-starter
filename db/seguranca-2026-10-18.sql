-- db/seguranca-2026-10-18.sql
-- Só as 3 migrations novas da correção de segurança de 18/10/2026, juntas, numa transação.
-- Rodar à mão:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seguranca-2026-10-18.sql
-- Fontes: kizuna-core/plugins/services/0015_services_moderation_guard.sql,
--         kizuna-core/sql/0119_password_reset_revokes_sessions.sql,
--         kizuna-core/sql/0120_login_requires_purpose.sql
-- ATENÇÃO (0120): o app precisa estar com o auth-handlers.ts novo (assina `purpose: login`),
-- senão o login pelo site para de funcionar. Suba o código antes ou junto.

BEGIN;

-- ===================================================================================
-- services/0015 — dono não publica nem patrocina o próprio anúncio
-- ===================================================================================
CREATE OR REPLACE FUNCTION public.fn_services_moderation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $function$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_uid    text;
BEGIN
  IF v_claims IS NOT NULL THEN
    BEGIN
      v_uid := v_claims::jsonb ->> 'user_id';
    EXCEPTION WHEN others THEN
      v_uid := NULL;
    END;
  END IF;
  IF v_uid IS NULL AND current_user NOT IN ('anon', 'auth_user') THEN
    RETURN NEW;
  END IF;

  IF auth.fun_auth_has_perm('services', 'moderate') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.sponsored := false;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
      NEW.status := OLD.status;
    END IF;
    NEW.sponsored := OLD.sponsored;
    NEW.tenant_id := OLD.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_moderation_guard ON public.services;
CREATE TRIGGER trg_services_moderation_guard
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.fn_services_moderation_guard();

-- ===================================================================================
-- 0119 — reset de senha revoga as sessões abertas
-- ===================================================================================
CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_confirm(
  p_token_hash text,
  p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_token_id bigint;
  v_uid uuid;
BEGIN
  PERFORM auth.fun_auth__password_reset_assert_purpose();

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.user_uid
    INTO v_token_id, v_uid
  FROM auth.password_reset_tokens t
  JOIN auth.users u ON u.uid = t.user_uid
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
    AND COALESCE(u.is_active, false)
    AND u.deleted_at IS NULL
  FOR UPDATE OF t;

  IF v_token_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE auth.users
     SET password = auth.crypt(p_password, auth.gen_salt('bf', 10)),
         sessions_revoked_at = date_trunc('second', now())
   WHERE uid = v_uid;

  UPDATE auth.password_reset_tokens
     SET used_at = now()
   WHERE user_uid = v_uid
     AND used_at IS NULL;

  RETURN true;
END;
$$;

-- ===================================================================================
-- 0120 — login direto no PostgREST exige claim purpose = 'login'
-- ===================================================================================
CREATE OR REPLACE FUNCTION auth.fun_auth__login_with_perms(
  p_login text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user uuid;
  v_tenant uuid;
  v_tenant_type text;
  v_is_root boolean;
  v_perms jsonb;
  v_claims text;
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'login' THEN
    RAISE EXCEPTION 'login_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT user_uid, tenant_uid, tenant_type
    INTO v_user, v_tenant, v_tenant_type
  FROM auth.fun_auth__login_verify(p_login, p_password)
  LIMIT 1;

  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_root INTO v_is_root FROM auth.users WHERE uid = v_user;

  v_claims :=
    jsonb_build_object(
      'user_id', v_user::text,
      'tenant_id', v_tenant::text,
      'tenant_type', v_tenant_type,
      'is_root', COALESCE(v_is_root, false)
    )::text;

  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT auth.get_auth__effective_permissions()
    INTO v_perms;

  RETURN jsonb_build_object(
    'user_uid', v_user::text,
    'tenant_uid', v_tenant::text,
    'tenant_type', v_tenant_type,
    'is_root', COALESCE(v_is_root, false),
    'perms', COALESCE(v_perms, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__login_with_perms(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_with_perms(text, text) TO anon, auth_user;

COMMIT;

NOTIFY pgrst, 'reload schema';
