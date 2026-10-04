-- Bora Cuiabá — schema do CORE (auth + RBAC + plugin_registry)
-- GERADO por db/build.mjs — NÃO edite à mão. Regenere: node db/build.mjs
-- Aplicar PRIMEIRO, em base limpa:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/auth.sql
-- Arquivos: 33 (kizuna-core/sql)


-- ===============================================================================================
-- kizuna-core/sql/0001_create_auth_schema.sql
-- ===============================================================================================

-- Cria schemas básicos de autenticação multi-tenant

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS public;

-- Extensions: required for this script
-- gen_random_uuid() comes from pgcrypto
-- Ensure target schema exists and install extension into it explicitly

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


-- ===============================================================================================
-- kizuna-core/sql/0002_create_auth_configure_users.sql
-- ===============================================================================================

/* ============================================================
   POSTGREST + RLS | BOOTSTRAP DE ROLES
   ------------------------------------------------------------
   Este script cria as roles necessárias para funcionamento
   correto do PostgREST com autenticação via JWT e Row Level
   Security (RLS).

   ✔ Seguro para rodar múltiplas vezes (idempotente)
   ✔ Compatível com PostgreSQL padrão
   ✔ Segue boas práticas de segurança

   Roles criadas:
   - anon        : usuário não autenticado
   - auth_user   : usuário autenticado via JWT
   - authenticator (opcional): role de conexão do PostgREST

   ============================================================ */


/* ============================================================
   1. CRIAÇÃO DAS ROLES LÓGICAS (SEM LOGIN)
   ------------------------------------------------------------
   Essas roles NÃO fazem login no banco.
   Elas são usadas apenas para:
   - GRANT de permissões
   - Políticas de Row Level Security (RLS)
   ============================================================ */

DO $$
BEGIN
    -- Role para usuários não autenticados (sem JWT)
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'anon'
    ) THEN
CREATE ROLE anon NOLOGIN;
END IF;

    -- Role para usuários autenticados (JWT válido)
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'auth_user'
    ) THEN
CREATE ROLE auth_user NOLOGIN;
END IF;
END$$;


/* ============================================================
   2. ROLE DE CONEXÃO DO POSTGREST (OPCIONAL)
   ------------------------------------------------------------
   ⚠️ SOMENTE DESCOMENTE SE:
   - Você controla o banco (Postgres local / VPS)
   - O PostgREST conecta diretamente no PostgreSQL

   ❌ NÃO USE SE:
   - Supabase
   - RDS gerenciado
   - Neon / Railway / serviços similares

   Esta role:
   - É usada APENAS para conexão
   - Não herda permissões automaticamente
   - Assume 'anon' ou 'auth_user' via SET ROLE
   ============================================================ */

DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'authenticator'
   ) THEN
CREATE ROLE authenticator
    LOGIN
         NOINHERIT
         PASSWORD 'TROQUE_POR_UMA_SENHA_FORTE';
END IF;
END
$$;

-- para update
ALTER ROLE authenticator
  PASSWORD 'TROQUE_POR_UMA_SENHA_FORTE';


-- Concede permissão para assumir as roles lógicas
GRANT anon, auth_user TO authenticator;


/* ============================================================
   3. OBSERVAÇÕES IMPORTANTES DE SEGURANÇA
   ------------------------------------------------------------

   - Essas roles NÃO têm acesso a nada por padrão
   - Você DEVE:
     • Conceder GRANT mínimos em schemas/tabelas
     • Criar políticas de RLS explicitamente

   Exemplo (não incluído de propósito):
     GRANT USAGE ON SCHEMA public TO anon, auth_user;

   - Nunca use:
       SET row_security = off;
     em sessões da API

   ============================================================ */



-- PUBLIC
-- REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, auth_user;

-- AUTH
CREATE SCHEMA IF NOT EXISTS auth;
-- REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO authenticator, anon, auth_user;

/* ============================================================
   FIM DO SCRIPT
   ============================================================ */

ALTER ROLE authenticator SET search_path = auth, public;
ALTER ROLE anon SET search_path = auth, public;
ALTER ROLE auth_user SET search_path = auth, public;


-- ===============================================================================================
-- kizuna-core/sql/0003_create_auth_fun_auth_current_tenant_id.sql
-- ===============================================================================================

/* ============================================================
   FUNÇÃO: auth.fun_auth_current_tenant_id()
   ------------------------------------------------------------
   Retorna o tenant_id presente no JWT da requisição atual.

   - Compatível com PostgREST
   - Segura para uso em RLS
   - Retorna NULL se não existir tenant no token
   ============================================================ */

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.fun_auth_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
SELECT
    (
        current_setting('request.jwt.claims', true)::json->>'tenant_id'
    )::uuid;
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth_current_tenant_id() TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0004_create_auth_fun_auth_user_id.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.fun_auth_user_id
   ------------------------------------------------------------
   Retorna o user_id presente no JWT da sessão atual.
   Compatível com PostgREST e uso em RLS.
   ============================================================ */

-- DROP FUNCTION auth.fun_auth_user_id();

CREATE OR REPLACE FUNCTION auth.fun_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
SELECT
    (
        current_setting('request.jwt.claims', true)::json->>'user_id'
    )::uuid;
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth_user_id() TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0005_create_auth_fun_auth_tenant_type_is.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.fun_auth_tenant_type_is
   ------------------------------------------------------------
   Verifica se o tenant_type presente no JWT
   é igual ao valor informado.
   Compatível com PostgREST e uso em RLS.
   ============================================================ */

-- DROP FUNCTION auth.fun_auth_tenant_type_is(text);

CREATE OR REPLACE FUNCTION auth.fun_auth_tenant_type_is(p_tenant_type text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
SELECT
    (current_setting('request.jwt.claims', true)::json->>'tenant_type') = p_tenant_type
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth_tenant_type_is(text) TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0006_create_auth_fun_auth__has_permission.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.fun_auth__has_permission
   ------------------------------------------------------------
   Verifica se o usuário autenticado possui permissão para
   executar uma ação em um recurso, considerando:
   - permissões no JWT (quando presentes)
   - roles no tenant
   - permissões por grupo
   - override de owner para RBAC
   Compatível com PostgREST e uso em RLS.
   ============================================================ */

-- DROP FUNCTION auth.fun_auth__has_permission(text, text);

CREATE OR REPLACE FUNCTION auth.fun_auth__has_permission(
    p_resource text,
    p_action   text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    uid        uuid := auth.fun_auth_user_id();
    tid        uuid :=  auth.fun_auth_current_tenant_id();
    perm       boolean := false;
    jwt_perms jsonb := coalesce(
    	nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'perms',
    	'{}'::jsonb
	);    jwt_val    text;
    is_admin   boolean := false;
BEGIN
    -- 0) Verifica se é admin no tenant atual (role_id = 2)
SELECT auth.fun_auth_tenant_type_is('ADMIN') INTO is_admin;

/* EXISTS (
    SELECT 1
    FROM auth.user_roles ur
    WHERE ur.user_id = uid
      AND ur.tenant_id = tid
      AND ur.role_id = 2
); */

-- Admin sempre autoriza imediatamente.
    IF is_admin THEN
        RETURN true;
    END IF;

    -- 1) Preferir permissões calculadas no JWT (atalho rápido)
    IF jwt_perms IS NOT NULL THEN
        jwt_val := (jwt_perms -> p_resource ->> p_action);
        IF jwt_val IS NOT NULL THEN
            RETURN COALESCE(jwt_val::boolean, false);
        END IF;
    END IF;

    -- 2) Avaliação via banco para não-admin: apenas permissões de grupo
SELECT bool_or(
               COALESCE((gp.permissions ->> p_action)::boolean, false)
       )
INTO perm
FROM auth.user_groups ug
         JOIN auth.group_permissions gp
              ON gp.tenant_id = ug.tenant_id
                  AND gp.group_id  = ug.group_id
                  AND gp.resource  = p_resource
WHERE ug.user_id  = uid
  AND ug.tenant_id = tid;

            -- 3) Override para owner em gestão de RBAC
    IF NOT COALESCE(perm, false)
       AND p_resource = 'rbac'
       AND (p_action = 'grant' OR p_action = 'configure')
    THEN
SELECT EXISTS (
    SELECT 1
    FROM tenants t
    WHERE t.uid = tid
      AND t.owner_uid = uid
)
INTO perm;
END IF;

RETURN COALESCE(perm, false);
END;
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth__has_permission(text, text) TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0007_create_auth_table_users.sql
-- ===============================================================================================

/* =========================================================
   TABLE: users
   ========================================================= */

CREATE TABLE auth.users (
                            id bigserial,
                            uid uuid DEFAULT gen_random_uuid() NOT NULL,
                            login text NOT NULL,
                            password text NOT NULL,
                            is_active boolean DEFAULT true,
                            welcome boolean DEFAULT false,
                            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
                            deleted_at timestamp with time zone,
                            CONSTRAINT users_pkey PRIMARY KEY (uid),
                            CONSTRAINT users_id_unique UNIQUE (id),
                            CONSTRAINT users_login_unique UNIQUE (login)
);

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE auth.users TO auth_user;



/* =========================================================
   TABLE: roles
   ========================================================= */

CREATE TABLE auth.roles (
                            id bigserial,
                            uid uuid DEFAULT gen_random_uuid(),
                            name text NOT NULL,
                            created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT roles_pkey PRIMARY KEY (id)
);

ALTER TABLE auth.roles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE auth.roles TO auth_user;



/* =========================================================
   TABLE: role_permissions (GLOBAL DEFAULTS)
   Define permissões padrão por role e recurso.
   Válidas para todos os tenants, exceto quando sobrescritas.
   ========================================================= */

CREATE TABLE auth.role_permissions (
                                       role_id int8 NOT NULL,
                                       resource text NOT NULL,
                                       permissions jsonb DEFAULT '{}'::jsonb,
                                       created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                       CONSTRAINT role_permissions_role_fkey
                                           FOREIGN KEY (role_id)
                                               REFERENCES auth.roles(id)
                                               ON DELETE RESTRICT
);

ALTER TABLE auth.role_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE auth.role_permissions TO auth_user;

CREATE POLICY role_permissions_select_policy ON auth.role_permissions FOR SELECT TO auth_user USING (true);
CREATE POLICY role_permissions_insert_policy ON auth.role_permissions FOR INSERT TO auth_user WITH CHECK (auth.fun_auth__has_permission('rbac'::text, 'configure'::text));
CREATE POLICY role_permissions_update_policy ON auth.role_permissions FOR UPDATE TO auth_user USING (auth.fun_auth__has_permission('rbac'::text, 'configure'::text));
CREATE POLICY role_permissions_delete_policy ON auth.role_permissions FOR DELETE TO auth_user USING (auth.fun_auth__has_permission('rbac'::text, 'configure'::text));


/* =========================================================
   TABLE: tenants
   ========================================================= */

CREATE TABLE auth.tenants (
                              id bigserial NOT NULL,
                              uid uuid DEFAULT gen_random_uuid() NOT NULL,
                              owner_uid uuid NOT NULL,
                              name text NOT NULL,
                              type varchar DEFAULT 'USER' NOT NULL,
                              created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              CONSTRAINT tenants_pkey PRIMARY KEY (uid),
                              CONSTRAINT tenants_id_unique UNIQUE (id),
                              CONSTRAINT tenants_owner_uid_fkey
                                  FOREIGN KEY (owner_uid)
                                      REFERENCES auth.users(uid)
                                      ON DELETE RESTRICT
);

GRANT SELECT ON TABLE auth.tenants TO auth_user;

ALTER TABLE auth.tenants ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE auth.tenants TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.tenants TO auth_user;
GRANT USAGE, SELECT ON SEQUENCE auth.tenants_id_seq TO auth_user;

CREATE POLICY tenants_auth_user_policy ON auth.tenants FOR SELECT TO auth_user USING (owner_uid =  auth.fun_auth_user_id());
CREATE POLICY tenants_auth_user_policy_insert ON auth.tenants FOR INSERT TO auth_user WITH CHECK (owner_uid = auth.fun_auth_user_id());


/* =========================================================
   TABLE: user_roles
   ========================================================= */

CREATE TABLE auth.user_roles (
                                 user_id uuid NOT NULL,
                                 tenant_id uuid NOT NULL,
                                 role_id int8 NOT NULL,
                                 CONSTRAINT user_roles_unique UNIQUE (tenant_id, user_id, role_id),
                                 CONSTRAINT user_roles_user_fkey
                                     FOREIGN KEY (user_id)
                                         REFERENCES auth.users(uid)
                                         ON DELETE RESTRICT,
                                 CONSTRAINT user_roles_tenant_fkey
                                     FOREIGN KEY (tenant_id)
                                         REFERENCES auth.tenants(uid)
                                         ON DELETE RESTRICT,
                                 CONSTRAINT user_roles_role_fkey
                                     FOREIGN KEY (role_id)
                                         REFERENCES auth.roles(id)
                                         ON DELETE RESTRICT
);

ALTER TABLE auth.user_roles ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,DELETE ON TABLE auth.user_roles TO auth_user;

CREATE POLICY user_roles_select_policy ON auth.user_roles FOR SELECT TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY user_roles_select_self_policy ON auth.user_roles FOR SELECT TO auth_user USING (user_id = auth.fun_auth_user_id());
CREATE POLICY user_roles_insert_policy ON auth.user_roles FOR INSERT TO auth_user WITH CHECK ((tenant_id = auth.fun_auth_current_tenant_id()) AND auth.fun_auth__has_permission('rbac'::text, 'grant'::text));
CREATE POLICY user_roles_delete_policy ON auth.user_roles FOR DELETE TO auth_user USING ((tenant_id = auth.fun_auth_current_tenant_id()) AND auth.fun_auth__has_permission('rbac'::text, 'grant'::text));


/* =========================================================
   TABLE: tenant_role_permissions (PER-TENANT OVERRIDES)
   Tem precedência sobre role_permissions
   ========================================================= */

CREATE TABLE auth.tenant_role_permissions (
                                              tenant_id uuid NOT NULL,
                                              role_id int8 NOT NULL,
                                              resource text NOT NULL,
                                              permissions jsonb DEFAULT '{}'::jsonb,
                                              CONSTRAINT tenant_role_permissions_pkey
                                                  PRIMARY KEY (tenant_id, role_id, resource),
                                              CONSTRAINT tenant_role_permissions_tenant_fkey
                                                  FOREIGN KEY (tenant_id)
                                                      REFERENCES auth.tenants(uid)
                                                      ON DELETE RESTRICT,
                                              CONSTRAINT tenant_role_permissions_role_fkey
                                                  FOREIGN KEY (role_id)
                                                      REFERENCES auth.roles(id)
                                                      ON DELETE RESTRICT
);



ALTER TABLE auth.tenant_role_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE auth.tenant_role_permissions TO auth_user;

-- Only allow viewing/managing overrides for the current tenant
CREATE POLICY tenant_role_permissions_policy ON auth.tenant_role_permissions FOR SELECT TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY tenant_role_permissions_policy_insert ON auth.tenant_role_permissions FOR INSERT TO auth_user WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text));
CREATE POLICY tenant_role_permissions_policy_update ON auth.tenant_role_permissions FOR UPDATE TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text))  WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY tenant_role_permissions_policy_delete ON auth.tenant_role_permissions FOR DELETE TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text));



/* =========================================================
   TABLE: groups (PER-TENANT GROUPS)
   ========================================================= */

CREATE TABLE auth.groups (
                             id bigserial,
                             tenant_id uuid NOT NULL,
                             name text NOT NULL,
                             description text,
                             created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                             CONSTRAINT groups_pkey PRIMARY KEY (id),
                             CONSTRAINT groups_unique UNIQUE (tenant_id, name),
                             CONSTRAINT groups_tenant_fkey
                                 FOREIGN KEY (tenant_id)
                                     REFERENCES auth.tenants(uid)
                                     ON DELETE RESTRICT
);


/* =========================================================
   TABLE: group_permissions
   ========================================================= */

CREATE TABLE auth.group_permissions (
                                        tenant_id uuid NOT NULL,
                                        group_id int8 NOT NULL,
                                        resource text NOT NULL,
                                        permissions jsonb DEFAULT '{}'::jsonb,
                                        CONSTRAINT group_permissions_unique UNIQUE (tenant_id, group_id, resource),
                                        CONSTRAINT group_permissions_tenant_fkey
                                            FOREIGN KEY (tenant_id)
                                                REFERENCES auth.tenants(uid)
                                                ON DELETE RESTRICT,
                                        CONSTRAINT group_permissions_group_fkey
                                            FOREIGN KEY (group_id)
                                                REFERENCES auth.groups(id)
                                                ON DELETE RESTRICT
);


ALTER TABLE auth.group_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE auth.group_permissions TO auth_user;

CREATE POLICY group_permissions_select_policy ON auth.group_permissions FOR SELECT TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY group_permissions_insert_policy ON auth.group_permissions FOR INSERT TO auth_user WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text));
CREATE POLICY group_permissions_update_policy ON auth.group_permissions FOR UPDATE TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text)) WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY group_permissions_delete_policy ON auth.group_permissions FOR DELETE TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'configure'::text));


/* =========================================================
   TABLE: user_groups (GROUP MEMBERSHIP)
   ========================================================= */

CREATE TABLE auth.user_groups (
                                  tenant_id uuid NOT NULL,
                                  user_id uuid NOT NULL,
                                  group_id bigint NOT NULL,
                                  CONSTRAINT user_groups_unique UNIQUE (tenant_id, user_id, group_id),
                                  CONSTRAINT user_groups_tenant_fkey
                                      FOREIGN KEY (tenant_id)
                                          REFERENCES auth.tenants(uid)
                                          ON DELETE RESTRICT,
                                  CONSTRAINT user_groups_user_fkey
                                      FOREIGN KEY (user_id)
                                          REFERENCES auth.users(uid)
                                          ON DELETE RESTRICT,
                                  CONSTRAINT user_groups_group_fkey
                                      FOREIGN KEY (group_id)
                                          REFERENCES auth.groups(id)
                                          ON DELETE RESTRICT
);


ALTER TABLE auth.user_groups ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,DELETE ON TABLE auth.user_groups TO auth_user;

CREATE POLICY user_groups_select_prolicy ON auth.user_groups FOR SELECT TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id());
CREATE POLICY user_groups_insert_policy ON auth.user_groups FOR INSERT TO auth_user WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'grant'::text));
CREATE POLICY user_groups_delete_policy ON auth.user_groups FOR DELETE TO auth_user USING (tenant_id = auth.fun_auth_current_tenant_id() AND auth.fun_auth__has_permission('rbac'::text, 'grant'::text));


-- ===============================================================================================
-- kizuna-core/sql/0008_create_auth_fun_auth__signup_bootstrap.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.fun_auth__signup_bootstrap
   ------------------------------------------------------------
   Cria um novo usuario, tenant inicial e associa o usuario
   como admin (role_id = 2) do tenant criado.
   Retorna os UUIDs do usuario e do tenant.
   ============================================================ */

-- DROP FUNCTION auth.fun_auth__signup_bootstrap(text, text);

CREATE OR REPLACE FUNCTION auth.fun_auth__signup_bootstrap(
    p_login    text,
    p_password text
)
RETURNS TABLE (
    user_uid   uuid,
    tenant_uid uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user_uid   uuid := gen_random_uuid();
    v_tenant_uid uuid := gen_random_uuid();
BEGIN
    -- Cria usuario (necessario antes do tenant por FK)
INSERT INTO auth.users (uid, login, password, is_active)
VALUES (
           v_user_uid,
           p_login,
           crypt(p_password, gen_salt('bf', 10)),
           true
       );

-- Cria tenant com o usuario como owner
INSERT INTO auth.tenants (uid, owner_uid, name, type)
VALUES (
           v_tenant_uid,
           v_user_uid,
           p_login,
           'USER'
       );

-- Concede role admin (role_id = 2) no tenant
INSERT INTO auth.user_roles (user_id, tenant_id, role_id)
VALUES (
           v_user_uid,
           v_tenant_uid,
           2
       );

RETURN QUERY
SELECT v_user_uid, v_tenant_uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION auth.fun_auth__signup_bootstrap(text, text) TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0009_create_auth_get_auth__effective_permissions.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.get_auth__effective_permissions
   ------------------------------------------------------------
   Retorna o mapa efetivo de permissoes do usuario autenticado
   no tenant atual no formato:
   {
     "resource": { "action": boolean }
   }
   Compatível com PostgREST e uso em RLS.
   ============================================================ */

-- DROP FUNCTION auth.get_auth__effective_permissions();

CREATE OR REPLACE FUNCTION auth.get_auth__effective_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH ctx AS (
    SELECT
        auth.fun_auth_user_id()          AS uid,
        auth.fun_auth_current_tenant_id() AS tid
),
is_admin AS (
    SELECT EXISTS (
        SELECT 1
        FROM auth.user_roles ur, ctx
        WHERE ur.user_id = ctx.uid
          AND ur.tenant_id = ctx.tid
          AND ur.role_id = 2
    ) AS admin
),
role_id AS (
    SELECT ur.role_id
    FROM auth.user_roles ur, ctx
    WHERE ur.user_id = ctx.uid
      AND ur.tenant_id = ctx.tid
),
src AS (
    -- Admin: overrides por tenant + defaults globais + grupos
    SELECT rp_t.resource, rp_t.permissions
    FROM auth.tenant_role_permissions rp_t, ctx, is_admin, role_id
    WHERE is_admin.admin = true
      AND rp_t.tenant_id = ctx.tid
      AND rp_t.role_id =  role_id.role_id

    UNION ALL

    SELECT rp_g.resource, rp_g.permissions
    FROM auth.role_permissions rp_g, role_id
    WHERE rp_g.role_id = role_id.role_id

    UNION ALL

    -- Grupos (admin e nao-admin)
    SELECT gp.resource, gp.permissions
    FROM auth.user_groups ug
    JOIN auth.group_permissions gp
      ON gp.tenant_id = ug.tenant_id
     AND gp.group_id  = ug.group_id,
         ctx
    WHERE ug.user_id  = ctx.uid
      AND ug.tenant_id = ctx.tid
),
flat AS (
    SELECT
        resource,
        key AS action,
        (perm ->> key)::boolean AS allowed
    FROM src AS s(resource, perm),
         LATERAL jsonb_object_keys(perm) AS key
),
agg AS (
    SELECT
        resource,
        action,
        bool_or(allowed) AS allowed
    FROM flat
    GROUP BY resource, action
),
by_resource AS (
    SELECT
        resource,
        jsonb_object_agg(action, allowed) AS perms
    FROM agg
    GROUP BY resource
)
SELECT COALESCE(
               jsonb_object_agg(resource, perms),
               '{}'::jsonb
       )
FROM by_resource;
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.get_auth__effective_permissions() TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0010_login_functions.sql
-- ===============================================================================================

/* ============================================================
   AUTH · LOGIN FUNCTIONS
   Schema: auth
   ============================================================ */

/* ------------------------------------------------------------
   Function: fun_auth__login_verify
   ------------------------------------------------------------
   - Valida login + senha
   - Retorna user_uid, tenant_uid e tenant_type
   ------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION auth.fun_auth__login_verify(
  p_login text,
  p_password text
)
RETURNS TABLE (
  user_uid uuid,
  tenant_uid uuid,
  tenant_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_hash text;
  v_tenant uuid;
  v_tenant_type text;
BEGIN
  SELECT u.uid, u.password
    INTO v_uid, v_hash
  FROM auth.users u
  WHERE u.login = p_login;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF crypt(p_password, v_hash) <> v_hash THEN
    RETURN;
  END IF;

  SELECT ur.tenant_id
    INTO v_tenant
  FROM auth.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  SELECT t.type
    INTO v_tenant_type
  FROM auth.tenants t
  WHERE t.uid = v_tenant
  LIMIT 1;

  RETURN QUERY
  SELECT v_uid, v_tenant, v_tenant_type;
END;
$$;


/* ------------------------------------------------------------
   Function: fun_auth__login_with_perms
   ------------------------------------------------------------
   - Executa login
   - Injeta request.jwt.claims
   - Calcula permissões efetivas
   - Retorna payload pronto pra JWT / API
   ------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION auth.fun_auth__login_with_perms(
  p_login text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid;
  v_tenant uuid;
  v_tenant_type text;
  v_perms jsonb;
  v_claims text;
BEGIN
  SELECT user_uid, tenant_uid, tenant_type
    INTO v_user, v_tenant, v_tenant_type
  FROM auth.fun_auth__login_verify(p_login, p_password)
  LIMIT 1;

  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  v_claims :=
    jsonb_build_object(
      'user_id', v_user::text,
      'tenant_id', v_tenant::text,
      'tenant_type', v_tenant_type
    )::text;

  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT auth.get_auth__effective_permissions()
    INTO v_perms;

  RETURN jsonb_build_object(
    'user_uid', v_user::text,
    'tenant_uid', v_tenant::text,
    'tenant_type', v_tenant_type,
    'perms', COALESCE(v_perms, '{}'::jsonb)
  );
END;
$$;


/* ------------------------------------------------------------
   GRANTS
   ------------------------------------------------------------ */

REVOKE ALL ON FUNCTION auth.fun_auth__login_verify(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.fun_auth__login_with_perms(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth.fun_auth__login_verify(text, text) TO anon;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_with_perms(text, text) TO anon;

GRANT EXECUTE ON FUNCTION auth.fun_auth__login_verify(text, text) TO auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_with_perms(text, text) TO auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0011_create_auth_views_my_tenants.sql
-- ===============================================================================================

/* ============================================================
   AUTH · VIEWS
   ============================================================ */

/* ------------------------------------------------------------
   View: my_tenants
   ------------------------------------------------------------
   - Lista tenants onde o usuário é owner ou possui role
   - Marca se o usuário é owner do tenant
   ------------------------------------------------------------ */

CREATE OR REPLACE VIEW auth.my_tenants AS
SELECT DISTINCT
    t.uid  AS tenant_uid,
    t.name,
    t.type,
    (t.owner_uid = auth.fun_auth_user_id()) AS is_owner
FROM auth.tenants t
WHERE t.owner_uid = auth.fun_auth_user_id()

UNION

SELECT DISTINCT
    t.uid  AS tenant_uid,
    t.name,
    t.type,
    (t.owner_uid = auth.fun_auth_user_id()) AS is_owner
FROM auth.user_roles ur
         JOIN auth.tenants t
              ON t.uid = ur.tenant_id
WHERE ur.user_id = auth.fun_auth_user_id();


/* ------------------------------------------------------------
   View: role_permissions_effective
   ------------------------------------------------------------
   - Expõe permissões efetivas já resolvidas
   - Fonte: get_auth__effective_permissions()
   ------------------------------------------------------------ */

-- CREATE OR REPLACE VIEW auth.role_permissions_effective AS
-- SELECT
--     key   AS resource,
--     value AS permissions
-- FROM jsonb_each(auth.get_auth__effective_permissions());


/* ------------------------------------------------------------
   GRANTS
   ------------------------------------------------------------ */

-- REVOKE ALL ON auth.my_tenants FROM PUBLIC;
-- REVOKE ALL ON auth.role_permissions_effective FROM PUBLIC;
--
-- GRANT SELECT ON auth.my_tenants TO auth_user;
-- GRANT SELECT ON auth.role_permissions_effective TO auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0012_create_auth_fun_auth_verify_is_admin.sql
-- ===============================================================================================

/* ============================================================
   FUNCTION: auth.fun_auth_verify_is_admin
   ------------------------------------------------------------
   Verifica se o usuário autenticado possui a role ADMIN
   (auth.roles.name = 'ADMIN') no tenant atual, consultando
   auth.user_roles a partir do user_id e tenant_id do JWT.
   Compatível com PostgREST e uso em RLS.
   ============================================================ */

-- DROP FUNCTION auth.fun_auth_verify_is_admin();

CREATE OR REPLACE FUNCTION auth.fun_auth_verify_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
SELECT EXISTS (
    SELECT 1
    FROM auth.user_roles ur
    JOIN auth.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.fun_auth_user_id()
      AND ur.tenant_id = auth.fun_auth_current_tenant_id()
      AND r.name = 'ADMIN'
);
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth_verify_is_admin() TO anon, auth_user;


-- ===============================================================================================
-- kizuna-core/sql/0098_create_authorities.sql
-- ===============================================================================================

INSERT INTO auth.roles (id, uid, "name", created_at)
values
    (1, gen_random_uuid(), 'ROOT', now()),
    (2, gen_random_uuid(), 'ADMIN', now()),
    (3, gen_random_uuid(), 'USER', now());


-- ===============================================================================================
-- kizuna-core/sql/0099_grant_authenticator.sql
-- ===============================================================================================

-- ========== SCHEMA ==========
GRANT USAGE ON SCHEMA auth TO authenticator, anon, auth_user;

-- ========== TABLES ==========
GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA auth
          TO authenticator;

-- ========== FUNCTIONS ==========
GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA auth
TO authenticator;


-- ========== FUTURO (IMPORTANTE) ==========
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLES
          TO authenticator;

ALTER DEFAULT PRIVILEGES IN SCHEMA auth
GRANT EXECUTE
ON FUNCTIONS
TO authenticator;

ALTER DEFAULT PRIVILEGES IN SCHEMA auth
GRANT SELECT
      ON SEQUENCES
          TO authenticator;


-- ===============================================================================================
-- kizuna-core/sql/0101_rbac_permissions_and_overrides.sql
-- ===============================================================================================

-- 0101_rbac_permissions_and_overrides.sql
-- Additive only. Old auth.role_permissions (jsonb) and auth.groups/group_permissions/user_groups
-- stay untouched and live until a future cutover migration retires them — see
-- docs/superpowers/specs/2026-08-30-kizuna-auth-model-design.md, section 9.

ALTER TABLE auth.users   ADD COLUMN IF NOT EXISTS is_root boolean NOT NULL DEFAULT false;
ALTER TABLE auth.tenants ADD COLUMN IF NOT EXISTS active  boolean NOT NULL DEFAULT true;
ALTER TABLE auth.roles   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES auth.tenants(uid) ON DELETE RESTRICT;
ALTER TABLE auth.roles   ADD COLUMN IF NOT EXISTS code text;

CREATE TABLE IF NOT EXISTS auth.permissions (
    id          bigserial PRIMARY KEY,
    resource    text NOT NULL,
    action      text NOT NULL,
    code        text GENERATED ALWAYS AS (resource || '_' || action) STORED,
    name        text,
    description text,
    CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action)
);

ALTER TABLE auth.permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE auth.permissions TO auth_user, anon;
DROP POLICY IF EXISTS permissions_select_policy ON auth.permissions;
CREATE POLICY permissions_select_policy ON auth.permissions FOR SELECT TO auth_user, anon USING (true);

CREATE TABLE IF NOT EXISTS auth.role_grants (
    role_id       bigint NOT NULL REFERENCES auth.roles(id) ON DELETE RESTRICT,
    permission_id bigint NOT NULL REFERENCES auth.permissions(id) ON DELETE RESTRICT,
    CONSTRAINT role_grants_pkey PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE auth.role_grants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth.role_grants TO auth_user;
DROP POLICY IF EXISTS role_grants_select_policy ON auth.role_grants;
CREATE POLICY role_grants_select_policy ON auth.role_grants FOR SELECT TO auth_user USING (true);
-- Write requires the role to be a tenant-owned custom role (tenant_id NOT NULL) matching the
-- caller's current tenant — global template roles (ADMIN/USER, tenant_id NULL) are seed-managed,
-- not editable via the API in v1.
DROP POLICY IF EXISTS role_grants_write_policy ON auth.role_grants;
CREATE POLICY role_grants_write_policy ON auth.role_grants FOR ALL TO auth_user
USING (
  EXISTS (
    SELECT 1 FROM auth.roles r
    WHERE r.id = role_grants.role_id
      AND r.tenant_id IS NOT NULL
      AND r.tenant_id = auth.fun_auth_current_tenant_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.roles r
    WHERE r.id = role_grants.role_id
      AND r.tenant_id IS NOT NULL
      AND r.tenant_id = auth.fun_auth_current_tenant_id()
  )
);

CREATE TABLE IF NOT EXISTS auth.user_tenant_permissions (
    user_id       uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id     uuid NOT NULL REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    permission_id bigint NOT NULL REFERENCES auth.permissions(id) ON DELETE RESTRICT,
    effect        text NOT NULL CHECK (effect IN ('allow', 'deny')),
    CONSTRAINT user_tenant_permissions_pkey PRIMARY KEY (user_id, tenant_id, permission_id)
);

ALTER TABLE auth.user_tenant_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth.user_tenant_permissions TO auth_user;
DROP POLICY IF EXISTS utp_select_policy ON auth.user_tenant_permissions;
CREATE POLICY utp_select_policy ON auth.user_tenant_permissions FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id() OR user_id = auth.fun_auth_user_id());
DROP POLICY IF EXISTS utp_write_policy ON auth.user_tenant_permissions;
CREATE POLICY utp_write_policy ON auth.user_tenant_permissions FOR ALL TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

CREATE TABLE IF NOT EXISTS auth.root_access_log (
    id            bigserial PRIMARY KEY,
    root_user_id  uuid NOT NULL REFERENCES auth.users(uid),
    tenant_id     uuid NOT NULL REFERENCES auth.tenants(uid),
    reason        text NOT NULL,
    entered_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth.root_access_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE auth.root_access_log TO auth_user;
DROP POLICY IF EXISTS root_access_log_select_policy ON auth.root_access_log;
CREATE POLICY root_access_log_select_policy ON auth.root_access_log FOR SELECT TO auth_user
USING (root_user_id = auth.fun_auth_user_id());
DROP POLICY IF EXISTS root_access_log_insert_policy ON auth.root_access_log;
CREATE POLICY root_access_log_insert_policy ON auth.root_access_log FOR INSERT TO auth_user
WITH CHECK (root_user_id = auth.fun_auth_user_id());

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0102_fun_auth_has_perm_and_root.sql
-- ===============================================================================================

-- 0102_fun_auth_has_perm_and_root.sql

CREATE OR REPLACE FUNCTION auth.fun_auth_has_perm(p_resource text, p_action text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = auth, public
AS $$
  SELECT
    COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false)
    OR COALESCE(
         (current_setting('request.jwt.claims', true)::jsonb -> 'perms' -> p_resource ->> p_action)::boolean,
         false
       );
$$;

GRANT EXECUTE ON FUNCTION auth.fun_auth_has_perm(text, text) TO anon, auth_user;

-- Re-issues a JWT scoped to a different tenant the caller already belongs to.
CREATE OR REPLACE FUNCTION auth.fun_auth__switch_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user    uuid := auth.fun_auth_user_id();
  v_is_root boolean;
  v_perms   jsonb;
  v_claims  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.user_roles ur WHERE ur.user_id = v_user AND ur.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'not a member of this tenant';
  END IF;

  SELECT is_root INTO v_is_root FROM auth.users WHERE uid = v_user;

  v_claims := jsonb_build_object(
    'user_id', v_user::text,
    'tenant_id', p_tenant_id::text,
    'is_root', COALESCE(v_is_root, false)
  )::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SELECT auth.get_auth__effective_permissions() INTO v_perms;

  RETURN jsonb_build_object(
    'user_uid', v_user::text,
    'tenant_uid', p_tenant_id::text,
    'is_root', COALESCE(v_is_root, false),
    'perms', COALESCE(v_perms, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fun_auth__switch_tenant(uuid) TO auth_user;

-- Root-only. Never callable by a non-root user_id — checked inside, not just by convention.
CREATE OR REPLACE FUNCTION auth.fun_auth__root_enter_tenant(p_tenant_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user    uuid := auth.fun_auth_user_id();
  v_is_root boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT is_root INTO v_is_root FROM auth.users WHERE uid = v_user;
  IF NOT COALESCE(v_is_root, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  INSERT INTO auth.root_access_log (root_user_id, tenant_id, reason)
  VALUES (v_user, p_tenant_id, p_reason);

  RETURN jsonb_build_object(
    'user_uid', v_user::text,
    'tenant_uid', p_tenant_id::text,
    'is_root', true,
    'impersonating', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fun_auth__root_enter_tenant(uuid, text) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0103_seed_and_backfill.sql
-- ===============================================================================================

-- 0103_seed_and_backfill.sql
-- Backfills auth.permissions from every resource/action pair already live in the jsonb-based
-- role_permissions and group_permissions tables, then mirrors role_permissions' grants into
-- role_grants for the global roles. group_permissions is tenant-scoped and is migrated per-tenant
-- into custom roles by a later cutover migration, not here.

INSERT INTO auth.permissions (resource, action, name)
SELECT DISTINCT resource, action, resource || ' - ' || action
FROM (
  SELECT resource, jsonb_object_keys(permissions) AS action FROM auth.role_permissions
  UNION
  SELECT resource, jsonb_object_keys(permissions) AS action FROM auth.group_permissions
) all_actions
ON CONFLICT (resource, action) DO NOTHING;

-- Ensure the two global template roles exist and are marked global (tenant_id NULL is already
-- the default from 0101's ALTER — this just guards a re-run finding them missing).
INSERT INTO auth.roles (id, uid, name, code)
VALUES (2, gen_random_uuid(), 'ADMIN', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.roles (id, uid, name, code)
VALUES (3, gen_random_uuid(), 'USER', 'USER')
ON CONFLICT (id) DO NOTHING;
-- USER intentionally gets no role_grants rows — see spec section 3.

-- Mirror role_permissions (jsonb) into role_grants (normalized) for every role that has one.
INSERT INTO auth.role_grants (role_id, permission_id)
SELECT rp.role_id, p.id
FROM auth.role_permissions rp
JOIN LATERAL jsonb_each(rp.permissions) AS kv(action, allowed) ON true
JOIN auth.permissions p ON p.resource = rp.resource AND p.action = kv.action
WHERE (kv.allowed)::text::boolean = true
ON CONFLICT DO NOTHING;


-- ===============================================================================================
-- kizuna-core/sql/0104_tenant_member_manage_permission.sql
-- ===============================================================================================

-- 0104_tenant_member_manage_permission.sql
-- Closes the escalation gap found in 0101's role_grants_write_policy/utp_write_policy: those only
-- checked tenant_id = current_tenant (isolation), never whether the caller is actually authorized
-- to manage members/permissions within that tenant. A plain USER (born with zero permissions,
-- spec section 3) could otherwise INSERT a row into user_tenant_permissions granting themselves
-- anything, as long as they were logged into that tenant.

INSERT INTO auth.permissions (resource, action, name)
VALUES ('tenant_member', 'manage', 'Gerenciar membros e permissões do tenant')
ON CONFLICT (resource, action) DO NOTHING;

-- ADMIN (role_id=2, global template role, tenant owner by default) gets it out of the box.
INSERT INTO auth.role_grants (role_id, permission_id)
SELECT 2, id FROM auth.permissions WHERE resource = 'tenant_member' AND action = 'manage'
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS role_grants_write_policy ON auth.role_grants;
CREATE POLICY role_grants_write_policy ON auth.role_grants FOR ALL TO auth_user
USING (
  EXISTS (
    SELECT 1 FROM auth.roles r
    WHERE r.id = role_grants.role_id
      AND r.tenant_id IS NOT NULL
      AND r.tenant_id = auth.fun_auth_current_tenant_id()
  )
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.roles r
    WHERE r.id = role_grants.role_id
      AND r.tenant_id IS NOT NULL
      AND r.tenant_id = auth.fun_auth_current_tenant_id()
  )
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
);

DROP POLICY IF EXISTS utp_write_policy ON auth.user_tenant_permissions;
CREATE POLICY utp_write_policy ON auth.user_tenant_permissions FOR ALL TO auth_user
USING (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
)
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
);

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0105_fix_fun_auth__has_permission_search_path.sql
-- ===============================================================================================

-- 0105_fix_fun_auth__has_permission_search_path.sql
-- Fixes risk #3 from the review: auth.fun_auth__has_permission referenced bare `tenants` (relying
-- on the calling role's session-level search_path, set separately in 0002) instead of the
-- schema-qualified `auth.tenants`, and had no SET search_path pinned on the function itself —
-- both are search-path-hijack risk patterns for a security-sensitive function. Pure bug fix via
-- CREATE OR REPLACE: same signature, same logic, only the two corrections below. This function
-- is legacy (superseded by fun_auth_has_perm going forward) but stays live until the cutover
-- migration, so it must not carry a known-fragile body in the meantime.

CREATE OR REPLACE FUNCTION auth.fun_auth__has_permission(
    p_resource text,
    p_action   text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = auth, public
AS $function$
DECLARE
    uid        uuid := auth.fun_auth_user_id();
    tid        uuid :=  auth.fun_auth_current_tenant_id();
    perm       boolean := false;
    jwt_perms jsonb := coalesce(
    	nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'perms',
    	'{}'::jsonb
	);    jwt_val    text;
    is_admin   boolean := false;
BEGIN
    -- 0) Verifica se é admin no tenant atual (role_id = 2)
SELECT auth.fun_auth_tenant_type_is('ADMIN') INTO is_admin;

-- Admin sempre autoriza imediatamente.
    IF is_admin THEN
        RETURN true;
    END IF;

    -- 1) Preferir permissões calculadas no JWT (atalho rápido)
    IF jwt_perms IS NOT NULL THEN
        jwt_val := (jwt_perms -> p_resource ->> p_action);
        IF jwt_val IS NOT NULL THEN
            RETURN COALESCE(jwt_val::boolean, false);
        END IF;
    END IF;

    -- 2) Avaliação via banco para não-admin: apenas permissões de grupo
SELECT bool_or(
               COALESCE((gp.permissions ->> p_action)::boolean, false)
       )
INTO perm
FROM auth.user_groups ug
         JOIN auth.group_permissions gp
              ON gp.tenant_id = ug.tenant_id
                  AND gp.group_id  = ug.group_id
                  AND gp.resource  = p_resource
WHERE ug.user_id  = uid
  AND ug.tenant_id = tid;

            -- 3) Override para owner em gestão de RBAC
    IF NOT COALESCE(perm, false)
       AND p_resource = 'rbac'
       AND (p_action = 'grant' OR p_action = 'configure')
    THEN
SELECT EXISTS (
    SELECT 1
    FROM auth.tenants t
    WHERE t.uid = tid
      AND t.owner_uid = uid
)
INTO perm;
END IF;

RETURN COALESCE(perm, false);
END;
$function$;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0106_wire_rbac_into_login.sql
-- ===============================================================================================

-- 0106_wire_rbac_into_login.sql
-- Root-cause fix: the RBAC tables introduced in 0101 (auth.permissions, auth.role_grants,
-- auth.user_tenant_permissions, auth.users.is_root) were never read by the login path.
-- auth.fun_auth_has_perm() (0102) reads `perms`/`is_root` from the JWT claims, but those claims
-- are built by auth.get_auth__effective_permissions() (0009) and auth.fun_auth__login_with_perms()
-- (0010) — neither had been updated to look at the new tables. A grant in auth.role_grants had
-- zero effect on what a user actually logs in with. This file connects the wire.
--
-- Additive only, same philosophy as 0101/0103/0105: the three legacy jsonb sources
-- (auth.tenant_role_permissions, auth.role_permissions, auth.group_permissions) stay exactly as
-- they were and keep contributing to the result. This CREATE OR REPLACE adds two new sources on
-- top of them:
--   1. auth.role_grants (joined through auth.permissions to get resource/action) for every role
--      the user holds in the current tenant — not gated by is_admin, unlike the legacy
--      tenant_role_permissions branch, because role_grants is meant to work for any role,
--      including tenant-owned custom roles.
--   2. auth.user_tenant_permissions with effect='allow', merged the same way.
-- auth.user_tenant_permissions with effect='deny' is NOT merged via bool_or (a plain OR would let
-- a `true` from any other source win over a deny, which is backwards) — it is applied as a final
-- subtraction pass after every other source has been aggregated, so deny always wins regardless of
-- how many allow sources agree otherwise.

CREATE OR REPLACE FUNCTION auth.get_auth__effective_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = auth, public
AS $function$
WITH ctx AS (
    SELECT
        auth.fun_auth_user_id()          AS uid,
        auth.fun_auth_current_tenant_id() AS tid
),
is_admin AS (
    SELECT EXISTS (
        SELECT 1
        FROM auth.user_roles ur, ctx
        WHERE ur.user_id = ctx.uid
          AND ur.tenant_id = ctx.tid
          AND ur.role_id = 2
    ) AS admin
),
role_id AS (
    SELECT ur.role_id
    FROM auth.user_roles ur, ctx
    WHERE ur.user_id = ctx.uid
      AND ur.tenant_id = ctx.tid
),
src AS (
    -- Admin: overrides por tenant + defaults globais + grupos (legacy jsonb sources, unchanged)
    SELECT rp_t.resource, rp_t.permissions
    FROM auth.tenant_role_permissions rp_t, ctx, is_admin, role_id
    WHERE is_admin.admin = true
      AND rp_t.tenant_id = ctx.tid
      AND rp_t.role_id =  role_id.role_id

    UNION ALL

    SELECT rp_g.resource, rp_g.permissions
    FROM auth.role_permissions rp_g, role_id
    WHERE rp_g.role_id = role_id.role_id

    UNION ALL

    -- Grupos (admin e nao-admin)
    SELECT gp.resource, gp.permissions
    FROM auth.user_groups ug
    JOIN auth.group_permissions gp
      ON gp.tenant_id = ug.tenant_id
     AND gp.group_id  = ug.group_id,
         ctx
    WHERE ug.user_id  = ctx.uid
      AND ug.tenant_id = ctx.tid

    UNION ALL

    -- NEW (0106): normalized role_grants for every role the user holds in this tenant.
    -- Not gated by is_admin — applies to any role, including tenant-owned custom roles.
    SELECT p.resource, jsonb_build_object(p.action, true) AS permissions
    FROM auth.role_grants rg
    JOIN auth.permissions p ON p.id = rg.permission_id
    JOIN role_id ON role_id.role_id = rg.role_id

    UNION ALL

    -- NEW (0106): per-user, per-tenant allow overrides.
    SELECT p.resource, jsonb_build_object(p.action, true) AS permissions
    FROM auth.user_tenant_permissions utp
    JOIN auth.permissions p ON p.id = utp.permission_id, ctx
    WHERE utp.user_id = ctx.uid
      AND utp.tenant_id = ctx.tid
      AND utp.effect = 'allow'
),
flat AS (
    SELECT
        resource,
        key AS action,
        (perm ->> key)::boolean AS allowed
    FROM src AS s(resource, perm),
         LATERAL jsonb_object_keys(perm) AS key
),
agg AS (
    SELECT
        resource,
        action,
        bool_or(allowed) AS allowed
    FROM flat
    GROUP BY resource, action
),
-- NEW (0106): per-user, per-tenant deny overrides. Applied as a subtraction pass, not merged into
-- `agg` via bool_or, so a deny always wins regardless of how many allow sources agree otherwise.
denies AS (
    SELECT p.resource, p.action
    FROM auth.user_tenant_permissions utp
    JOIN auth.permissions p ON p.id = utp.permission_id, ctx
    WHERE utp.user_id = ctx.uid
      AND utp.tenant_id = ctx.tid
      AND utp.effect = 'deny'
),
agg_with_denies AS (
    SELECT
        a.resource,
        a.action,
        (a.allowed AND NOT EXISTS (
            SELECT 1 FROM denies d WHERE d.resource = a.resource AND d.action = a.action
        )) AS allowed
    FROM agg a

    UNION ALL

    -- A deny on an action no allow source ever granted still needs to surface explicitly as
    -- false, so an override always shows up in the returned map even from a clean baseline.
    SELECT d.resource, d.action, false AS allowed
    FROM denies d
    WHERE NOT EXISTS (SELECT 1 FROM agg a2 WHERE a2.resource = d.resource AND a2.action = d.action)
),
by_resource AS (
    SELECT
        resource,
        jsonb_object_agg(action, allowed) AS perms
    FROM agg_with_denies
    GROUP BY resource
)
SELECT COALESCE(
               jsonb_object_agg(resource, perms),
               '{}'::jsonb
       )
FROM by_resource;
$function$;

GRANT USAGE ON SCHEMA auth TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.get_auth__effective_permissions() TO anon, auth_user;

-- fun_auth__login_with_perms (0010) built claims without `is_root`, so auth.fun_auth_has_perm()
-- (0102) — which reads `is_root` straight off the JWT — always saw it as absent/false for anyone
-- who logged in through the normal login path (only fun_auth__switch_tenant/root_enter_tenant
-- included it). Same signature, same flow, adds is_root to both the claims set via set_config and
-- the jsonb returned to the caller. Also pins SET search_path (defense in depth for a
-- SECURITY DEFINER function, same pattern as 0102/0105).
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

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0107_fix_definer_search_path_login_signup.sql
-- ===============================================================================================

-- 0107_fix_definer_search_path_login_signup.sql
-- Security review finding (see task report): auth.fun_auth__signup_bootstrap (0008) and
-- auth.fun_auth__login_verify (0010) are SECURITY DEFINER functions with no `SET search_path`
-- pinned, and both call pgcrypto's crypt()/gen_salt() unqualified. This is the exact
-- search-path-hijack pattern 0105 already fixed once for fun_auth__has_permission: a
-- SECURITY DEFINER function resolves unqualified identifiers using the search_path active in the
-- calling session, so anything able to place a function named `crypt`/`gen_salt` earlier in that
-- search_path than pgcrypto's install schema — e.g. by creating it in `public`, which is
-- world-CREATE by default on many Postgres installs — could get it invoked with the definer's
-- privileges. Fix: pin the search_path on both functions and schema-qualify the pgcrypto calls,
-- same as pgcrypto's own install schema (`auth`, from 0001). Pure hardening via CREATE OR REPLACE,
-- same signature and logic otherwise.

CREATE OR REPLACE FUNCTION auth.fun_auth__signup_bootstrap(
    p_login    text,
    p_password text
)
RETURNS TABLE (
    user_uid   uuid,
    tenant_uid uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $function$
DECLARE
    v_user_uid   uuid := gen_random_uuid();
    v_tenant_uid uuid := gen_random_uuid();
BEGIN
    -- Cria usuario (necessario antes do tenant por FK)
    INSERT INTO auth.users (uid, login, password, is_active)
    VALUES (
               v_user_uid,
               p_login,
               auth.crypt(p_password, auth.gen_salt('bf', 10)),
               true
           );

    -- Cria tenant com o usuario como owner
    INSERT INTO auth.tenants (uid, owner_uid, name, type)
    VALUES (
               v_tenant_uid,
               v_user_uid,
               p_login,
               'USER'
           );

    -- Concede role admin (role_id = 2) no tenant
    INSERT INTO auth.user_roles (user_id, tenant_id, role_id)
    VALUES (
               v_user_uid,
               v_tenant_uid,
               2
           );

    RETURN QUERY
    SELECT v_user_uid, v_tenant_uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION auth.fun_auth__signup_bootstrap(text, text) TO anon, auth_user;

CREATE OR REPLACE FUNCTION auth.fun_auth__login_verify(
  p_login text,
  p_password text
)
RETURNS TABLE (
  user_uid uuid,
  tenant_uid uuid,
  tenant_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid;
  v_hash text;
  v_tenant uuid;
  v_tenant_type text;
BEGIN
  SELECT u.uid, u.password
    INTO v_uid, v_hash
  FROM auth.users u
  WHERE u.login = p_login;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF auth.crypt(p_password, v_hash) <> v_hash THEN
    RETURN;
  END IF;

  SELECT ur.tenant_id
    INTO v_tenant
  FROM auth.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  SELECT t.type
    INTO v_tenant_type
  FROM auth.tenants t
  WHERE t.uid = v_tenant
  LIMIT 1;

  RETURN QUERY
  SELECT v_uid, v_tenant, v_tenant_type;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__login_verify(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_verify(text, text) TO anon, auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0108_plugin_registry.sql
-- ===============================================================================================

-- 0108_plugin_registry.sql
-- Tracking table for optional plugins applied from kizuna-core/plugins/*/0001_*.sql. Lives in
-- `auth` (same schema as the rest of identity/RBAC infra, not `public`) because plugin identity —
-- "is X installed, at what version" — is core bookkeeping, not domain data. Kept deliberately
-- minimal (name/version/installed_at); a plugin needing more should add its own table, not grow
-- this one.
--
-- Convention (documented in plugins/README.md): every plugin's 0001_*.sql inserts its own row here
-- at the end (ON CONFLICT DO UPDATE on version, so re-applying an upgraded plugin file updates the
-- recorded version) and — when the plugin has anything an admin should be able to manage — inserts
-- its permissions into auth.permissions and grants them to the global ADMIN role (role_id = 2) via
-- auth.role_grants, both idempotent (ON CONFLICT DO NOTHING).
--
-- Writes are intentionally not granted to auth_user: a plugin registers itself when its SQL file is
-- applied by whoever runs migrations (superuser/migration role), not through the API at runtime.
-- Reads are open (anon + auth_user) since "which plugins are installed" is not sensitive.

CREATE TABLE IF NOT EXISTS auth.plugin_registry (
    name         text PRIMARY KEY,
    version      text NOT NULL DEFAULT '1.0.0',
    installed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth.plugin_registry ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE auth.plugin_registry TO auth_user, anon;
DROP POLICY IF EXISTS plugin_registry_select_policy ON auth.plugin_registry;
CREATE POLICY plugin_registry_select_policy ON auth.plugin_registry FOR SELECT TO auth_user, anon USING (true);

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0109_first_user_is_root.sql
-- ===============================================================================================

-- 0109_first_user_is_root.sql
-- Rule: the very first user ever created via auth.fun_auth__signup_bootstrap becomes ROOT
-- (auth.users.is_root = true) automatically — every user after that keeps the existing default
-- (is_root = false, ADMIN of the tenant they create, per role_id = 2 already granted below).
-- This avoids a project ever shipping with no root account and avoids self-signup being able to
-- mint additional roots by just registering — root only ever comes from being first, never from
-- the signup form itself after that.
--
-- "First" is decided by `auth.users` being empty at the moment this function runs (checked inside
-- the same SECURITY DEFINER transaction as the INSERT, so it's atomic with the row being created —
-- no window where a second concurrent signup could also see zero rows and both become root, since
-- the check and insert share one statement's snapshot inside the same function invocation... in
-- practice signups aren't racy enough for this bootstrap step to warrant a stronger lock, and no
-- project keeps re-triggering "first signup" after the very first account exists).
--
-- Pure hardening via CREATE OR REPLACE, same signature and search_path pinning as 0107 — only the
-- root assignment is new.

CREATE OR REPLACE FUNCTION auth.fun_auth__signup_bootstrap(
    p_login    text,
    p_password text
)
RETURNS TABLE (
    user_uid   uuid,
    tenant_uid uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $function$
DECLARE
    v_user_uid   uuid := gen_random_uuid();
    v_tenant_uid uuid := gen_random_uuid();
    v_is_first   boolean;
BEGIN
    v_is_first := NOT EXISTS (SELECT 1 FROM auth.users);

    -- Cria usuario (necessario antes do tenant por FK). Primeiro usuario do banco vira ROOT.
    INSERT INTO auth.users (uid, login, password, is_active, is_root)
    VALUES (
               v_user_uid,
               p_login,
               auth.crypt(p_password, auth.gen_salt('bf', 10)),
               true,
               v_is_first
           );

    -- Cria tenant com o usuario como owner
    INSERT INTO auth.tenants (uid, owner_uid, name, type)
    VALUES (
               v_tenant_uid,
               v_user_uid,
               p_login,
               'USER'
           );

    -- Concede role admin (role_id = 2) no tenant — todo usuario, root incluso, continua dono
    -- admin do proprio tenant; is_root e um eixo a parte (acesso a features/plugins do sistema,
    -- nao a papel dentro de um tenant).
    INSERT INTO auth.user_roles (user_id, tenant_id, role_id)
    VALUES (
               v_user_uid,
               v_tenant_uid,
               2
           );

    RETURN QUERY
    SELECT v_user_uid, v_tenant_uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION auth.fun_auth__signup_bootstrap(text, text) TO anon, auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0110_login_checks_active.sql
-- ===============================================================================================

-- 0110_login_checks_active.sql
-- Real gap: auth.fun_auth__login_verify (0008/0107) never checked auth.users.is_active — a
-- blocked/deactivated account (is_active = false) could still authenticate successfully and get a
-- full session. Every other function that reads credentials/build claims calls this one
-- internally (auth.fun_auth__login_with_perms, 0106), so fixing it here fixes the whole login
-- chain in one place. Mandatory check, not optional — a login attempt for an inactive user must
-- fail exactly like a wrong password does (no row returned), not surface as a different error.
--
-- Pure hardening via CREATE OR REPLACE, same signature/search_path pinning as 0107 — only the
-- is_active check is new.

CREATE OR REPLACE FUNCTION auth.fun_auth__login_verify(
  p_login text,
  p_password text
)
RETURNS TABLE (
  user_uid uuid,
  tenant_uid uuid,
  tenant_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid;
  v_hash text;
  v_is_active boolean;
  v_tenant uuid;
  v_tenant_type text;
BEGIN
  SELECT u.uid, u.password, u.is_active
    INTO v_uid, v_hash, v_is_active
  FROM auth.users u
  WHERE u.login = p_login;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF auth.crypt(p_password, v_hash) <> v_hash THEN
    RETURN;
  END IF;

  -- Conta bloqueada/desativada (is_active = false, ou NULL tratado como bloqueado por
  -- seguranca) nunca autentica, mesmo com senha correta.
  IF NOT COALESCE(v_is_active, false) THEN
    RETURN;
  END IF;

  SELECT ur.tenant_id
    INTO v_tenant
  FROM auth.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  SELECT t.type
    INTO v_tenant_type
  FROM auth.tenants t
  WHERE t.uid = v_tenant
  LIMIT 1;

  RETURN QUERY
  SELECT v_uid, v_tenant, v_tenant_type;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__login_verify(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_verify(text, text) TO anon, auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0111_rbac_admin_delegation.sql
-- ===============================================================================================

-- 0111_rbac_admin_delegation.sql
-- Delegated administration for the RBAC admin screens (RolesManager / UserAccessManager).
--
-- Adds the "you can only hand out what you hold" rule that 0101/0104 never enforced:
--   * a non-root caller may grant permission P (to a role or as a per-user `allow` override)
--     only if P is currently effective for that caller;
--   * a non-root caller may assign role R to a user only if every permission R confers is one
--     the caller could grant individually;
--   * `deny` overrides and role removals are never escalation, so they stay unrestricted (beyond
--     the existing tenant + `tenant_member.manage` gate).
-- Also lets `is_root` edit the global template roles' grants (ROOT/ADMIN/USER), which 0101
-- deliberately froze as seed-only.
--
-- Additive + idempotent. No new tables. `auth.roles.active` is added for logical deletion
-- (roles are never hard-deleted by the UI); permission grants themselves are plain config rows
-- and are toggled directly, not soft-deleted.

ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- auth.roles has RLS enabled since 0007 but never got a SELECT policy, so PostgREST reads of
-- /roles come back empty. The admin screens need the role list; role names are not sensitive.
GRANT SELECT ON TABLE auth.roles TO auth_user;
DROP POLICY IF EXISTS roles_select_policy ON auth.roles;
CREATE POLICY roles_select_policy ON auth.roles FOR SELECT TO auth_user
USING (tenant_id IS NULL OR tenant_id = auth.fun_auth_current_tenant_id());

-- Nav/gate permission for the "Acessos" admin screen. `tenant_member.manage` (0104) is the real
-- write gate; `.view` just decides whether the menu item / page is reachable. ADMIN gets both.
INSERT INTO auth.permissions (resource, action, name)
VALUES ('tenant_member', 'view', 'Ver membros e permissões do tenant')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.role_grants (role_id, permission_id)
SELECT 2, id FROM auth.permissions WHERE resource = 'tenant_member' AND action = 'view'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper: can the current caller grant this single permission?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth_can_grant(p_permission_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = auth, public
AS $$
  SELECT
    COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false)
    OR EXISTS (
      SELECT 1
      FROM auth.permissions p
      WHERE p.id = p_permission_id
        AND COALESCE(
              (current_setting('request.jwt.claims', true)::jsonb
                 -> 'perms' -> p.resource ->> p.action)::boolean,
              false
            )
    );
$$;

GRANT EXECUTE ON FUNCTION auth.fun_auth_can_grant(bigint) TO auth_user;

-- ---------------------------------------------------------------------------
-- Helper: can the current caller assign this whole role to a user?
-- True when root, or when the caller can grant every permission the role confers.
-- A role with zero grants (e.g. USER) is assignable by anyone with tenant_member.manage.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth_can_assign_role(p_role_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = auth, public
AS $$
  SELECT
    COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false)
    OR NOT EXISTS (
      SELECT 1
      FROM auth.role_grants rg
      WHERE rg.role_id = p_role_id
        AND NOT auth.fun_auth_can_grant(rg.permission_id)
    );
$$;

GRANT EXECUTE ON FUNCTION auth.fun_auth_can_assign_role(bigint) TO auth_user;

-- ---------------------------------------------------------------------------
-- role_grants: keep the tenant-custom-role + tenant_member.manage gate from 0104,
-- add an is_root branch for the global template roles, and require can_grant per row
-- for the non-root path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS role_grants_write_policy ON auth.role_grants;
CREATE POLICY role_grants_write_policy ON auth.role_grants FOR ALL TO auth_user
USING (
  COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false)
  OR (
    EXISTS (
      SELECT 1 FROM auth.roles r
      WHERE r.id = role_grants.role_id
        AND r.tenant_id IS NOT NULL
        AND r.tenant_id = auth.fun_auth_current_tenant_id()
    )
    AND auth.fun_auth_has_perm('tenant_member', 'manage')
  )
)
WITH CHECK (
  COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false)
  OR (
    EXISTS (
      SELECT 1 FROM auth.roles r
      WHERE r.id = role_grants.role_id
        AND r.tenant_id IS NOT NULL
        AND r.tenant_id = auth.fun_auth_current_tenant_id()
    )
    AND auth.fun_auth_has_perm('tenant_member', 'manage')
    AND auth.fun_auth_can_grant(permission_id)
  )
);

-- ---------------------------------------------------------------------------
-- user_tenant_permissions: keep tenant + tenant_member.manage gate from 0104,
-- add can_grant for `allow` rows only (`deny` is not escalation).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS utp_write_policy ON auth.user_tenant_permissions;
CREATE POLICY utp_write_policy ON auth.user_tenant_permissions FOR ALL TO auth_user
USING (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
)
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
  AND (effect = 'deny' OR auth.fun_auth_can_grant(permission_id))
);

-- ---------------------------------------------------------------------------
-- user_roles: replace the legacy jsonb `rbac.grant` check (0007) with the modern
-- tenant_member.manage gate + per-role delegation ceiling. INSERT adds an assignment,
-- DELETE removes one; removal only needs the manage gate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_roles_insert_policy ON auth.user_roles;
CREATE POLICY user_roles_insert_policy ON auth.user_roles FOR INSERT TO auth_user
WITH CHECK (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
  AND auth.fun_auth_can_assign_role(role_id)
);

DROP POLICY IF EXISTS user_roles_delete_policy ON auth.user_roles;
CREATE POLICY user_roles_delete_policy ON auth.user_roles FOR DELETE TO auth_user
USING (
  tenant_id = auth.fun_auth_current_tenant_id()
  AND auth.fun_auth_has_perm('tenant_member', 'manage')
);

-- ---------------------------------------------------------------------------
-- Mutation RPCs for the admin screens. All SECURITY INVOKER — the policies above
-- are the real boundary; these just wrap the insert/delete so the client sends one
-- intent ("grant this / revoke this") instead of juggling composite-key rows.
-- ---------------------------------------------------------------------------

-- Toggle one role -> permission grant.
CREATE OR REPLACE FUNCTION auth.fn_rbac__set_role_grant(
  p_role_id bigint,
  p_permission_id bigint,
  p_granted boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path = auth, public
AS $$
BEGIN
  IF p_granted THEN
    INSERT INTO auth.role_grants (role_id, permission_id)
    VALUES (p_role_id, p_permission_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  ELSE
    DELETE FROM auth.role_grants
    WHERE role_id = p_role_id AND permission_id = p_permission_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fn_rbac__set_role_grant(bigint, bigint, boolean) TO auth_user;

-- Set (or clear) a per-user allow/deny override. p_effect NULL removes the override.
CREATE OR REPLACE FUNCTION auth.fn_rbac__set_user_override(
  p_user_id uuid,
  p_permission_id bigint,
  p_effect text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = auth, public
AS $$
DECLARE
  v_tenant uuid := auth.fun_auth_current_tenant_id();
BEGIN
  IF p_effect IS NULL THEN
    DELETE FROM auth.user_tenant_permissions
    WHERE user_id = p_user_id AND tenant_id = v_tenant AND permission_id = p_permission_id;
  ELSIF p_effect IN ('allow', 'deny') THEN
    INSERT INTO auth.user_tenant_permissions (user_id, tenant_id, permission_id, effect)
    VALUES (p_user_id, v_tenant, p_permission_id, p_effect)
    ON CONFLICT (user_id, tenant_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect;
  ELSE
    RAISE EXCEPTION 'p_effect must be allow, deny or null';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fn_rbac__set_user_override(uuid, bigint, text) TO auth_user;

-- Replace a user's single base role in the current tenant.
CREATE OR REPLACE FUNCTION auth.fn_rbac__set_user_role(
  p_user_id uuid,
  p_role_id bigint
)
RETURNS void
LANGUAGE plpgsql
SET search_path = auth, public
AS $$
DECLARE
  v_tenant uuid := auth.fun_auth_current_tenant_id();
BEGIN
  DELETE FROM auth.user_roles
  WHERE user_id = p_user_id AND tenant_id = v_tenant AND role_id <> p_role_id;

  INSERT INTO auth.user_roles (user_id, tenant_id, role_id)
  VALUES (p_user_id, v_tenant, p_role_id)
  ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fn_rbac__set_user_role(uuid, bigint) TO auth_user;

-- Copy every `allow` override from one user to another in the current tenant,
-- skipping any permission the caller is not allowed to grant. Existing target
-- overrides are left as-is unless the source also has them.
CREATE OR REPLACE FUNCTION auth.fn_rbac__copy_user_access(
  p_source_user uuid,
  p_target_user uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = auth, public
AS $$
DECLARE
  v_tenant uuid := auth.fun_auth_current_tenant_id();
  v_count  integer := 0;
BEGIN
  WITH ins AS (
    INSERT INTO auth.user_tenant_permissions (user_id, tenant_id, permission_id, effect)
    SELECT p_target_user, v_tenant, utp.permission_id, utp.effect
    FROM auth.user_tenant_permissions utp
    WHERE utp.user_id = p_source_user
      AND utp.tenant_id = v_tenant
      AND (utp.effect = 'deny' OR auth.fun_auth_can_grant(utp.permission_id))
    ON CONFLICT (user_id, tenant_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fn_rbac__copy_user_access(uuid, uuid) TO auth_user;

-- Members of the caller's current tenant, for the UserAccessManager list. SECURITY DEFINER
-- (an admin has no blanket SELECT on other users' user_data) but hard-gated on tenant_member.manage.
CREATE OR REPLACE FUNCTION auth.fn_rbac__tenant_users()
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  full_name    text,
  email        text,
  role_id      bigint,
  is_root      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_tenant uuid := auth.fun_auth_current_tenant_id();
BEGIN
  IF NOT auth.fun_auth_has_perm('tenant_member', 'manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    ud.display_name::text,
    ud.full_name::text,
    ud.email::text,
    ur.role_id,
    COALESCE(u.is_root, false)
  FROM auth.user_roles ur
  JOIN auth.users u ON u.uid = ur.user_id
  LEFT JOIN public.user_data ud ON ud.user_id = ur.user_id AND ud.tenant_id = v_tenant
  WHERE ur.tenant_id = v_tenant
  ORDER BY COALESCE(ud.display_name, ud.full_name, ur.user_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION auth.fn_rbac__tenant_users() TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0112_password_reset.sql
-- ===============================================================================================

-- 0112_password_reset.sql
-- Recuperação de senha ("esqueci minha senha") por link enviado por e-mail.
--
-- Fluxo:
--   1. POST /api/auth/forgot-password → o servidor gera um token aleatório, grava só o SHA-256
--      dele via auth.fun_auth__password_reset_request e envia o token puro por e-mail.
--   2. POST /api/auth/reset-password  → o servidor calcula o SHA-256 do token recebido e chama
--      auth.fun_auth__password_reset_confirm, que troca a senha e queima o token.
--
-- Segurança:
--   * O banco guarda só o hash do token — vazar a tabela não permite resetar ninguém.
--   * As duas funções exigem o claim `purpose = "password_reset"` no JWT da requisição. Esse JWT é
--     assinado pelo servidor Next com PGRST_JWT_SECRET (só ele conhece o segredo), então um
--     cliente anônimo chamando o PostgREST direto não consegue criar token para a conta de outra
--     pessoa (o que permitiria sequestrar a conta escolhendo o próprio token).
--   * Token de uso único, com expiração; pedir um novo invalida os anteriores; trocar a senha
--     invalida todos os pendentes do usuário.
--   * Conta inativa (is_active = false) nunca recebe token.
--
-- Aditivo + idempotente.

CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
  id bigserial PRIMARY KEY,
  user_uid uuid NOT NULL REFERENCES auth.users(uid) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON auth.password_reset_tokens (user_uid);

-- Sem GRANT para anon/auth_user: a tabela só é acessada pelas funções SECURITY DEFINER abaixo.
ALTER TABLE auth.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_assert_purpose()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = auth, public
AS $$
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'password_reset' THEN
    RAISE EXCEPTION 'password_reset_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_assert_purpose() FROM PUBLIC;

/*
 * Registra um token de reset para o login informado.
 * Retorna true quando existe conta ativa com esse login (o servidor só envia e-mail nesse caso),
 * false caso contrário. O servidor responde a mesma mensagem nos dois casos (sem enumeração).
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__password_reset_request(
  p_login text,
  p_token_hash text,
  p_ttl_minutes integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM auth.fun_auth__password_reset_assert_purpose();

  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_token_hash' USING ERRCODE = '22023';
  END IF;

  SELECT u.uid
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.login) = lower(trim(p_login))
    AND COALESCE(u.is_active, false)
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Um pedido novo invalida os anteriores ainda pendentes.
  UPDATE auth.password_reset_tokens
     SET used_at = now()
   WHERE user_uid = v_uid
     AND used_at IS NULL;

  INSERT INTO auth.password_reset_tokens (user_uid, token_hash, expires_at)
  VALUES (
    v_uid,
    p_token_hash,
    now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_ttl_minutes, 60), 1440)))
  );

  RETURN true;
END;
$$;

/*
 * Troca a senha usando um token válido (não usado, não expirado, conta ativa).
 * Retorna true em caso de sucesso, false se o token for inválido/expirado.
 */
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
     SET password = auth.crypt(p_password, auth.gen_salt('bf', 10))
   WHERE uid = v_uid;

  -- Queima este token e qualquer outro pendente do mesmo usuário.
  UPDATE auth.password_reset_tokens
     SET used_at = now()
   WHERE user_uid = v_uid
     AND used_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_request(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.fun_auth__password_reset_confirm(text, text) FROM PUBLIC;
-- anon pode EXECUTAR, mas a função recusa sem o claim `purpose` (só o servidor assina esse JWT).
GRANT EXECUTE ON FUNCTION auth.fun_auth__password_reset_request(text, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION auth.fun_auth__password_reset_confirm(text, text) TO anon;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0113_external_identities.sql
-- ===============================================================================================

-- 0113_external_identities.sql
-- Login por provedor externo (Google agora; Apple/Facebook/etc. depois) sem senha.
--
-- Fluxo:
--   1. O servidor Next faz o OAuth (Authorization Code + PKCE) com o provedor e recebe as claims
--      do usuário direto do provedor (sub, email, email_verified, name).
--   2. Chama auth.fun_auth__external_login com um JWT curto assinado por ele mesmo com o claim
--      `purpose = "external_login"` — mesmo padrão do reset de senha (0112): anon pode EXECUTAR,
--      mas a função recusa sem o claim, e só o servidor conhece PGRST_JWT_SECRET. Sem isso um
--      cliente anônimo chamaria o PostgREST direto dizendo "sou o Google, email = da vítima".
--   3. A função acha a identidade (provider, subject); senão acha a conta pelo email verificado e
--      VINCULA (email é único); senão cria uma conta nova SEM senha.
--
-- Proteção contra pre-hijack ao vincular: se alguém cadastrou email+senha usando o email de outra
-- pessoa (sem nunca verificar), quando o dono real entra pelo Google a conta é dele — a senha
-- existente é ANULADA e sessions_revoked_at marcado. O dono legítimo que só esqueceu que tinha
-- senha usa "esqueci a senha" normalmente.
--
-- Também corrige uma falha latente de fun_auth__login_verify: com password NULL,
-- crypt(x, NULL) <> NULL dá NULL (não true) e o IF deixava passar — conta sem senha autenticaria
-- com QUALQUER senha. Agora hash nulo nunca autentica por senha.
--
-- Aditivo + idempotente.

-- ---------------------------------------------------------------------------------------------
-- users: senha opcional + verificação/revogação
-- ---------------------------------------------------------------------------------------------
ALTER TABLE auth.users ALTER COLUMN password DROP NOT NULL;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_verified_at   timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone               text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_verified_at   timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS sessions_revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
  ON auth.users (phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- user_identities: uma linha por (provedor, id do usuário no provedor)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.user_identities (
  id            bigserial PRIMARY KEY,
  user_uid      uuid NOT NULL REFERENCES auth.users(uid) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  subject       text NOT NULL,
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT user_identities_provider_subject_unique UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS user_identities_user_idx ON auth.user_identities (user_uid);

-- Leitura só das próprias identidades (tela "Métodos de acesso"); escrita só pelas funções
-- SECURITY DEFINER abaixo.
ALTER TABLE auth.user_identities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE auth.user_identities TO auth_user;

DROP POLICY IF EXISTS user_identities_select_own ON auth.user_identities;
CREATE POLICY user_identities_select_own ON auth.user_identities FOR SELECT TO auth_user
USING (user_uid = auth.fun_auth_user_id());

-- ---------------------------------------------------------------------------------------------
-- login_verify: hash nulo nunca autentica por senha
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth__login_verify(
  p_login text,
  p_password text
)
RETURNS TABLE (
  user_uid uuid,
  tenant_uid uuid,
  tenant_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid;
  v_hash text;
  v_is_active boolean;
  v_tenant uuid;
  v_tenant_type text;
BEGIN
  SELECT u.uid, u.password, u.is_active
    INTO v_uid, v_hash, v_is_active
  FROM auth.users u
  WHERE u.login = p_login;

  IF v_uid IS NULL OR v_hash IS NULL OR p_password IS NULL THEN
    RETURN;
  END IF;

  IF auth.crypt(p_password, v_hash) IS DISTINCT FROM v_hash THEN
    RETURN;
  END IF;

  IF NOT COALESCE(v_is_active, false) THEN
    RETURN;
  END IF;

  SELECT ur.tenant_id
    INTO v_tenant
  FROM auth.user_roles ur
  WHERE ur.user_id = v_uid
  LIMIT 1;

  SELECT t.type
    INTO v_tenant_type
  FROM auth.tenants t
  WHERE t.uid = v_tenant
  LIMIT 1;

  RETURN QUERY
  SELECT v_uid, v_tenant, v_tenant_type;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__login_verify(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fun_auth__login_verify(text, text) TO anon, auth_user;

-- ---------------------------------------------------------------------------------------------
-- build_login_result: monta o mesmo jsonb de fun_auth__login_with_perms para um usuário já
-- autenticado por outro meio (provedor externo, OTP). Interna — sem GRANT.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth__build_login_result(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_tenant uuid;
  v_tenant_type text;
  v_is_root boolean;
  v_login text;
  v_perms jsonb;
BEGIN
  SELECT u.is_root, u.login INTO v_is_root, v_login FROM auth.users u WHERE u.uid = p_user;

  SELECT ur.tenant_id INTO v_tenant
  FROM auth.user_roles ur
  WHERE ur.user_id = p_user
  LIMIT 1;

  SELECT t.type INTO v_tenant_type FROM auth.tenants t WHERE t.uid = v_tenant LIMIT 1;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'user_id', p_user::text,
      'tenant_id', v_tenant::text,
      'tenant_type', v_tenant_type,
      'is_root', COALESCE(v_is_root, false)
    )::text,
    true
  );

  SELECT auth.get_auth__effective_permissions() INTO v_perms;

  RETURN jsonb_build_object(
    'user_uid', p_user::text,
    'tenant_uid', v_tenant::text,
    'tenant_type', v_tenant_type,
    'is_root', COALESCE(v_is_root, false),
    'login', v_login,
    'perms', COALESCE(v_perms, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__build_login_result(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- create_passwordless_user: mesma bootstrap de fun_auth__signup_bootstrap (tenant USER + role 2,
-- primeiro usuário do banco vira root), mas sem senha. Interna — sem GRANT.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth__create_passwordless_user(
  p_login text,
  p_email_verified boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user_uid   uuid := gen_random_uuid();
  v_tenant_uid uuid := gen_random_uuid();
  v_is_first   boolean;
BEGIN
  v_is_first := NOT EXISTS (SELECT 1 FROM auth.users);

  INSERT INTO auth.users (uid, login, password, is_active, is_root, email_verified_at)
  VALUES (
    v_user_uid,
    p_login,
    NULL,
    true,
    v_is_first,
    CASE WHEN p_email_verified THEN now() END
  );

  INSERT INTO auth.tenants (uid, owner_uid, name, type)
  VALUES (v_tenant_uid, v_user_uid, p_login, 'USER');

  INSERT INTO auth.user_roles (user_id, tenant_id, role_id)
  VALUES (v_user_uid, v_tenant_uid, 2);

  RETURN v_user_uid;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__create_passwordless_user(text, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- external_login
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.fun_auth__external_login(
  p_provider text,
  p_subject text,
  p_email text,
  p_email_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_email text := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_verified boolean := COALESCE(p_email_verified, false) AND v_email IS NOT NULL;
  v_user uuid;
  v_active boolean;
  v_email_verified_at timestamptz;
  v_profile_verified boolean := false;
  v_created boolean := false;
  v_linked boolean := false;
  v_login text;
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'external_login' THEN
    RAISE EXCEPTION 'external_login_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR p_provider !~ '^[a-z][a-z0-9_]{1,31}$' THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR length(trim(p_subject)) = 0 THEN
    RAISE EXCEPTION 'invalid_subject' USING ERRCODE = '22023';
  END IF;

  -- 1) Identidade já conhecida.
  SELECT i.user_uid INTO v_user
  FROM auth.user_identities i
  WHERE i.provider = p_provider AND i.subject = p_subject;

  IF v_user IS NOT NULL THEN
    UPDATE auth.user_identities
       SET last_login_at = now(), email = COALESCE(v_email, email)
     WHERE provider = p_provider AND subject = p_subject;
  ELSE
    -- 2) Conta existente com o mesmo email → vincula (só com email verificado pelo provedor).
    IF v_email IS NOT NULL THEN
      SELECT u.uid, u.email_verified_at
        INTO v_user, v_email_verified_at
      FROM auth.users u
      WHERE lower(u.login) = v_email
        AND u.deleted_at IS NULL
      LIMIT 1;
    END IF;

    IF v_user IS NOT NULL THEN
      IF NOT v_verified THEN
        -- Provedor não garante o email: vincular entregaria a conta a quem não prova ser dono.
        RAISE EXCEPTION 'email_not_verified' USING ERRCODE = '42501';
      END IF;

      -- Verificação feita antes pelo fluxo de email do plugin user_data também conta.
      IF v_email_verified_at IS NULL AND to_regclass('public.user_data') IS NOT NULL THEN
        EXECUTE 'SELECT COALESCE(bool_or(email_verified), false) FROM public.user_data WHERE user_id = $1'
          INTO v_profile_verified
          USING v_user;
      END IF;

      IF v_email_verified_at IS NULL AND NOT v_profile_verified THEN
        -- Pre-hijack: quem cadastrou este email sem prová-lo perde a senha e as sessões.
        UPDATE auth.users
           SET password = NULL,
               sessions_revoked_at = now(),
               email_verified_at = now()
         WHERE uid = v_user;
      ELSIF v_email_verified_at IS NULL THEN
        UPDATE auth.users SET email_verified_at = now() WHERE uid = v_user;
      END IF;

      v_linked := true;
    ELSE
      -- 3) Conta nova sem senha. login = email quando há; senão um identificador do provedor.
      v_login := COALESCE(v_email, p_provider || ':' || p_subject);
      v_user := auth.fun_auth__create_passwordless_user(v_login, v_verified);
      v_created := true;
    END IF;

    INSERT INTO auth.user_identities (user_uid, provider, subject, email, last_login_at)
    VALUES (v_user, p_provider, p_subject, v_email, now());
  END IF;

  SELECT u.is_active INTO v_active FROM auth.users u WHERE u.uid = v_user AND u.deleted_at IS NULL;
  IF NOT COALESCE(v_active, false) THEN
    RETURN NULL;
  END IF;

  RETURN auth.fun_auth__build_login_result(v_user)
    || jsonb_build_object('created', v_created, 'linked', v_linked);
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__external_login(text, text, text, boolean) FROM PUBLIC;
-- anon pode EXECUTAR, mas a função recusa sem o claim `purpose` (só o servidor assina esse JWT).
GRANT EXECUTE ON FUNCTION auth.fun_auth__external_login(text, text, text, boolean) TO anon;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0114_phone_otp.sql
-- ===============================================================================================

-- 0114_phone_otp.sql
-- Login (e verificação) por telefone com código de uso único (OTP).
--
-- Fluxo:
--   1. POST /api/auth/otp/request → o servidor gera o código, grava só o HMAC dele via
--      auth.fun_auth__otp_create e entrega {telefone, código} à porta OtpProvider (o texto da
--      mensagem mora no gateway do provedor, não aqui).
--   2. POST /api/auth/otp/verify  → o servidor calcula o HMAC do código digitado e chama
--      auth.fun_auth__otp_verify, que queima o desafio e, para `login`, acha/cria a conta pelo
--      telefone; para `verify_phone`, vincula o telefone à conta logada.
--
-- Segurança (mesmo padrão de 0112/0113):
--   * Funções exigem o claim `purpose = "otp"` — só o servidor Next assina esse JWT.
--   * Banco guarda só HMAC(código) com segredo do servidor: vazar a tabela não revela códigos
--     (hash simples de 6 dígitos seria quebrado por força bruta em milissegundos).
--   * Uso único, expiração, no máx. 5 tentativas por desafio, cooldown de 60s e teto diário por
--     telefone. Pedir um novo invalida os anteriores.
--   * Telefone já usado por outra conta não é "roubado" no verify_phone (erro phone_in_use).
--
-- Tudo no schema auth. Aditivo + idempotente.

CREATE TABLE IF NOT EXISTS auth.otp_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN ('login', 'verify_phone')),
  user_uid    uuid REFERENCES auth.users(uid) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_challenges_phone_idx
  ON auth.otp_challenges (phone, purpose, created_at DESC);

-- Sem GRANT: só as funções SECURITY DEFINER abaixo tocam a tabela.
ALTER TABLE auth.otp_challenges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth.fun_auth__otp_assert_purpose()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = auth, public
AS $$
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'otp' THEN
    RAISE EXCEPTION 'otp_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__otp_assert_purpose() FROM PUBLIC;

/*
 * Registra um desafio. p_user_uid só em `verify_phone` (conta logada adicionando telefone).
 * Erros: otp_cooldown (pediu há < p_cooldown_sec), otp_daily_limit.
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__otp_create(
  p_phone text,
  p_purpose text,
  p_code_hash text,
  p_ttl_sec integer DEFAULT 300,
  p_ip text DEFAULT NULL,
  p_user_uid uuid DEFAULT NULL,
  p_cooldown_sec integer DEFAULT 60,
  p_daily_limit integer DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_last timestamptz;
  v_today integer;
  v_id uuid;
BEGIN
  PERFORM auth.fun_auth__otp_assert_purpose();

  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF p_code_hash IS NULL OR length(p_code_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_code_hash' USING ERRCODE = '22023';
  END IF;
  IF p_purpose = 'verify_phone' AND p_user_uid IS NULL THEN
    RAISE EXCEPTION 'user_required' USING ERRCODE = '22023';
  END IF;

  SELECT max(created_at), count(*) FILTER (WHERE created_at > now() - interval '24 hours')
    INTO v_last, v_today
  FROM auth.otp_challenges
  WHERE phone = p_phone;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => GREATEST(0, p_cooldown_sec)) THEN
    RAISE EXCEPTION 'otp_cooldown' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_today, 0) >= GREATEST(1, p_daily_limit) THEN
    RAISE EXCEPTION 'otp_daily_limit' USING ERRCODE = 'P0001';
  END IF;

  UPDATE auth.otp_challenges
     SET consumed_at = now()
   WHERE phone = p_phone AND purpose = p_purpose AND consumed_at IS NULL;

  INSERT INTO auth.otp_challenges (phone, purpose, user_uid, code_hash, expires_at, ip)
  VALUES (
    p_phone,
    p_purpose,
    p_user_uid,
    p_code_hash,
    now() + make_interval(secs => GREATEST(60, LEAST(COALESCE(p_ttl_sec, 300), 1800))),
    p_ip
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

/*
 * Confere o código do desafio pendente mais recente.
 * Retorno:
 *   { ok: false, reason: 'invalid' | 'expired' | 'too_many_attempts' | 'phone_in_use' | 'blocked' }
 *   login        → { ok: true, ...fun_auth__build_login_result, created }
 *   verify_phone → { ok: true, user_uid }
 * Nunca lança por código errado: o incremento de tentativas precisa ser gravado.
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__otp_verify(
  p_phone text,
  p_purpose text,
  p_code_hash text,
  p_user_uid uuid DEFAULT NULL,
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  c auth.otp_challenges%ROWTYPE;
  v_user uuid;
  v_active boolean;
  v_created boolean := false;
BEGIN
  PERFORM auth.fun_auth__otp_assert_purpose();

  SELECT * INTO c
  FROM auth.otp_challenges
  WHERE phone = p_phone
    AND purpose = p_purpose
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF c.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF c.expires_at <= now() THEN
    UPDATE auth.otp_challenges SET consumed_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF p_purpose = 'verify_phone' AND c.user_uid IS DISTINCT FROM p_user_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF c.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE auth.otp_challenges
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= GREATEST(1, p_max_attempts) THEN now() END
     WHERE id = c.id;
    IF c.attempts + 1 >= GREATEST(1, p_max_attempts) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE auth.otp_challenges SET consumed_at = now() WHERE id = c.id;

  IF p_purpose = 'verify_phone' THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE phone = p_phone AND uid <> c.user_uid) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'phone_in_use');
    END IF;
    UPDATE auth.users
       SET phone = p_phone, phone_verified_at = now()
     WHERE uid = c.user_uid;
    RETURN jsonb_build_object('ok', true, 'user_uid', c.user_uid::text);
  END IF;

  -- login: conta pelo telefone; senão conta nova sem email/senha (login = telefone).
  SELECT u.uid INTO v_user
  FROM auth.users u
  WHERE u.phone = p_phone AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_user IS NULL THEN
    v_user := auth.fun_auth__create_passwordless_user(p_phone, false);
    v_created := true;
  END IF;

  UPDATE auth.users
     SET phone = p_phone, phone_verified_at = COALESCE(phone_verified_at, now())
   WHERE uid = v_user;

  SELECT u.is_active INTO v_active FROM auth.users u WHERE u.uid = v_user;
  IF NOT COALESCE(v_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
  END IF;

  RETURN jsonb_build_object('ok', true, 'created', v_created)
    || auth.fun_auth__build_login_result(v_user);
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__otp_create(text, text, text, integer, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.fun_auth__otp_verify(text, text, text, uuid, integer) FROM PUBLIC;
-- anon pode EXECUTAR, mas as funções recusam sem o claim `purpose` (só o servidor assina esse JWT).
GRANT EXECUTE ON FUNCTION auth.fun_auth__otp_create(text, text, text, integer, text, uuid, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION auth.fun_auth__otp_verify(text, text, text, uuid, integer) TO anon;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0115_account_facts.sql
-- ===============================================================================================

-- 0115_account_facts.sql
-- Fatos sobre a conta do usuário logado, para os níveis de conta progressivos
-- (src/shared/account-levels). A REGRA de cada nível mora em código; aqui só se lê o estado:
-- verificações (auth.users) + campos do perfil (public.user_data, se o plugin estiver instalado).
--
-- Email verificado conta por qualquer um dos caminhos: auth.users.email_verified_at (login social,
-- 0113) ou public.user_data.email_verified (fluxo de código por email do plugin user_data).
-- Telefone só conta por auth.users.phone_verified_at (OTP, 0114) — user_data.phone_verified é um
-- campo que nenhum fluxo verificado preenche.
--
-- Sem sessão (fun_auth_user_id() nulo) → {authenticated: false}. Tudo no schema auth.
-- Aditivo + idempotente.

CREATE OR REPLACE FUNCTION auth.fun_auth__account_facts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_uid uuid := auth.fun_auth_user_id();
  v_email_verified boolean := false;
  v_phone_verified boolean := false;
  v_profile jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT u.email_verified_at IS NOT NULL, u.phone_verified_at IS NOT NULL
    INTO v_email_verified, v_phone_verified
  FROM auth.users u
  WHERE u.uid = v_uid AND u.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  IF to_regclass('public.user_data') IS NOT NULL THEN
    EXECUTE $q$
      SELECT jsonb_build_object(
               'full_name', d.full_name,
               'avatar_url', d.avatar_url,
               'document_type', d.document_type,
               'document_number', d.document_number,
               'state', d.state,
               'city', d.city,
               'zip_code', d.zip_code,
               'email_verified', d.email_verified
             )
      FROM public.user_data d
      WHERE d.user_id = $1
      LIMIT 1
    $q$
    INTO v_profile
    USING v_uid;
  END IF;

  v_profile := COALESCE(v_profile, '{}'::jsonb);

  RETURN jsonb_build_object(
    'authenticated', true,
    'email_verified', v_email_verified OR COALESCE((v_profile ->> 'email_verified')::boolean, false),
    'phone_verified', v_phone_verified,
    -- Porta para a verificação de identidade (documento + selfie com IA). Sem fonte na v1.
    'identity_verified', false,
    'profile', v_profile - 'email_verified'
  );
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__account_facts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fun_auth__account_facts() TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0116_default_panel_permission.sql
-- ===============================================================================================

-- 0116_default_panel_permission.sql
-- `default/view` é a permissão de entrada do painel: os itens base do menu (Painel, Minha conta,
-- Meu conteúdo) exigem `permResource: 'default'`, e o PanelShell manda pra notFound() quando a rota
-- não bate com nenhum item acessível. Até aqui ela só existia se o banco trouxesse dados legados em
-- auth.role_permissions (backfill do 0103) — num banco novo ninguém além do root entrava no /painel.

INSERT INTO auth.permissions (resource, action, name)
VALUES ('default', 'view', 'Acessar o painel')
ON CONFLICT (resource, action) DO NOTHING;

-- ADMIN (role_id=2): papel com que todo usuário nasce (fun_auth__signup_bootstrap). USER (3)
-- continua sem role_grants por desenho (0103).
INSERT INTO auth.role_grants (role_id, permission_id)
SELECT 2, id FROM auth.permissions WHERE resource = 'default' AND action = 'view'
ON CONFLICT DO NOTHING;


-- ===============================================================================================
-- kizuna-core/sql/0117_service_role_and_account_deletion.sql
-- ===============================================================================================

-- 0117_service_role_and_account_deletion.sql
-- 1) `service_role`: papel do servidor para operações privilegiadas feitas em TypeScript (excluir
--    conta, abrir ticket do sistema, checar revogação de sessão). BYPASSRLS + GRANTs mínimos —
--    nenhuma função nova. O JWT `{ "role": "service_role" }` (`kizuna token service`) fica só no
--    servidor, em POSTGREST_SERVICE_TOKEN. GRANTs em tabelas de plugins ficam nos próprios
--    plugins (o core não assume que eles existem).
-- 2) `auth.users.deleted_login`: e-mail original de uma conta excluída. O `login` vira
--    `deleted:<uid>:<email>` (libera o UNIQUE para recriar a conta); o cadastro acha a conta
--    antiga por igualdade exata neste campo.
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT service_role TO authenticator;
GRANT USAGE ON SCHEMA auth, public TO service_role;

GRANT SELECT, UPDATE ON TABLE auth.users TO service_role;
GRANT SELECT, DELETE ON TABLE auth.user_identities TO service_role;
GRANT SELECT ON TABLE auth.tenants TO service_role;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_login text;

CREATE INDEX IF NOT EXISTS users_deleted_login_idx
  ON auth.users (deleted_login)
  WHERE deleted_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0118_consolidate_role_permissions.sql
-- ===============================================================================================

-- 0118_consolidate_role_permissions.sql
-- Tela "Papéis e permissões" (/painel/root/papeis) como fonte única da verdade por perfil.
--
-- 1) Consolida auth.role_permissions (formato legado, jsonb por papel) em auth.role_grants. As duas
--    eram lidas pelo login (get_auth__effective_permissions) e somadas, mas a tela só mostra/edita
--    role_grants: o que vinha do legado aparecia desmarcado e não dava para tirar. Copia todo
--    `true` para role_grants e esvazia role_permissions — o acesso efetivo de ninguém muda
--    (um `false` legado só "negava" o que nenhuma outra fonte concedia; ausente dá o mesmo resultado).
--    Fica de fora, de propósito, o que não é "por perfil": tenant_role_permissions (por tenant),
--    group_permissions (por grupo) e user_tenant_permissions (por usuário).
--
-- 2) auth.fn_rbac__role_overview(): quantos usuários cada papel tem, por tipo de tenant, e quantos
--    são root — para a tela mostrar a quem cada coluna se aplica de verdade. Só root.

INSERT INTO auth.permissions (resource, action, name)
SELECT DISTINCT rp.resource, kv.key, rp.resource || ' - ' || kv.key
FROM auth.role_permissions rp
CROSS JOIN LATERAL jsonb_each(rp.permissions) AS kv(key, value)
WHERE kv.value IN ('true'::jsonb, '"true"'::jsonb)
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.role_grants (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM auth.role_permissions rp
CROSS JOIN LATERAL jsonb_each(rp.permissions) AS kv(key, value)
JOIN auth.permissions p ON p.resource = rp.resource AND p.action = kv.key
WHERE kv.value IN ('true'::jsonb, '"true"'::jsonb)
ON CONFLICT DO NOTHING;

DELETE FROM auth.role_permissions;

CREATE OR REPLACE FUNCTION auth.fn_rbac__role_overview()
RETURNS TABLE (
  role_id     bigint,
  tenant_type text,
  users       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_root')::boolean, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT ur.role_id::bigint, COALESCE(t.type, '?')::text, count(DISTINCT ur.user_id)::bigint
  FROM auth.user_roles ur
  LEFT JOIN auth.tenants t ON t.uid = ur.tenant_id
  GROUP BY ur.role_id, t.type

  UNION ALL

  -- role_id NULL = linha dos root (is_root ignora papéis: tem acesso total).
  SELECT NULL::bigint, 'ROOT'::text, count(*)::bigint
  FROM auth.users u
  WHERE u.is_root = true;
END;
$$;

REVOKE ALL ON FUNCTION auth.fn_rbac__role_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.fn_rbac__role_overview() TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/sql/0119_email_verification.sql
-- ===============================================================================================

-- 0119_email_verification.sql
-- Verificação do e-mail da conta por código (6 dígitos enviados por e-mail), no mesmo molde do
-- código por SMS (0114_phone_otp.sql). Marca auth.users.email_verified_at — o campo que o nível de
-- conta "contato verificado" lê (0115_account_facts.sql). Mantém public.user_data.email_verified em
-- sincronia quando a coluna existe (fluxo antigo de onboarding).
--
--   * O código nunca chega ao banco: o servidor guarda só um HMAC (segredo do JWT).
--   * As funções exigem o claim `purpose = "email_verify"` — só o servidor Next assina esse JWT.
--   * O e-mail de destino é o login da conta (auth.users.login), nunca um valor vindo do cliente.

CREATE TABLE IF NOT EXISTS auth.email_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid    uuid NOT NULL REFERENCES auth.users (uid) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_challenges_user_idx
  ON auth.email_challenges (user_uid, created_at DESC);

ALTER TABLE auth.email_challenges ENABLE ROW LEVEL SECURITY;
-- Sem policies: só as funções SECURITY DEFINER abaixo leem/escrevem.

CREATE OR REPLACE FUNCTION auth.fun_auth__email_verify_assert_purpose()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = auth, public
AS $$
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'purpose',
       ''
     ) <> 'email_verify' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__email_verify_assert_purpose() FROM PUBLIC;

/**
 * Registra um código para o e-mail da conta. Devolve { email, already_verified }.
 * Erros: user_not_found, email_cooldown (pediu há < p_cooldown_sec), email_daily_limit.
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__email_code_create(
  p_user_uid uuid,
  p_code_hash text,
  p_ttl_sec integer DEFAULT 900,
  p_cooldown_sec integer DEFAULT 60,
  p_daily_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_email text;
  v_verified timestamptz;
  v_last timestamptz;
  v_today integer;
BEGIN
  PERFORM auth.fun_auth__email_verify_assert_purpose();

  IF p_code_hash IS NULL OR length(p_code_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_code_hash' USING ERRCODE = '22023';
  END IF;

  SELECT u.login, u.email_verified_at INTO v_email, v_verified
  FROM auth.users u
  WHERE u.uid = p_user_uid AND u.deleted_at IS NULL;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_verified IS NOT NULL THEN
    RETURN jsonb_build_object('email', v_email, 'already_verified', true);
  END IF;

  SELECT max(created_at), count(*) FILTER (WHERE created_at > now() - interval '24 hours')
    INTO v_last, v_today
  FROM auth.email_challenges
  WHERE user_uid = p_user_uid;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => GREATEST(0, p_cooldown_sec)) THEN
    RAISE EXCEPTION 'email_cooldown' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_today, 0) >= GREATEST(1, p_daily_limit) THEN
    RAISE EXCEPTION 'email_daily_limit' USING ERRCODE = 'P0001';
  END IF;

  UPDATE auth.email_challenges
     SET consumed_at = now()
   WHERE user_uid = p_user_uid AND consumed_at IS NULL;

  INSERT INTO auth.email_challenges (user_uid, email, code_hash, expires_at)
  VALUES (
    p_user_uid,
    v_email,
    p_code_hash,
    now() + make_interval(secs => GREATEST(60, LEAST(COALESCE(p_ttl_sec, 900), 3600)))
  );

  RETURN jsonb_build_object('email', v_email, 'already_verified', false);
END;
$$;

/**
 * Confere o código. { ok: true } marca email_verified_at; senão
 * { ok: false, reason: 'invalid' | 'expired' | 'too_many_attempts' | 'no_challenge' }.
 */
CREATE OR REPLACE FUNCTION auth.fun_auth__email_code_verify(
  p_user_uid uuid,
  p_code_hash text,
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  c auth.email_challenges%ROWTYPE;
BEGIN
  PERFORM auth.fun_auth__email_verify_assert_purpose();

  SELECT * INTO c
  FROM auth.email_challenges
  WHERE user_uid = p_user_uid AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_challenge');
  END IF;

  IF c.expires_at <= now() THEN
    UPDATE auth.email_challenges SET consumed_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF c.code_hash <> p_code_hash THEN
    UPDATE auth.email_challenges
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= GREATEST(1, p_max_attempts) THEN now() END
     WHERE id = c.id;
    IF c.attempts + 1 >= GREATEST(1, p_max_attempts) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE auth.email_challenges SET consumed_at = now() WHERE id = c.id;
  UPDATE auth.users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE uid = p_user_uid;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_data' AND column_name = 'email_verified'
  ) THEN
    EXECUTE 'UPDATE public.user_data SET email_verified = true WHERE user_id = $1' USING p_user_uid;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION auth.fun_auth__email_code_create(uuid, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.fun_auth__email_code_verify(uuid, text, integer) FROM PUBLIC;
-- anon pode EXECUTAR, mas as funções recusam sem o claim `purpose` (só o servidor assina esse JWT).
GRANT EXECUTE ON FUNCTION auth.fun_auth__email_code_create(uuid, text, integer, integer, integer) TO anon, auth_user;
GRANT EXECUTE ON FUNCTION auth.fun_auth__email_code_verify(uuid, text, integer) TO anon, auth_user;

NOTIFY pgrst, 'reload schema';
