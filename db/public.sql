-- Bora Cuiabá — migrations + seeds de TODOS os plugins
-- GERADO por db/build.mjs — NÃO edite à mão. Regenere: node db/build.mjs
-- Aplicar DEPOIS do db/auth.sql, em base limpa:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/public.sql
-- Ordem = kizuna.plugins.json (ordem de dependência).
-- Plugins: user_data (2), system_config (1), account_preferences (1), notifications (2), onboarding (1), storage (3), location (1), pages (2), holidays (1), agenda (4), weather (1), forms (1), taxonomy (3), services (2), reviews (1), messaging (1), ai_assistant (1), demandas (4), pedidos (4)


-- ===============================================================================================
-- PLUGIN: user_data  (2 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/user_data/0001_user_data.sql
-- ===============================================================================================

-- plugins/user_data/0001_user_data.sql
-- Optional. Depends only on core (auth.users, auth.tenants, auth.fun_auth_user_id(),
-- auth.fun_auth_current_tenant_id()). Skip entirely if a project doesn't need a profile table.
-- Trimmed from foco-total's live version: dropped the dead bytea `avatar` column (superseded by
-- avatar_url), dropped onboarding_done/status (foco-total business meaning, not generic), and
-- made document_type/document_number nullable (KYC is a vertical-specific requirement, not core —
-- a project needing it enforces NOT NULL itself, e.g. via a resource config's requiredFields).
-- email_verification_code ships here too (not trimmed): the column always exists — whether a
-- project actually uses it (requires an email-verification step or not) is an application-level
-- decision, not a schema one. Same principle as document_type/birth_date being nullable: the core
-- table doesn't decide what's required or visible, `system_config` (or a project's own logic)
-- does.
--
-- `avatar_url` is just a URL string — no FK to any file-storage table, so nothing here forces
-- installing the `storage` plugin. But it's a soft, functional dependency: a project that lets
-- users upload an avatar (as foco-total's user-data form does, via `/api/storage/files`) needs
-- `storage` installed too, or every upload fails with "permission denied for table files" (no
-- plugin ever GRANTed `auth_user` access to it). See `plugins/storage/0001_storage.sql`.

CREATE TABLE IF NOT EXISTS public.user_data (
    id               bigserial PRIMARY KEY,
    uid              uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
    user_id          uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id        uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    full_name        character varying(255),
    display_name     character varying(100),
    avatar_url       character varying(500),
    bio              text,
    phone            character varying(30),
    phone_verified   boolean NOT NULL DEFAULT false,
    email            character varying(150),
    email_verified   boolean NOT NULL DEFAULT false,
    country          character varying(2) DEFAULT 'BR',
    state            character varying(2),
    city             character varying(100),
    zip_code         character varying(10),
    latitude         character varying,
    longitude        character varying,
    language         character varying(10) DEFAULT 'pt-BR',
    timezone         character varying(50) DEFAULT 'America/Sao_Paulo',
    document_type    character varying(10),
    document_number  character varying(20),
    birth_date       date,
    email_verification_code character varying(10),
    active           boolean NOT NULL DEFAULT true,
    created_by       uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_data_uid_unique UNIQUE (uid),
    CONSTRAINT user_data_user_id_unique UNIQUE (user_id)
);

-- `display_name` doubles as the public profile slug (/prestador/<display_name>), so it must be
-- unique — case-insensitively, so "Joao" and "joao" can't collide as two different URLs. Partial
-- (WHERE display_name IS NOT NULL) since the column itself stays optional at the schema level; a
-- consuming app that requires it (as foco-total's form does) enforces that in its own validation.
CREATE UNIQUE INDEX IF NOT EXISTS user_data_display_name_unique_idx
  ON public.user_data (lower(display_name))
  WHERE display_name IS NOT NULL;

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_data TO auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.user_data_id_seq TO auth_user;

DROP POLICY IF EXISTS user_data_select_policy ON public.user_data;
CREATE POLICY user_data_select_policy ON public.user_data FOR SELECT TO auth_user
USING (uid = auth.fun_auth_user_id());

DROP POLICY IF EXISTS user_data_insert_policy ON public.user_data;
CREATE POLICY user_data_insert_policy ON public.user_data FOR INSERT TO auth_user
WITH CHECK (uid = auth.fun_auth_user_id());

DROP POLICY IF EXISTS user_data_update_policy ON public.user_data;
CREATE POLICY user_data_update_policy ON public.user_data FOR UPDATE TO auth_user
USING (uid = auth.fun_auth_user_id())
WITH CHECK (uid = auth.fun_auth_user_id());

-- Plugin registration (see plugins/README.md convention). No permissions registered: as trimmed
-- for kizuna-core (see header note above), this plugin ships strictly self-service RLS — no admin
-- override to view/edit another user's profile exists here. A project wanting an admin-facing
-- "manage any member's profile" capability should add a `user_data.manage` permission plus a
-- SELECT/UPDATE policy branch gated on auth.fun_auth_has_perm('user_data','manage') itself; that is
-- a product decision (how much of a member's profile an admin should see/edit), not implied by the
-- generic core table.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('user_data', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

-- fn_get_provider_profile — public-safe subset of user_data for a public profile page. RLS above
-- only lets a user read their own row (`uid = auth.fun_auth_user_id()`), so anon has no way to
-- read anyone else's profile directly — a project showing a public profile page needs a
-- SECURITY DEFINER function with an explicit whitelisted column list (never `SELECT *`) so an
-- anonymous visitor reads exactly these fields and nothing else (no document number, phone,
-- email, or any other private column). Bundled in this plugin (not left to each consuming project
-- to reinvent) because it's a direct, generic consequence of the RLS policy this same file sets.
DROP FUNCTION IF EXISTS public.fn_get_provider_profile(uuid);

CREATE OR REPLACE FUNCTION public.fn_get_provider_profile(p_user_id uuid)
 RETURNS TABLE(
   user_id uuid,
   full_name character varying,
   display_name character varying,
   avatar_url character varying,
   bio text,
   city character varying,
   state character varying
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT ud.user_id, ud.full_name, ud.display_name, ud.avatar_url, ud.bio, ud.city, ud.state
  FROM public.user_data ud
  WHERE ud.user_id = p_user_id
    AND ud.active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_get_provider_profile(uuid) TO anon, auth_user;

-- Same lookup, keyed by the public slug (`display_name`) instead of the internal `user_id` — what
-- `/prestador/<slug>` actually has in the URL. Overloaded under the same name (Postgres dispatches
-- by argument type), so callers pick whichever identifier they have on hand.
DROP FUNCTION IF EXISTS public.fn_get_provider_profile(text);

CREATE OR REPLACE FUNCTION public.fn_get_provider_profile(p_display_name text)
 RETURNS TABLE(
   user_id uuid,
   full_name character varying,
   display_name character varying,
   avatar_url character varying,
   bio text,
   city character varying,
   state character varying
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT ud.user_id, ud.full_name, ud.display_name, ud.avatar_url, ud.bio, ud.city, ud.state
  FROM public.user_data ud
  WHERE lower(ud.display_name) = lower(p_display_name)
    AND ud.active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_get_provider_profile(text) TO anon, auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/user_data/0002_user_data_city_ibge.sql
-- ===============================================================================================

-- plugins/user_data/0002_user_data_city_ibge.sql
-- Follow-up migration for the `user_data` plugin (0001 created the profile table with plain-text
-- `state` / `city`). Adds `city_ibge` — the IBGE municipality code (7 digits, e.g. '3550308' for
-- São Paulo) alongside the free-text `city` name.
--
-- Why a separate code column instead of matching on the name: `city` is a display string filled
-- from an IBGE-backed picker that historically discarded the id. Consumers that need an EXACT
-- city match (e.g. foco-total's marketplace search filtering providers by city) can't safely
-- join a name string — accents, casing and duplicate names across states make it unreliable.
-- The code is stable and unambiguous. `city` stays as-is for display and existing consumers.
--
-- `text`, nullable, no FK: same convention as `holidays.city_ibge` — the core table doesn't force
-- installing the `location` plugin (which owns `location_city`). A project that wants referential
-- integrity or a backfill from existing names does it in its own migrations / extras.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS city_ibge text;

-- Filtering providers by city means WHERE city_ibge = $1 — index it. Partial (skip the NULLs,
-- which are the majority until rows are re-saved / backfilled).
CREATE INDEX IF NOT EXISTS user_data_city_ibge_idx
  ON public.user_data (city_ibge)
  WHERE city_ibge IS NOT NULL;


-- ===============================================================================================
-- PLUGIN: system_config  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/system_config/0001_system_config.sql
-- ===============================================================================================

-- plugins/system_config/0001_system_config.sql
-- Optional. Depends only on core (auth.users, auth.fun_auth_has_perm()). Generic key/value
-- config bag any plugin, or a consuming project's own feature, can read/write against — the
-- mechanism (one jsonb value per text key) is generic; the actual keys that exist and the shape
-- of their jsonb value are a project's own business decision, not this table's concern (e.g.
-- foco-total's db/extras/system_config_seed.sql seeds `user_data.document_field`/
-- `user_data.birth_date_field` for the user_data plugin's onboarding form — nothing about those
-- key names or shapes lives here).
--
-- Read-open to any session (auth_user, anon) — the app needs to read it to render a form
-- correctly (e.g. whether a field is required before the user even logs in to an onboarding
-- flow), and a config flag/text isn't sensitive data. Writes gated by system_config.manage —
-- nobody granted it by default, root already passes via the auth.fun_auth_has_perm is_root
-- bypass (see plugins/README.md convention).

CREATE TABLE IF NOT EXISTS auth.system_config (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_by  uuid REFERENCES auth.users(uid),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth.system_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE auth.system_config TO auth_user, anon;
-- No DELETE — no plugin does physical delete (see plugins/README.md). A key/value bag like this
-- has no natural soft-delete flag either (its PK *is* the key), so removing a key just isn't a
-- supported operation here: a project that stops using a key simply stops reading it.
GRANT INSERT, UPDATE ON TABLE auth.system_config TO auth_user;
REVOKE DELETE ON TABLE auth.system_config FROM auth_user;

DROP POLICY IF EXISTS system_config_select_policy ON auth.system_config;
CREATE POLICY system_config_select_policy ON auth.system_config FOR SELECT TO auth_user, anon
USING (true);

-- Writes gated by the system_config.manage permission (registered below). Nobody is granted it
-- by default — see plugins/README.md convention; root already passes this check via
-- auth.fun_auth_has_perm's is_root bypass, no role_grants row needed.
DROP POLICY IF EXISTS system_config_insert_policy ON auth.system_config;
CREATE POLICY system_config_insert_policy ON auth.system_config FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('system_config', 'manage'));

DROP POLICY IF EXISTS system_config_update_policy ON auth.system_config;
CREATE POLICY system_config_update_policy ON auth.system_config FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('system_config', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('system_config', 'manage'));

-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS system_config_delete_policy ON auth.system_config;

-- Plugin registration + RBAC wiring (see plugins/README.md convention). system_config.manage is
-- registered in the catalog only — no role gets it automatically. Root already passes
-- auth.fun_auth_has_perm for it via the is_root bypass; granting it to a tenant role (or any
-- other role) is left to whoever installs/administers the consuming project.
INSERT INTO auth.permissions (resource, action, name)
VALUES ('system_config', 'manage', 'Gerenciar configurações do sistema')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('system_config', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: account_preferences  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/account_preferences/0001_account_preferences.sql
-- ===============================================================================================

-- plugins/account_preferences/0001_account_preferences.sql
-- Optional. One flexible jsonb bag of per-user, per-tenant app settings (theme, locale,
-- notification opt-ins, whatever a project needs) instead of a rigid column per setting.

CREATE TABLE IF NOT EXISTS public.account_preferences (
    user_id      uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_preferences_pkey PRIMARY KEY (user_id, tenant_id)
);

ALTER TABLE public.account_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.account_preferences TO auth_user;
DROP POLICY IF EXISTS account_preferences_policy ON public.account_preferences;
CREATE POLICY account_preferences_policy ON public.account_preferences FOR ALL TO auth_user
USING (user_id = auth.fun_auth_user_id())
WITH CHECK (user_id = auth.fun_auth_user_id());

-- Plugin registration (see plugins/README.md convention). No permissions registered: this plugin
-- is strictly self-service (a user manages only their own preferences, no admin-facing action
-- exists over other users' rows), so there is nothing meaningful to gate behind RBAC.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('account_preferences', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: notifications  (2 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/notifications/0001_notifications.sql
-- ===============================================================================================

-- plugins/notifications/0001_notifications.sql
-- Optional. Generic in-app notification feed ("bell icon" list). INSERT is deliberately NOT
-- granted to auth_user — notifications are pushed by trusted backend code (service role or a
-- SECURITY DEFINER function), never self-inserted by the recipient.

CREATE TABLE IF NOT EXISTS public.notifications (
    id           bigserial PRIMARY KEY,
    uid          uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    type         text NOT NULL,
    title        text NOT NULL,
    body         text,
    read_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_uid_unique UNIQUE (uid)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON TABLE public.notifications TO auth_user;
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
CREATE POLICY notifications_select_policy ON public.notifications FOR SELECT TO auth_user
USING (user_id = auth.fun_auth_user_id());
DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
CREATE POLICY notifications_update_policy ON public.notifications FOR UPDATE TO auth_user
USING (user_id = auth.fun_auth_user_id())
WITH CHECK (user_id = auth.fun_auth_user_id());

-- Plugin registration (see plugins/README.md convention). No permissions registered: rows are
-- pushed by trusted backend code only (never inserted by auth_user, see header note above), so
-- there is no admin-manageable action here to gate behind RBAC.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('notifications', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/notifications/0002_notifications_context.sql
-- ===============================================================================================

-- plugins/notifications/0002_notifications_context.sql
-- Follow-up to 0001_notifications.sql. Adds context columns (link a notification back to the
-- entity it's about) + two helper functions: auth.fun_notify (push a notification as the
-- recipient's own tenant, callable from any other plugin's SECURITY DEFINER RPC) and
-- fn_notifications_mark_all_read (bulk mark-as-read for the bell icon). `notifications` also
-- moves from optional to a required dependency of the project going forward — see
-- kizuna.plugins.json (Task 5).

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS context_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS context_id text;

-- Pushes a notification to p_user_id, resolving THEIR tenant (not the caller's) — a caller acting
-- on behalf of another user (e.g. the other participant of a pedido) must never notify itself
-- into the recipient's tenant_id column by accident.
CREATE OR REPLACE FUNCTION auth.fun_notify(
  p_user_id      uuid,
  p_type         text,
  p_title        text,
  p_body         text DEFAULT NULL,
  p_context_type text DEFAULT NULL,
  p_context_id   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT uid INTO v_tenant_id FROM auth.tenants WHERE owner_uid = p_user_id LIMIT 1;

  INSERT INTO public.notifications (user_id, tenant_id, type, title, body, context_type, context_id)
  VALUES (p_user_id, v_tenant_id, p_type, p_title, p_body, p_context_type, p_context_id);
END;
$function$;

-- SECURITY INVOKER is enough — the existing UPDATE policy already restricts to the caller's own
-- rows (user_id = auth.fun_auth_user_id()).
CREATE OR REPLACE FUNCTION public.fn_notifications_mark_all_read()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $function$
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.fun_auth_user_id()
     AND read_at IS NULL;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_notifications_mark_all_read() TO auth_user;
-- auth.fun_notify is called ONLY from other SECURITY DEFINER functions (never directly by
-- auth_user) — no EXECUTE grant to auth_user, same reasoning as auth.fun_msg_is_participant.

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: onboarding  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/onboarding/0001_onboarding.sql
-- ===============================================================================================

-- plugins/onboarding/0001_onboarding.sql
-- Optional. Mechanism only — no steps are seeded here, each project inserts its own
-- onboarding_steps rows (per role, if roles matter to it). Depends only on core.

CREATE TABLE IF NOT EXISTS public.onboarding_steps (
    id           bigserial PRIMARY KEY,
    uid          uuid NOT NULL DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    slug         text NOT NULL,
    description  text,
    role         text,
    step_order   integer NOT NULL DEFAULT 0,
    is_required  boolean NOT NULL DEFAULT true,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT onboarding_steps_uid_unique UNIQUE (uid),
    CONSTRAINT onboarding_steps_slug_unique UNIQUE (slug)
);

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
-- No DELETE — no plugin does physical delete (see plugins/README.md). Removing a step is a soft
-- delete (`active = false`), already covered by the UPDATE grant/policy below. The REVOKE strips
-- DELETE back off an install from before this change.
GRANT SELECT, INSERT, UPDATE ON TABLE public.onboarding_steps TO auth_user;
REVOKE DELETE ON TABLE public.onboarding_steps FROM auth_user;
-- `id bigserial` — same sequence-grant gap as onboarding_progress below; without it any INSERT
-- (gated by onboarding_steps.manage, but still executed as auth_user) 42501s on nextval().
GRANT USAGE, SELECT ON SEQUENCE public.onboarding_steps_id_seq TO auth_user;
DROP POLICY IF EXISTS onboarding_steps_select_policy ON public.onboarding_steps;
CREATE POLICY onboarding_steps_select_policy ON public.onboarding_steps FOR SELECT TO auth_user
USING (true);
-- Writes gated by the onboarding_steps.manage permission (registered below). Nobody is granted
-- it by default — see plugins/README.md convention; root already passes this check via
-- auth.fun_auth_has_perm's is_root bypass, no role_grants row needed.
DROP POLICY IF EXISTS onboarding_steps_insert_policy ON public.onboarding_steps;
CREATE POLICY onboarding_steps_insert_policy ON public.onboarding_steps FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('onboarding_steps', 'manage'));
DROP POLICY IF EXISTS onboarding_steps_update_policy ON public.onboarding_steps;
CREATE POLICY onboarding_steps_update_policy ON public.onboarding_steps FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('onboarding_steps', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('onboarding_steps', 'manage'));
-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS onboarding_steps_delete_policy ON public.onboarding_steps;

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id            bigserial PRIMARY KEY,
    uid           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    step_id       bigint NOT NULL REFERENCES public.onboarding_steps(id) ON DELETE RESTRICT,
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    completed_at  timestamptz,
    metadata      jsonb,
    tenant_id     uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    created_by    uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT onboarding_progress_uid_unique UNIQUE (uid),
    CONSTRAINT onboarding_progress_user_step_unique UNIQUE (user_id, step_id)
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.onboarding_progress TO auth_user;
-- `id bigserial` backs its DEFAULT with nextval() on onboarding_progress_id_seq — granting only
-- the table is not enough, Postgres separately checks USAGE/SELECT on the sequence for any INSERT
-- that relies on that default, otherwise every insert 42501s with "permission denied for sequence".
GRANT USAGE, SELECT ON SEQUENCE public.onboarding_progress_id_seq TO auth_user;
DROP POLICY IF EXISTS onboarding_progress_select_policy ON public.onboarding_progress;
CREATE POLICY onboarding_progress_select_policy ON public.onboarding_progress FOR SELECT TO auth_user
USING (user_id = auth.fun_auth_user_id());
DROP POLICY IF EXISTS onboarding_progress_insert_policy ON public.onboarding_progress;
CREATE POLICY onboarding_progress_insert_policy ON public.onboarding_progress FOR INSERT TO auth_user
WITH CHECK (user_id = auth.fun_auth_user_id());
DROP POLICY IF EXISTS onboarding_progress_update_policy ON public.onboarding_progress;
CREATE POLICY onboarding_progress_update_policy ON public.onboarding_progress FOR UPDATE TO auth_user
USING (user_id = auth.fun_auth_user_id())
WITH CHECK (user_id = auth.fun_auth_user_id());

-- Plugin registration + RBAC wiring (see plugins/README.md convention). onboarding_steps.manage
-- is registered in the catalog only — no role gets it automatically. Root already passes
-- auth.fun_auth_has_perm for it via the is_root bypass; granting it to a tenant role (or any
-- other role) is left to whoever installs/administers the consuming project. onboarding_progress
-- stays self-service only (no admin permission — a user's own progress isn't something an admin
-- edits here).
INSERT INTO auth.permissions (resource, action, name)
VALUES ('onboarding_steps', 'manage', 'Gerenciar etapas de onboarding')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('onboarding', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

-- fn_is_onboarding_completed — core feature of this plugin, not foco-total-specific: any project
-- consuming the onboarding plugin needs to answer "has the current user finished every required
-- step?" (gating a wizard, showing a banner, etc.), so it ships here instead of being reinvented
-- per project. No args — always evaluates against the calling user (auth.fun_auth_user_id()), so
-- it's callable both as a PostgREST RPC and from inside other functions/policies in this schema.
-- Not SECURITY DEFINER: RLS on onboarding_steps (readable to any auth_user) and onboarding_progress
-- (only the owning user's rows) already scopes this correctly for the invoker.
DROP FUNCTION IF EXISTS public.fn_is_onboarding_completed();

CREATE OR REPLACE FUNCTION public.fn_is_onboarding_completed()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_required_steps integer;
    v_completed_steps integer;
BEGIN

    -- Total de etapas obrigatórias
    SELECT COUNT(*)
    INTO v_required_steps
    FROM public.onboarding_steps os
    WHERE os.is_required = true;

    -- Etapas obrigatórias concluídas pelo usuário
    SELECT COUNT(DISTINCT op.step_id)
    INTO v_completed_steps
    FROM public.onboarding_progress op
    INNER JOIN public.onboarding_steps os
        ON os.id = op.step_id
    WHERE op.status = 'completed'
      AND os.is_required = true
      AND op.user_id = auth.fun_auth_user_id();

    RETURN v_completed_steps = v_required_steps;

END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_is_onboarding_completed() TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: storage  (3 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/storage/0001_storage.sql
-- ===============================================================================================

-- plugins/storage/0001_storage.sql
-- Optional. Depends only on core (auth.users, auth.tenants, auth.fun_auth_user_id(),
-- auth.fun_auth_current_tenant_id()) — no dependency on any other plugin.
--
-- Generic file storage: one row per uploaded file, content stored inline as `bytea` (no external
-- object storage integration here — a project needing S3/R2/etc. swaps the storage layer server
-- side, the table shape doesn't change). Used today by `getStorageService()`
-- (`kizuna-core/src/server/storage-service.ts`) for both authenticated upload/list/delete
-- (`/api/storage/files`) and anonymous content serving (`/api/public/storage/files/[id]/content`)
-- — e.g. a user's avatar or an ad's cover photo must be viewable by a visitor who isn't logged in
-- at all, which is why the SELECT policy below has an `anon` branch (active rows only), not just
-- an owner-only one.
--
-- Any plugin/project column that stores a reference to a file (e.g. `user_data.avatar_url`,
-- `services.cover_file_id`) just holds this table's `id` (or the public content URL built from
-- it) — there's no FK from those columns to `files.id`, so nothing SQL-level forces installing
-- this plugin. It's a soft, functional dependency instead: a project that wants avatar/ad-image
-- upload to actually work (not just fail with "permission denied for table files") needs this
-- plugin installed alongside whichever plugin owns that upload feature. See the note in
-- `plugins/user_data/0001_user_data.sql`.

CREATE TABLE IF NOT EXISTS public.files (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid              uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
    tenant_id        uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    original_name    text,
    storage_path     text,
    public_url       text,
    mime_type        text,
    size_bytes       int,
    width            int,
    height           int,
    purpose          text DEFAULT 'other' CHECK (purpose IN (
      'ad_image', 'avatar', 'document', 'banner', 'pdf', 'doc', 'other'
    )),
    content          bytea,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfills defaults on a `files` table that already existed before this plugin (e.g.
-- foco-total's old `db/migrations/0001_initial_schema.sql`, which created the table with no
-- default on `uid`/`tenant_id` at all) — a no-op on a table this file just created itself, since
-- it already has the same defaults from the CREATE TABLE above.
ALTER TABLE public.files ALTER COLUMN uid SET DEFAULT auth.fun_auth_user_id();
ALTER TABLE public.files ALTER COLUMN tenant_id SET DEFAULT auth.fun_auth_current_tenant_id();
ALTER TABLE public.files ALTER COLUMN active SET DEFAULT true;
ALTER TABLE public.files ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.files ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.files ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_files_uid ON public.files(uid);
CREATE INDEX IF NOT EXISTS idx_files_tenant_id ON public.files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_files_purpose ON public.files(purpose);
CREATE INDEX IF NOT EXISTS idx_files_active ON public.files(active);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- No DELETE grant — deletion is soft (`active = false` via PATCH, see `deleteFilePostgres` in
-- storage-service.ts), which only needs UPDATE.
GRANT SELECT, INSERT, UPDATE ON TABLE public.files TO auth_user;
-- Anon needs SELECT too — public content serving (`/api/public/storage/files/[id]/content`)
-- reads this table unauthenticated, restricted to active rows by the policy below.
GRANT SELECT ON TABLE public.files TO anon;

DROP POLICY IF EXISTS files_select_policy ON public.files;
CREATE POLICY files_select_policy ON public.files FOR SELECT TO auth_user
USING (uid = auth.fun_auth_user_id() OR active = true);

DROP POLICY IF EXISTS files_select_anon_policy ON public.files;
CREATE POLICY files_select_anon_policy ON public.files FOR SELECT TO anon
USING (active = true);

DROP POLICY IF EXISTS files_insert_policy ON public.files;
CREATE POLICY files_insert_policy ON public.files FOR INSERT TO auth_user
WITH CHECK (uid = auth.fun_auth_user_id());

DROP POLICY IF EXISTS files_update_policy ON public.files;
CREATE POLICY files_update_policy ON public.files FOR UPDATE TO auth_user
USING (uid = auth.fun_auth_user_id())
WITH CHECK (uid = auth.fun_auth_user_id());

-- Self-service only (each user manages their own uploads) — no admin-manage permission
-- registered. A project wanting "admin can delete anyone's file" adds a
-- `files.manage`-gated policy branch itself.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('storage', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/storage/0002_storage_service_image_purpose.sql
-- ===============================================================================================

-- plugins/storage/0002_storage_service_image_purpose.sql
-- Adds 'service_image' to `files.purpose`'s CHECK constraint. The `services` wizard's image step
-- (`client/components/services/wizard-steps/step-images.tsx`) has uploaded with
-- `purpose="service_image"` since the service wizard shipped, but `0001_storage.sql`'s CHECK never
-- included it (only `ad_image` from the older `ads`-based flow) — every upload from that step has
-- been failing at the DB layer with `violates check constraint "files_purpose_check"` on any
-- database still running the 0001 constraint. Found while seeding service images directly against
-- `public.files` (a plain INSERT with `purpose = 'service_image'` reproduces the 42... check
-- violation immediately).
--
-- Idempotent: DROP + re-CREATE the same-named constraint is safe to re-run (Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`, so DROP IF EXISTS + CREATE is the standard idempotent pattern
-- for constraints in this codebase).

ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_purpose_check;

ALTER TABLE public.files ADD CONSTRAINT files_purpose_check CHECK (purpose IN (
  'ad_image', 'service_image', 'avatar', 'document', 'banner', 'pdf', 'doc', 'other'
));

INSERT INTO auth.plugin_registry (name, version)
VALUES ('storage', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/storage/0003_storage_demanda_attachment_purpose.sql
-- ===============================================================================================

-- plugins/storage/0003_storage_demanda_attachment_purpose.sql
-- Adds 'demanda_attachment' to `files.purpose`'s CHECK constraint — the demanda create flow's
-- attachment step (`ImageGalleryManager` reused in `readOnly`/mixed mode, see
-- foco-total/src/components/demandas/criar-demanda-button.tsx) uploads with
-- `purpose="demanda_attachment"`. Same idempotent DROP + re-CREATE pattern as
-- 0002_storage_service_image_purpose.sql.

ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_purpose_check;

ALTER TABLE public.files ADD CONSTRAINT files_purpose_check CHECK (purpose IN (
  'ad_image', 'service_image', 'demanda_attachment', 'avatar', 'document', 'banner', 'pdf', 'doc', 'other'
));

INSERT INTO auth.plugin_registry (name, version)
VALUES ('storage', '1.2.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: location  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/location/0001_location.sql
-- ===============================================================================================

-- plugins/location/0001_location.sql
-- Optional. Generic geographic reference hierarchy: country -> region -> state -> city. Pure
-- reference data (no tenant/user ownership columns) — read-open to any session, no write access
-- granted to auth_user at all (not even self-service): this catalog is meant to be seeded once
-- (by an admin, or a project's own seed script) and never edited through the API. Same
-- "no write grant" shape as public.notifications' INSERT (see plugins/README.md), but here even
-- UPDATE/DELETE are withheld — nothing about this data is user- or tenant-editable.
--
-- Design notes:
-- 1) Deliberately country-agnostic in the schema: no "br"/"brasil" anywhere in table or column
--    names. Brazil-specific data (regions, states, cities) is a separate seed that lives in the
--    consuming project (foco-total's db/extras/location_seed_brazil.sql), not in this plugin.
-- 2) `location_region` sits between country and state — an explicit product decision to keep the
--    "grouping of states" level that already existed informally (Brazil's N/NE/SE/S/CO), now
--    properly scoped to a country via `country_id` instead of being implicit. `region_id` on
--    `location_state` is nullable because not every country's subdivision system has this middle
--    tier.
-- 3) `location_state` is the generic name for what Brazil calls "UF" (unidade federativa) — the
--    country-specific term doesn't belong in a generic schema.
-- 4) `location_state`/`location_city` use plain integer primary keys with NO generated default
--    (`id integer PRIMARY KEY`, not `serial`/`bigserial`) instead of the uuid surrogate keys most
--    other plugins use. This is deliberate: Brazil's own IBGE municipality/UF numeric codes are
--    stable, well-known natural keys, and reusing them verbatim as the primary key lets the
--    Brazil seed (db/extras/location_seed_brazil.sql) carry over 5000+ pre-existing city rows
--    from the old orphaned seed unchanged — no id remapping, no per-row subselect needed to
--    resolve `state_id`. Any other country seeded later either reuses its own official numeric
--    codes the same way, or picks arbitrary non-colliding integers — nothing in the schema
--    requires the id to mean anything.
-- 5) `location_city` keeps `microrregion_name`/`mesorregion_name` as nullable free-text columns
--    (dropping the `*_id` denormalized columns the old IBGE-sourced seed had, since nothing
--    references them by id) — real, already-available data kept at no schema cost, even though
--    the product only needs country/state/city today.
-- 6) No `auth.permissions` row and no RBAC gate: reference data with no admin-manageable action
--    behind it (see plugins/README.md convention — not every plugin needs one, e.g.
--    notifications has none either).

-- ---------------------------------------------------------------------------------------------
-- 1) location_country
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_country (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code         text NOT NULL,
    name         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT location_country_code_key UNIQUE (code)
);

-- ---------------------------------------------------------------------------------------------
-- 2) location_region — grouping level above state (e.g. Brazil's N/NE/SE/S/CO). See design note
--    2 above. Uses a plain integer id (no default) for the same "reuse the existing seed's ids
--    unchanged" reason as location_state/location_city (design note 4).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_region (
    id           integer NOT NULL PRIMARY KEY,
    country_id   uuid NOT NULL REFERENCES public.location_country(id) ON DELETE CASCADE,
    code         text NOT NULL,
    name         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT location_region_country_code_key UNIQUE (country_id, code)
);

CREATE INDEX IF NOT EXISTS idx_location_region_country_id ON public.location_region(country_id);

-- ---------------------------------------------------------------------------------------------
-- 3) location_state — generic name for what Brazil calls "UF" (design note 3). region_id
--    nullable (design note 2). See design note 4 for why id is a plain integer with no default.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_state (
    id           integer NOT NULL PRIMARY KEY,
    country_id   uuid NOT NULL REFERENCES public.location_country(id) ON DELETE CASCADE,
    region_id    integer REFERENCES public.location_region(id) ON DELETE SET NULL,
    code         text NOT NULL,
    name         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT location_state_country_code_key UNIQUE (country_id, code)
);

CREATE INDEX IF NOT EXISTS idx_location_state_country_id ON public.location_state(country_id);
CREATE INDEX IF NOT EXISTS idx_location_state_region_id ON public.location_state(region_id);

-- ---------------------------------------------------------------------------------------------
-- 4) location_city — see design notes 4 and 5 for the id and denormalized-name column choices.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_city (
    id                   integer NOT NULL PRIMARY KEY,
    state_id             integer NOT NULL REFERENCES public.location_state(id) ON DELETE CASCADE,
    name                 text NOT NULL,
    microrregion_name    text,
    mesorregion_name     text,
    created_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT location_city_state_name_key UNIQUE (state_id, name)
);

CREATE INDEX IF NOT EXISTS idx_location_city_state_id ON public.location_city(state_id);

-- ---------------------------------------------------------------------------------------------
-- 5) RLS. Read-open to any session (public reference data, same principle as taxonomy/holidays
--    catalogs). No write grant to auth_user at all — see header note. Root/service-role bypass
--    RLS entirely as usual, so seeding/administering this data directly against the database
--    (not through PostgREST) is unaffected.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.location_country ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.location_country TO anon, auth_user;
DROP POLICY IF EXISTS location_country_select_policy ON public.location_country;
CREATE POLICY location_country_select_policy ON public.location_country FOR SELECT TO anon, auth_user
USING (true);

ALTER TABLE public.location_region ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.location_region TO anon, auth_user;
DROP POLICY IF EXISTS location_region_select_policy ON public.location_region;
CREATE POLICY location_region_select_policy ON public.location_region FOR SELECT TO anon, auth_user
USING (true);

ALTER TABLE public.location_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.location_state TO anon, auth_user;
DROP POLICY IF EXISTS location_state_select_policy ON public.location_state;
CREATE POLICY location_state_select_policy ON public.location_state FOR SELECT TO anon, auth_user
USING (true);

ALTER TABLE public.location_city ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.location_city TO anon, auth_user;
DROP POLICY IF EXISTS location_city_select_policy ON public.location_city;
CREATE POLICY location_city_select_policy ON public.location_city FOR SELECT TO anon, auth_user
USING (true);

-- Plugin registration (see plugins/README.md convention). No auth.permissions rows: reference
-- data, no admin-manageable action to gate (see header note 6).
INSERT INTO auth.plugin_registry (name, version)
VALUES ('location', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: pages  (2 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/pages/0001_pages.sql
-- ===============================================================================================

-- plugins/pages/0001_pages.sql
-- Optional. Depends only on core (auth.tenants, auth.fun_auth_current_tenant_id(),
-- auth.fun_auth_user_id(), auth.fun_auth_has_perm()). Does NOT ALTER any consuming-project
-- table, so it is safe to list in kizuna.plugins.json (unlike taxonomy).
--
-- Database-backed institutional / legal pages (about, terms, privacy, contact, ...), authored in
-- Markdown and server-rendered by the consuming app at `/[slug]`. Mirrors
-- plugins/onboarding/0001_onboarding.sql for the boilerplate (RLS on, REVOKE DELETE, sequence
-- grant, permission catalog-only, plugin_registry upsert, NOTIFY pgrst). Idempotent throughout.
--
-- NO seeding here (schema/RLS/RBAC only). Project-neutral default pages (sobre, quem-somos,
-- termos-de-uso) ship as a separate data file, 0002_pages_seed.sql, applied right after this one
-- by the installer. A consuming project can still add its own richer content on top
-- (e.g. foco-total's db/extras/pages_seed.sql).

CREATE TABLE IF NOT EXISTS public.pages (
    id           bigserial PRIMARY KEY,
    uid          uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id()
                 REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    slug         text NOT NULL,
    title        text NOT NULL,
    description  text,
    content      text NOT NULL DEFAULT '',
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    active       boolean NOT NULL DEFAULT true,
    created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pages_uid_unique UNIQUE (uid),
    CONSTRAINT pages_tenant_slug_unique UNIQUE (tenant_id, slug),
    CONSTRAINT pages_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- Backfill defaults/constraints on a `pages` table that predates this file (no-op on a table
-- this file just created).
ALTER TABLE public.pages ALTER COLUMN tenant_id SET DEFAULT auth.fun_auth_current_tenant_id();
ALTER TABLE public.pages ALTER COLUMN created_by SET DEFAULT auth.fun_auth_user_id();
ALTER TABLE public.pages ALTER COLUMN content SET DEFAULT '';
ALTER TABLE public.pages ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.pages ALTER COLUMN active SET DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pages_tenant_id ON public.pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON public.pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status ON public.pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_active ON public.pages(active);

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- No DELETE — removing a page is a soft delete (`active = false`), covered by the UPDATE
-- grant/policy. The REVOKE strips DELETE off an install from before this file.
GRANT SELECT, INSERT, UPDATE ON TABLE public.pages TO auth_user;
REVOKE DELETE ON TABLE public.pages FROM auth_user;
-- Anon must be able to read a published page (logged-out visitor hitting `/[slug]`) — same
-- rationale as the storage plugin's anon-SELECT branch.
GRANT SELECT ON TABLE public.pages TO anon;
-- `id bigserial` DEFAULT calls nextval() on the sequence — Postgres checks USAGE/SELECT on the
-- sequence separately from the table grant, otherwise every INSERT 42501s.
GRANT USAGE, SELECT ON SEQUENCE public.pages_id_seq TO auth_user;

-- Anon: only published + active rows.
DROP POLICY IF EXISTS pages_select_anon_policy ON public.pages;
CREATE POLICY pages_select_anon_policy ON public.pages FOR SELECT TO anon
USING (active = true AND status = 'published');

-- Authenticated: any active row (authors/admins can see their own drafts too).
DROP POLICY IF EXISTS pages_select_policy ON public.pages;
CREATE POLICY pages_select_policy ON public.pages FOR SELECT TO auth_user
USING (active = true);

-- Writes gated by the pages.manage permission (registered below, catalog-only). Nobody gets it
-- automatically — root passes via auth.fun_auth_has_perm's is_root bypass; handing it to a
-- tenant role is left to whoever administers the consuming project.
DROP POLICY IF EXISTS pages_insert_policy ON public.pages;
CREATE POLICY pages_insert_policy ON public.pages FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('pages', 'manage'));

DROP POLICY IF EXISTS pages_update_policy ON public.pages;
CREATE POLICY pages_update_policy ON public.pages FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('pages', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('pages', 'manage'));

DROP POLICY IF EXISTS pages_delete_policy ON public.pages;

-- Plugin registration + RBAC wiring (see plugins/README.md convention).
INSERT INTO auth.permissions (resource, action, name)
VALUES ('pages', 'manage', 'Gerenciar páginas')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('pages', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/pages/0002_pages_seed.sql
-- ===============================================================================================

-- plugins/pages/0002_pages_seed.sql
--
-- Default institutional-pages seed, shipped WITH the `pages` plugin so a fresh install
-- isn't an empty site. The content here is deliberately project-neutral: it refers to
-- "a plataforma" / "nossa plataforma" and never names a real brand. A consuming project
-- is expected to edit these pages in the admin UI at `/painel/administracao/paginas`,
-- or to override them with its own seed (e.g. foco-total's db/extras/pages_seed.sql).
--
-- This file is DATA ONLY: it does not touch auth.plugin_registry / auth.permissions
-- (0001 already did that) and does not bump the plugin version.
--
-- Idempotent: re-running does not duplicate rows (ON CONFLICT ON CONSTRAINT
-- pages_tenant_slug_unique DO NOTHING).
--
-- Applied automatically right after 0001_pages.sql by the installer's widened
-- NNNN_*.sql glob (scripts/install.sh), which expands matches in filename order.
--
-- Tenant/user resolution: `pages.tenant_id` and `pages.created_by` are NOT NULL with
-- FKs. On a truly fresh DB there may be NO users/tenants yet at plugin-install time.
-- The INSERT below resolves the first root user and the tenant they own via
-- INNER `JOIN LATERAL (...) ON true`; when either subquery yields no row the join
-- produces zero rows and the whole INSERT is a silent no-op (never NULL into a NOT
-- NULL column, never an error).

INSERT INTO public.pages (slug, title, description, content, status, active, tenant_id, created_by)
SELECT
    v.slug,
    v.title,
    v.description,
    v.content,
    'published',
    true,
    t.uid,
    u.uid
FROM (VALUES
    (
        'sobre',
        'Sobre',
        'Conheça a plataforma, o que ela oferece e como ela funciona.',
        $md$# Sobre

Bem-vindo à nossa plataforma. Este é um espaço criado para conectar pessoas que
precisam de um serviço a profissionais e empresas prontos para atendê-las.

## O que oferecemos

A plataforma reúne, em um só lugar, anúncios de serviços de diferentes categorias.
Quem procura pode comparar opções, ver detalhes e entrar em contato diretamente com
quem oferece o serviço. Quem anuncia ganha visibilidade e novos clientes.

## Como funciona

- **Para quem procura:** navegue pelas categorias ou use a busca, abra os anúncios
  que chamarem sua atenção e fale com o anunciante.
- **Para quem anuncia:** crie sua conta, cadastre seus serviços com fotos e
  descrição, e acompanhe os contatos pelo painel.

## Nosso compromisso

Trabalhamos para manter um ambiente organizado, transparente e seguro, em que a
informação apresentada seja clara e as regras valham para todos. A plataforma está
em evolução contínua, e o retorno de quem a utiliza orienta cada melhoria.
$md$
    ),
    (
        'quem-somos',
        'Quem somos',
        'Nossa missão, nossos valores e a forma como pensamos a plataforma.',
        $md$# Quem somos

Somos uma equipe dedicada a facilitar o encontro entre quem precisa de um serviço e
quem sabe prestá-lo. Acreditamos que a tecnologia deve simplificar esse caminho, e
não complicá-lo.

## Nossa missão

Aproximar pessoas e negócios de forma simples, dando a profissionais de todos os
portes a chance de mostrar seu trabalho e a clientes a tranquilidade de escolher
bem.

## Nossos valores

- **Transparência:** informações claras, sem letras miúdas.
- **Respeito:** tratamos usuários, anunciantes e parceiros com a mesma consideração.
- **Simplicidade:** cada recurso existe para resolver um problema real.
- **Melhoria contínua:** ouvimos quem usa a plataforma e evoluímos a partir disso.

## Para onde vamos

Seguimos ampliando categorias, aperfeiçoando as ferramentas do painel e investindo
na qualidade da experiência, para que a plataforma seja a primeira opção de quem
procura e de quem oferece serviços.
$md$
    ),
    (
        'termos-de-uso',
        'Termos de uso',
        'As regras para utilização da plataforma e as responsabilidades de cada parte.',
        $md$# Termos de uso

Estes termos regulam o uso da plataforma. Ao acessá-la ou utilizá-la, você concorda
com as condições descritas abaixo. Recomendamos a leitura atenta deste documento.

## 1. Aceitação dos termos

O uso da plataforma implica a aceitação integral destes termos. Caso você não
concorde com qualquer disposição, não utilize os serviços oferecidos.

## 2. Cadastro e conta

Para utilizar determinados recursos é necessário criar uma conta, fornecendo
informações verdadeiras, completas e atualizadas. Você é responsável por manter a
confidencialidade de suas credenciais e por todas as atividades realizadas em sua
conta.

## 3. Uso da plataforma

A plataforma deve ser utilizada de forma lícita e de acordo com estes termos. É
vedado publicar conteúdo falso, enganoso, ofensivo ou que viole direitos de
terceiros, bem como tentar comprometer a segurança ou o funcionamento do serviço.

## 4. Responsabilidades

A plataforma atua como um espaço de conexão entre usuários e anunciantes. A
negociação, a contratação e a execução dos serviços ocorrem diretamente entre as
partes, que são as únicas responsáveis por seus atos, informações e compromissos
assumidos.

## 5. Propriedade intelectual

Marca, identidade visual, textos, layout e software da plataforma são protegidos e
não podem ser copiados, reproduzidos ou utilizados sem autorização prévia. O
conteúdo publicado por cada usuário permanece de sua responsabilidade.

## 6. Alterações nos termos

Estes termos podem ser atualizados a qualquer momento para refletir mudanças no
serviço ou na legislação aplicável. A versão vigente estará sempre disponível nesta
página, e o uso continuado da plataforma após alterações representa concordância com
o novo texto.

## 7. Contato

Em caso de dúvidas sobre estes termos, entre em contato pelos canais de atendimento
divulgados na plataforma.
$md$
    )
) AS v(slug, title, description, content)
JOIN LATERAL (
    SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1
) AS u(uid) ON true
JOIN LATERAL (
    SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at ASC LIMIT 1
) AS t(uid) ON true
ON CONFLICT ON CONSTRAINT pages_tenant_slug_unique DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: holidays  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/holidays/0001_holidays.sql
-- ===============================================================================================

-- plugins/holidays/0001_holidays.sql
-- Optional. Depends only on core (auth.users, auth.tenants, auth.fun_auth_user_id(),
-- auth.fun_auth_current_tenant_id(), auth.fun_auth_has_perm()). Combo plugin, same shape as
-- agenda/0001_agenda.sql: one admin-managed catalog (`holidays`) plus two tenant self-service
-- tables built on top of it (`holidays_tenant` — on/off toggle per catalog entry,
-- `holidays_tenant_custom_days_off` — a tenant's own days off, not from the catalog at all).
--
-- Design notes (see task report for full context):
-- 1) `holidays.tenant_id`/`created_by` are new columns that never existed in foco-total's old
--    migrations/0001_initial_schema.sql, even though db/extras/feriados_nacionais.sql already
--    inserts against them. NULL tenant_id = national/global catalog entry shared by every tenant;
--    a filled tenant_id = a catalog entry a specific tenant added for itself (state/city holiday
--    not worth seeding globally). Both nullable.
-- 2) `holidays_tenant` gains `active` and `created_by` — columns
--    src/lib/server/resources/resource-holidays.ts already selects but that never existed in
--    db/migrations/0004_holidays_tenant.sql. `holidays_tenant_custom_days_off` is redesigned to
--    match that same resource file's `select`/`mapInput` 1:1 (`name`, `recurring`, `description`,
--    `active`, `date_interval`, `date_interval_end`, `deleted`) instead of the old ad-hoc
--    `reason` column, which no code path reads.

-- ---------------------------------------------------------------------------------------------
-- 1) holidays — shared catalog. Readable by any session (same "open read" principle as the
--    taxonomy plugin's categories/categories_sub); writes gated by holidays.manage.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holidays (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name         text NOT NULL,
    description  text,
    date         date NOT NULL,
    scope        text NOT NULL DEFAULT 'national'
                 CHECK (scope IN ('national', 'state', 'city')),
    state_code   text,
    city_ibge    text,
    recurring    boolean NOT NULL DEFAULT false,
    active       boolean NOT NULL DEFAULT true,
    tenant_id    uuid REFERENCES auth.tenants(uid) ON DELETE CASCADE,
    created_by   uuid REFERENCES auth.users(uid) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_scope ON public.holidays(scope);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_id ON public.holidays(tenant_id);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.holidays TO auth_user, anon;
-- No DELETE — no plugin does physical delete (see plugins/README.md). Removing a catalog entry
-- is a soft delete (`active = false`), already covered by the UPDATE grant/policy below. The
-- REVOKE strips DELETE back off an install from before this change.
GRANT INSERT, UPDATE ON TABLE public.holidays TO auth_user;
REVOKE DELETE ON TABLE public.holidays FROM auth_user;

DROP POLICY IF EXISTS holidays_select_policy ON public.holidays;
CREATE POLICY holidays_select_policy ON public.holidays FOR SELECT TO auth_user, anon
USING (true);

-- Writes gated by the holidays.manage permission (registered below). Nobody is granted it by
-- default — see plugins/README.md convention; root already passes this check via
-- auth.fun_auth_has_perm's is_root bypass, no role_grants row needed.
DROP POLICY IF EXISTS holidays_insert_policy ON public.holidays;
CREATE POLICY holidays_insert_policy ON public.holidays FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('holidays', 'manage'));

DROP POLICY IF EXISTS holidays_update_policy ON public.holidays;
CREATE POLICY holidays_update_policy ON public.holidays FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('holidays', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('holidays', 'manage'));

-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS holidays_delete_policy ON public.holidays;

-- ---------------------------------------------------------------------------------------------
-- 2) holidays_tenant — a tenant's on/off preference against a catalog entry. Strictly
--    self-service (a tenant manages only its own rows), no permission gate.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holidays_tenant (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    holiday_id   uuid NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
    is_off       boolean NOT NULL DEFAULT true,
    active       boolean NOT NULL DEFAULT true,
    created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant_tenant_id ON public.holidays_tenant(tenant_id);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_holiday_id ON public.holidays_tenant(holiday_id);

ALTER TABLE public.holidays_tenant ENABLE ROW LEVEL SECURITY;
-- No DELETE — soft delete (`active = false`) via the UPDATE grant/policy below.
GRANT SELECT, INSERT, UPDATE ON TABLE public.holidays_tenant TO auth_user;
REVOKE DELETE ON TABLE public.holidays_tenant FROM auth_user;

DROP POLICY IF EXISTS holidays_tenant_select_policy ON public.holidays_tenant;
CREATE POLICY holidays_tenant_select_policy ON public.holidays_tenant FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS holidays_tenant_insert_policy ON public.holidays_tenant;
CREATE POLICY holidays_tenant_insert_policy ON public.holidays_tenant FOR INSERT TO auth_user
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS holidays_tenant_update_policy ON public.holidays_tenant;
CREATE POLICY holidays_tenant_update_policy ON public.holidays_tenant FOR UPDATE TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS holidays_tenant_delete_policy ON public.holidays_tenant;

-- ---------------------------------------------------------------------------------------------
-- 3) holidays_tenant_custom_days_off — a tenant's own days off, unrelated to the catalog.
--    Columns mirror resource-holidays.ts's `holidays_tenant_custom_days_off` select/mapInput 1:1
--    (see design note 2 above) instead of the old migrations/0004 shape (`reason`, no soft
--    delete, no interval). Strictly self-service, no permission gate.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holidays_tenant_custom_days_off (
    id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id           uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    name                text NOT NULL,
    date                date NOT NULL,
    date_interval       boolean NOT NULL DEFAULT false,
    date_interval_end   date,
    recurring           boolean NOT NULL DEFAULT false,
    description         text,
    active              boolean NOT NULL DEFAULT true,
    deleted             boolean NOT NULL DEFAULT false,
    created_by          uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_days_off_tenant_id ON public.holidays_tenant_custom_days_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_days_off_date ON public.holidays_tenant_custom_days_off(date);

ALTER TABLE public.holidays_tenant_custom_days_off ENABLE ROW LEVEL SECURITY;
-- No DELETE — soft delete (`active`/`deleted`, both already columns here) via the UPDATE
-- grant/policy below.
GRANT SELECT, INSERT, UPDATE ON TABLE public.holidays_tenant_custom_days_off TO auth_user;
REVOKE DELETE ON TABLE public.holidays_tenant_custom_days_off FROM auth_user;

DROP POLICY IF EXISTS holidays_custom_days_off_select_policy ON public.holidays_tenant_custom_days_off;
CREATE POLICY holidays_custom_days_off_select_policy ON public.holidays_tenant_custom_days_off FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS holidays_custom_days_off_insert_policy ON public.holidays_tenant_custom_days_off;
CREATE POLICY holidays_custom_days_off_insert_policy ON public.holidays_tenant_custom_days_off FOR INSERT TO auth_user
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS holidays_custom_days_off_update_policy ON public.holidays_tenant_custom_days_off;
CREATE POLICY holidays_custom_days_off_update_policy ON public.holidays_tenant_custom_days_off FOR UPDATE TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS holidays_custom_days_off_delete_policy ON public.holidays_tenant_custom_days_off;

-- Plugin registration + RBAC wiring (see plugins/README.md convention). holidays.manage is
-- registered in the catalog only — no role gets it automatically. Root already passes
-- auth.fun_auth_has_perm for it via the is_root bypass; granting it to a tenant role (or any
-- other role) is left to whoever installs/administers the consuming project.
-- holidays_tenant/holidays_tenant_custom_days_off stay self-service only (no admin permission —
-- a tenant's own calendar isn't something an admin edits here).
INSERT INTO auth.permissions (resource, action, name)
VALUES ('holidays', 'manage', 'Gerenciar catálogo de feriados')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('holidays', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: agenda  (4 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/agenda/0001_agenda.sql
-- ===============================================================================================

-- plugins/agenda/0001_agenda.sql
-- Optional. Depends only on core (auth.users, auth.tenants, auth.fun_auth_user_id(),
-- auth.fun_auth_current_tenant_id()). Two tables: agenda_events (a user's own calendar events)
-- and agenda_settings (one view-preferences row per user+tenant). Both strictly self-service —
-- same shape as user_data/account_preferences, no admin-facing "manage another user's agenda"
-- capability exists here, so no permission is registered (see plugins/README.md convention).
--
-- "end" is a reserved SQL keyword — quoted everywhere it's declared/referenced, same fix already
-- applied to the `order` column in migrations/0001_initial_schema.sql. Don't drop the quotes.

-- ---------------------------------------------------------------------------------------------
-- 1) agenda_events — a user's own calendar events. calendar_id/resource_id are free-form text
--    (foreign key, not FK'd here — which fixed set of calendars/resources exists is a
--    project-level concern; foco-total keeps its 3 resources as an in-code constant, not a
--    table, see src/lib/server/agenda-constants.ts).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_events (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    user_id      uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    title        text NOT NULL,
    start        timestamptz NOT NULL,
    "end"        timestamptz NOT NULL,
    description  text,
    location     text,
    people       jsonb,
    calendar_id  text NOT NULL,
    resource_id  text,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill for a table created before `active` existed here.
ALTER TABLE public.agenda_events ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_agenda_events_user_start ON public.agenda_events(user_id, start);

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
-- No DELETE — no plugin does physical delete (see plugins/README.md). Removing an event is a
-- soft delete (`active = false`), which the existing UPDATE grant/policy below already covers.
-- The REVOKE strips DELETE back off an install from before this change (GRANT alone never
-- removes a privilege a prior apply already handed out).
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_events TO auth_user;
REVOKE DELETE ON TABLE public.agenda_events FROM auth_user;

DROP POLICY IF EXISTS agenda_events_select_policy ON public.agenda_events;
CREATE POLICY agenda_events_select_policy ON public.agenda_events FOR SELECT TO auth_user
USING (user_id = auth.fun_auth_user_id());

DROP POLICY IF EXISTS agenda_events_insert_policy ON public.agenda_events;
CREATE POLICY agenda_events_insert_policy ON public.agenda_events FOR INSERT TO auth_user
WITH CHECK (user_id = auth.fun_auth_user_id());

DROP POLICY IF EXISTS agenda_events_update_policy ON public.agenda_events;
CREATE POLICY agenda_events_update_policy ON public.agenda_events FOR UPDATE TO auth_user
USING (user_id = auth.fun_auth_user_id())
WITH CHECK (user_id = auth.fun_auth_user_id());

-- No longer created — physical delete is disallowed (see the GRANT note above). Dropped so a
-- re-apply against an install from before this change removes it too.
DROP POLICY IF EXISTS agenda_events_delete_policy ON public.agenda_events;

-- ---------------------------------------------------------------------------------------------
-- 2) agenda_settings — singleton row per (user_id, tenant_id), same composite-PK-as-uniqueness
--    shape as account_preferences/0001_account_preferences.sql. Columns mirror
--    AgendaSettingsPayload (src/types/agenda.ts) 1:1 so the API layer needs no field mapping
--    beyond camelCase<->snake_case.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_settings (
    user_id                uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id              uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    enabled                boolean NOT NULL DEFAULT true,
    default_view           text NOT NULL DEFAULT 'week'
                           CHECK (default_view IN ('day', 'week', 'month-grid', 'list')),
    timezone               text NOT NULL DEFAULT 'America/Sao_Paulo',
    week_starts_on         text NOT NULL DEFAULT 'monday'
                           CHECK (week_starts_on IN ('monday', 'sunday')),
    show_weekends          boolean NOT NULL DEFAULT true,
    show_decluttered_list  boolean NOT NULL DEFAULT false,
    reminders_enabled      boolean NOT NULL DEFAULT true,
    created_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT agenda_settings_pkey PRIMARY KEY (user_id, tenant_id)
);

ALTER TABLE public.agenda_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_settings TO auth_user;

DROP POLICY IF EXISTS agenda_settings_policy ON public.agenda_settings;
CREATE POLICY agenda_settings_policy ON public.agenda_settings FOR ALL TO auth_user
USING (user_id = auth.fun_auth_user_id())
WITH CHECK (user_id = auth.fun_auth_user_id());

-- Plugin registration (see plugins/README.md convention). No permissions registered: both tables
-- are strictly self-service, same as user_data/account_preferences — no admin override to view
-- or edit another user's events/settings exists here.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('agenda', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/agenda/0002_agenda_config.sql
-- ===============================================================================================

-- plugins/agenda/0002_agenda_config.sql
-- Follow-up migration for the `agenda` plugin (0001 created agenda_events + agenda_settings).
-- Adds the tenant's *schedule configuration*: named weekly schedules ("Comercial", "Fim de
-- semana"…), one set of weekday rows per schedule, plus two per-tenant singletons — booking
-- rules and agenda notification preferences.
--
-- Depends only on core (auth.tenants, auth.users, auth.fun_auth_user_id(),
-- auth.fun_auth_current_tenant_id()). Strictly self-service, same as agenda_settings — a tenant
-- manages only its own rows, no admin "manage another tenant's schedule" capability exists, so
-- no permission is registered (see plugins/README.md convention).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS before every CREATE POLICY.
-- No plugin does physical DELETE (see plugins/README.md) — removing a schedule is a soft delete
-- (`active = false`); the REVOKE strips DELETE back off an install from before this file.

-- ---------------------------------------------------------------------------------------------
-- 1) agenda_schedule — a named weekly schedule. N per tenant. A consuming project points its
--    own domain rows at one of these (e.g. foco-total adds services.schedule_id — an FK that
--    lives in the project, not here: this plugin knows nothing about "services").
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_schedule (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    name         text NOT NULL,
    timezone     text NOT NULL DEFAULT 'America/Sao_Paulo',
    -- `active` = the enable/disable toggle (a disabled schedule stays visible, greyed out).
    -- `deleted` = soft delete (the row disappears from every read; see softDeleteField in the
    -- resource config). No plugin does physical DELETE.
    active       boolean NOT NULL DEFAULT true,
    deleted      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.agenda_schedule ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agenda_schedule_tenant ON public.agenda_schedule(tenant_id) WHERE NOT deleted;

ALTER TABLE public.agenda_schedule ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_schedule TO auth_user;
REVOKE DELETE ON TABLE public.agenda_schedule FROM auth_user;

DROP POLICY IF EXISTS agenda_schedule_select_policy ON public.agenda_schedule;
CREATE POLICY agenda_schedule_select_policy ON public.agenda_schedule FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS agenda_schedule_insert_policy ON public.agenda_schedule;
CREATE POLICY agenda_schedule_insert_policy ON public.agenda_schedule FOR INSERT TO auth_user
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS agenda_schedule_update_policy ON public.agenda_schedule;
CREATE POLICY agenda_schedule_update_policy ON public.agenda_schedule FOR UPDATE TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS agenda_schedule_delete_policy ON public.agenda_schedule;

-- ---------------------------------------------------------------------------------------------
-- 2) agenda_schedule_hours — weekday rows for one schedule. Fixed small set per schedule:
--    day_of_week 0..6 (Sun..Sat) plus the sentinel 9 = lunch break (same window shape, applied
--    across every active day — mirrors foco-total's original LUNCH_DAY_OF_WEEK convention).
--    One row per (schedule_id, day_of_week); the client upserts (POST new / PATCH existing),
--    never deletes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_schedule_hours (
    id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id  uuid NOT NULL REFERENCES public.agenda_schedule(id) ON DELETE CASCADE,
    tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6 OR day_of_week = 9),
    open_time    time NOT NULL,
    close_time   time NOT NULL,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT agenda_schedule_hours_unique UNIQUE (schedule_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_agenda_schedule_hours_schedule ON public.agenda_schedule_hours(schedule_id);

ALTER TABLE public.agenda_schedule_hours ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_schedule_hours TO auth_user;
REVOKE DELETE ON TABLE public.agenda_schedule_hours FROM auth_user;

DROP POLICY IF EXISTS agenda_schedule_hours_select_policy ON public.agenda_schedule_hours;
CREATE POLICY agenda_schedule_hours_select_policy ON public.agenda_schedule_hours FOR SELECT TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS agenda_schedule_hours_insert_policy ON public.agenda_schedule_hours;
CREATE POLICY agenda_schedule_hours_insert_policy ON public.agenda_schedule_hours FOR INSERT TO auth_user
WITH CHECK (
    tenant_id = auth.fun_auth_current_tenant_id()
    AND EXISTS (
        SELECT 1 FROM public.agenda_schedule s
        WHERE s.id = schedule_id AND s.tenant_id = auth.fun_auth_current_tenant_id()
    )
);

DROP POLICY IF EXISTS agenda_schedule_hours_update_policy ON public.agenda_schedule_hours;
CREATE POLICY agenda_schedule_hours_update_policy ON public.agenda_schedule_hours FOR UPDATE TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

DROP POLICY IF EXISTS agenda_schedule_hours_delete_policy ON public.agenda_schedule_hours;

-- ---------------------------------------------------------------------------------------------
-- 3) agenda_booking_preferences — per-tenant singleton (UNIQUE tenant_id). Keeps a surrogate
--    `id` so the generic /api/resources route and useTenantResource (POST-then-PATCH) work
--    unchanged. Carries foco-total's original business_preferences fields 1:1.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_booking_preferences (
    id                    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id             uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    created_by            uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    booking_window_days   integer NOT NULL DEFAULT 7,
    client_picks_schedule boolean NOT NULL DEFAULT false,
    min_advance_hours     integer NOT NULL DEFAULT 4,
    buffer_minutes        integer NOT NULL DEFAULT 30,
    service_radius_km     integer NOT NULL DEFAULT 10,
    auto_accept_trusted   boolean NOT NULL DEFAULT false,
    active                boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT agenda_booking_preferences_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE public.agenda_booking_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_booking_preferences TO auth_user;

DROP POLICY IF EXISTS agenda_booking_preferences_policy ON public.agenda_booking_preferences;
CREATE POLICY agenda_booking_preferences_policy ON public.agenda_booking_preferences FOR ALL TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

-- ---------------------------------------------------------------------------------------------
-- 4) agenda_notification_preferences — per-tenant singleton. What/when/how the tenant is
--    notified about agenda activity. Mechanism only: which channels actually deliver is the
--    consuming project's concern (foco-total wires these to the `notifications`/email layers).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_notification_preferences (
    id                    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id             uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    created_by            uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    notify_new_booking    boolean NOT NULL DEFAULT true,
    notify_cancellation   boolean NOT NULL DEFAULT true,
    notify_reminder       boolean NOT NULL DEFAULT true,
    reminder_hours_before integer NOT NULL DEFAULT 24,
    channel_email         boolean NOT NULL DEFAULT true,
    channel_push          boolean NOT NULL DEFAULT true,
    channel_whatsapp      boolean NOT NULL DEFAULT false,
    active                boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT agenda_notification_preferences_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE public.agenda_notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agenda_notification_preferences TO auth_user;

DROP POLICY IF EXISTS agenda_notification_preferences_policy ON public.agenda_notification_preferences;
CREATE POLICY agenda_notification_preferences_policy ON public.agenda_notification_preferences FOR ALL TO auth_user
USING (tenant_id = auth.fun_auth_current_tenant_id())
WITH CHECK (tenant_id = auth.fun_auth_current_tenant_id());

-- ---------------------------------------------------------------------------------------------
-- Plugin registration — bump agenda 1.0.0 -> 1.1.0. No permissions registered (self-service).
-- ---------------------------------------------------------------------------------------------
INSERT INTO auth.plugin_registry (name, version)
VALUES ('agenda', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/agenda/0003_agenda_rbac_policies.sql
-- ===============================================================================================

-- plugins/agenda/0003_agenda_rbac_policies.sql
-- Follow-up to 0001 (agenda_events, agenda_settings) — adds the admin-override clause now that
-- `agenda.manage` is registered in the catalog (see foco-total's
-- db/migrations/0002_rbac_app_permissions.sql). Previously these two tables were strictly
-- self-service (user_id = auth.fun_auth_user_id() only, no admin bypass at all). This migration
-- widens SELECT/INSERT/UPDATE on both to also allow a caller holding `agenda.manage` — e.g. a
-- tenant admin auditing/managing another user's calendar.
--
-- Does NOT touch agenda_schedule / agenda_schedule_hours / agenda_booking_preferences /
-- agenda_notification_preferences (0002_agenda_config.sql) — those are tenant_id-scoped, not
-- user_id-scoped (every tenant member with baseline access already sees the whole tenant's
-- schedule config), so there is no per-user boundary for `agenda.manage` to override.
--
-- Idempotent: DROP POLICY IF EXISTS before every CREATE POLICY, same convention as 0001/0002.
-- Only widens existing predicates with an `OR auth.fun_auth_has_perm(...)` clause — never
-- loosens/removes the base `user_id = auth.fun_auth_user_id()` check.

-- ---------------------------------------------------------------------------------------------
-- 1) agenda_events
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS agenda_events_select_policy ON public.agenda_events;
CREATE POLICY agenda_events_select_policy ON public.agenda_events FOR SELECT TO auth_user
USING (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
);

DROP POLICY IF EXISTS agenda_events_insert_policy ON public.agenda_events;
CREATE POLICY agenda_events_insert_policy ON public.agenda_events FOR INSERT TO auth_user
WITH CHECK (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
);

DROP POLICY IF EXISTS agenda_events_update_policy ON public.agenda_events;
CREATE POLICY agenda_events_update_policy ON public.agenda_events FOR UPDATE TO auth_user
USING (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
)
WITH CHECK (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
);

-- ---------------------------------------------------------------------------------------------
-- 2) agenda_settings — single FOR ALL policy in 0001; split predicate stays the same shape
--    (USING covers SELECT/UPDATE/DELETE, WITH CHECK covers INSERT/UPDATE). No DELETE is granted
--    to auth_user on this table (see 0001 GRANT list), so this only ever gates
--    SELECT/INSERT/UPDATE in practice.
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS agenda_settings_policy ON public.agenda_settings;
CREATE POLICY agenda_settings_policy ON public.agenda_settings FOR ALL TO auth_user
USING (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
)
WITH CHECK (
    user_id = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('agenda', 'manage')
);

-- ---------------------------------------------------------------------------------------------
-- Plugin registration — bump agenda 1.1.0 -> 1.1.1 (RLS-only change, no schema change).
-- ---------------------------------------------------------------------------------------------
INSERT INTO auth.plugin_registry (name, version)
VALUES ('agenda', '1.1.1')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/agenda/0004_agenda_availability.sql
-- ===============================================================================================

-- plugins/agenda/0004_agenda_availability.sql
-- Follow-up migration for the `agenda` plugin (0001 = agenda_events/agenda_settings, 0002 =
-- agenda_schedule/*_hours/*_preferences, 0003 = RBAC admin-override policies — a separate,
-- concurrent workstream; not touched here). Adds:
--
--   1. `agenda_schedule.metadata` (jsonb) — free-form room for a schedule to carry tags/links
--      later (e.g. `{tags: [...], links: {...}}`) without another migration. No consumer reads
--      it yet; this just opens the column up front, same idea as `services.extras`.
--   2. `fn_agenda_availability(p_schedule_id, p_date, p_slot_minutes)` — computes free booking
--      slots for one schedule on one calendar day: the day's open/close window from
--      `agenda_schedule_hours` (day_of_week 0-6), minus the lunch window (day_of_week = 9
--      sentinel, same convention as 0002), minus any day the tenant has marked off
--      (`holidays_tenant.is_off` / `holidays_tenant_custom_days_off`), minus already-booked
--      `agenda_events` (padded by `agenda_booking_preferences.buffer_minutes`), and dropping any
--      slot that starts before `now() + min_advance_hours`.
--
-- Tenant scoping: the function takes NO tenant id argument. Like every other SECURITY DEFINER
-- RPC in this plugin (fn_msg_* in the messaging plugin is the model), it derives the caller's
-- tenant from the JWT via auth.fun_auth_current_tenant_id() — a client can never pass its own
-- tenant_id and read/compute another tenant's availability. `p_schedule_id` is still checked
-- against that tenant below (a schedule id from another tenant returns an empty set, not an
-- error, so the function can't be used to probe which ids exist).
--
-- Known gap (documented, not solved here — out of scope for this migration): `agenda_events` has
-- no `schedule_id` column (0001 predates 0002's schedules and only knows free-form
-- `resource_id` text). There is therefore no way yet to know which events belong to which named
-- schedule. Until a consuming project adds that FK (see the note already in 0002 about
-- `services.schedule_id` living in the project, not the plugin), this function treats every
-- active `agenda_events` row for the tenant as occupying time on every schedule — i.e. it blocks
-- slots tenant-wide, not per-schedule. Safe (never over-promises a slot that's actually booked
-- elsewhere), just coarser than per-schedule until that FK exists.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE FUNCTION; DROP FUNCTION IF EXISTS with
-- the old signature first (harmless no-op on a fresh install).

-- ---------------------------------------------------------------------------------------------
-- 1) agenda_schedule.metadata — reserved jsonb for future tags/links, mirrors how `services`
--    keeps `extras` for exactly this purpose. Empty object default so callers never see NULL.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.agenda_schedule
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------------------------
-- 2) fn_agenda_availability — free slots for (my tenant's) schedule on a given day.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_agenda_availability(uuid, date, integer);

CREATE OR REPLACE FUNCTION public.fn_agenda_availability(
    p_schedule_id  uuid,
    p_date         date,
    p_slot_minutes integer DEFAULT 30
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant_id       uuid := auth.fun_auth_current_tenant_id();
    v_timezone        text;
    v_day_of_week     smallint;
    v_open_time       time;
    v_close_time      time;
    v_lunch_open      time;
    v_lunch_close     time;
    v_window_start    timestamptz;
    v_window_end      timestamptz;
    v_lunch_start     timestamptz;
    v_lunch_end       timestamptz;
    v_min_advance_h   integer := 4;
    v_buffer_minutes  integer := 30;
    v_not_before      timestamptz;
    v_is_holiday      boolean;
BEGIN
    IF p_schedule_id IS NULL OR p_date IS NULL THEN
        RETURN;
    END IF;

    IF p_slot_minutes IS NULL OR p_slot_minutes <= 0 THEN
        p_slot_minutes := 30;
    END IF;

    -- Schedule must belong to the caller's tenant, be enabled and not soft-deleted. Any mismatch
    -- (wrong tenant, disabled, deleted, unknown id) yields zero rows rather than an error.
    SELECT s.timezone
      INTO v_timezone
      FROM public.agenda_schedule s
     WHERE s.id = p_schedule_id
       AND s.tenant_id = v_tenant_id
       AND s.active = true
       AND s.deleted = false;

    IF v_timezone IS NULL THEN
        RETURN;
    END IF;

    -- Tenant marked this date off (recurring national/state/city holiday accepted for the
    -- tenant, or an ad-hoc custom day off / range) => no slots at all.
    v_day_of_week := EXTRACT(DOW FROM p_date)::smallint; -- 0 = Sunday .. 6 = Saturday

    SELECT EXISTS (
        SELECT 1
          FROM public.holidays_tenant ht
          JOIN public.holidays h ON h.id = ht.holiday_id AND h.active = true
         WHERE ht.tenant_id = v_tenant_id
           AND ht.is_off = true
           AND (
                (h.recurring AND to_char(h.date, 'MM-DD') = to_char(p_date, 'MM-DD'))
             OR (NOT h.recurring AND h.date = p_date)
           )
    )
    OR EXISTS (
        SELECT 1
          FROM public.holidays_tenant_custom_days_off cdo
         WHERE cdo.tenant_id = v_tenant_id
           AND cdo.active = true
           AND cdo.deleted = false
           AND (
                (cdo.date_interval AND p_date BETWEEN cdo.date AND COALESCE(cdo.date_interval_end, cdo.date))
             OR (NOT cdo.date_interval AND cdo.recurring AND to_char(cdo.date, 'MM-DD') = to_char(p_date, 'MM-DD'))
             OR (NOT cdo.date_interval AND NOT cdo.recurring AND cdo.date = p_date)
           )
    )
    INTO v_is_holiday;

    IF v_is_holiday THEN
        RETURN;
    END IF;

    -- The day's open/close window (day_of_week 0-6). No active row for this weekday => closed.
    SELECT sh.open_time, sh.close_time
      INTO v_open_time, v_close_time
      FROM public.agenda_schedule_hours sh
     WHERE sh.schedule_id = p_schedule_id
       AND sh.day_of_week = v_day_of_week
       AND sh.active = true;

    IF v_open_time IS NULL OR v_close_time IS NULL THEN
        RETURN;
    END IF;

    -- Lunch break sentinel (day_of_week = 9), same window applied to every active day.
    SELECT sh.open_time, sh.close_time
      INTO v_lunch_open, v_lunch_close
      FROM public.agenda_schedule_hours sh
     WHERE sh.schedule_id = p_schedule_id
       AND sh.day_of_week = 9
       AND sh.active = true;

    -- open_time > close_time is legal (crosses midnight) — push the close boundary to the next
    -- calendar day in that case, same convention documented in 0002.
    v_window_start := (p_date + v_open_time) AT TIME ZONE v_timezone;
    v_window_end := (
        CASE WHEN v_close_time > v_open_time THEN p_date ELSE p_date + 1 END + v_close_time
    ) AT TIME ZONE v_timezone;

    IF v_lunch_open IS NOT NULL AND v_lunch_close IS NOT NULL THEN
        v_lunch_start := (p_date + v_lunch_open) AT TIME ZONE v_timezone;
        v_lunch_end := (
            CASE WHEN v_lunch_close > v_lunch_open THEN p_date ELSE p_date + 1 END + v_lunch_close
        ) AT TIME ZONE v_timezone;
    END IF;

    -- Booking preferences (singleton per tenant) — defaults above cover a tenant with no row yet.
    SELECT bp.min_advance_hours, bp.buffer_minutes
      INTO v_min_advance_h, v_buffer_minutes
      FROM public.agenda_booking_preferences bp
     WHERE bp.tenant_id = v_tenant_id;

    v_min_advance_h := COALESCE(v_min_advance_h, 4);
    v_buffer_minutes := COALESCE(v_buffer_minutes, 30);
    v_not_before := now() + make_interval(hours => v_min_advance_h);

    -- Candidate slots at p_slot_minutes granularity across the open window, dropped when they:
    --  - overlap the lunch break,
    --  - overlap an already-booked event for the tenant (padded by buffer_minutes on each side —
    --    see the 0004 header note on why this is tenant-wide, not schedule-scoped, for now),
    --  - or start before the minimum-advance cutoff.
    RETURN QUERY
    WITH candidates AS (
        SELECT
            g AS c_start,
            g + make_interval(mins => p_slot_minutes) AS c_end
          FROM generate_series(
                 v_window_start,
                 v_window_end - make_interval(mins => p_slot_minutes),
                 make_interval(mins => p_slot_minutes)
               ) AS g
    )
    SELECT c.c_start, c.c_end
      FROM candidates c
     WHERE c.c_start >= v_not_before
       AND (
            v_lunch_start IS NULL
         OR c.c_end <= v_lunch_start
         OR c.c_start >= v_lunch_end
       )
       AND NOT EXISTS (
            SELECT 1
              FROM public.agenda_events ev
             WHERE ev.tenant_id = v_tenant_id
               AND ev.active = true
               AND c.c_start < ev."end" + make_interval(mins => v_buffer_minutes)
               AND c.c_end > ev.start - make_interval(mins => v_buffer_minutes)
       )
     ORDER BY c.c_start;
END;
$function$;

-- SECURITY DEFINER owns the schema-qualified lookups above; only auth_user may call it (same as
-- every other fn_* in this plugin family — no anon grant, availability is a logged-in tenant
-- concern, not a public marketplace read).
GRANT EXECUTE ON FUNCTION public.fn_agenda_availability(uuid, date, integer) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: weather  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/weather/0001_weather.sql
-- ===============================================================================================

-- plugins/weather/0001_weather.sql
-- Optional. Weather widget (header): current temperature cycling through a list of cities, and a
-- modal with yesterday + today + the next days. No tables — data comes live from an external
-- provider (Open-Meteo by default) through the shell route /api/weather, configured entirely by
-- the "weather" block of the project's kizuna.config.json (cities, provider URL, cache, rotation).
-- This file only exists so the plugin is installable/tracked like every other plugin.

-- Plugin registration (see plugins/README.md convention). No auth.permissions rows: read-only,
-- nothing admin-manageable.
INSERT INTO auth.plugin_registry (name, version)
VALUES ('weather', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: forms  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/forms/0001_forms.sql
-- ===============================================================================================

-- plugins/forms/0001_forms.sql
-- Plugin: forms — generic, reusable form definitions (`forms`) plus their captured answers
-- (`form_results`). The authoring/rendering engine (FormBuilder / FormRenderer / validate) is
-- the separate `form-builder` engine shipped as kizuna-core TS only — this plugin owns just the
-- persistence + management slice.
--
-- Idempotent, from-zero-safe — same convention as kizuna-core/plugins/*/0001_*.sql
-- (see kizuna-core/plugins/README.md): CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE,
-- DROP POLICY IF EXISTS before CREATE POLICY, REVOKE DELETE (soft-delete only), sequence grants,
-- self-registers in auth.plugin_registry, registers a `forms`/`manage` permission catalog-only
-- (no automatic grant — root passes via auth.fun_auth_has_perm's is_root bypass), NOTIFY pgrst.
--
-- This plugin does NOT ALTER any consuming-project table, so it is safe to list in
-- kizuna.plugins.json unconditionally (unlike `taxonomy`).

-- ---------------------------------------------------------------------------------------------
-- 1) public.forms — the form config (a FormSchema + metadata), keyed for consumers by form_key.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forms (
  id           bigserial PRIMARY KEY,
  uid          uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  form_key     text NOT NULL,
  title        text NOT NULL,
  description  text,
  schema       jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  is_reusable  boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT forms_uid_unique UNIQUE (uid),
  CONSTRAINT forms_tenant_form_key_unique UNIQUE (tenant_id, form_key)
);

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.forms TO auth_user;
GRANT SELECT ON TABLE public.forms TO anon;
-- No DELETE — soft-delete only (`active = false`), covered by the UPDATE grant/policy. The
-- REVOKE strips DELETE back off an install from before this line existed.
REVOKE DELETE ON TABLE public.forms FROM auth_user, anon;
GRANT USAGE, SELECT ON SEQUENCE public.forms_id_seq TO auth_user;

-- SELECT: any active form is readable by an auth_user AND by anon (a form may render on a public
-- page in a later feature — mirrors storage's anon-readable approach).
DROP POLICY IF EXISTS forms_select_policy ON public.forms;
CREATE POLICY forms_select_policy ON public.forms FOR SELECT TO auth_user
USING (active = true);
DROP POLICY IF EXISTS forms_select_anon_policy ON public.forms;
CREATE POLICY forms_select_anon_policy ON public.forms FOR SELECT TO anon
USING (active = true);

-- INSERT / UPDATE gated on the forms.manage permission (registered below, granted to nobody by
-- default; root passes through auth.fun_auth_has_perm's is_root bypass).
DROP POLICY IF EXISTS forms_insert_policy ON public.forms;
CREATE POLICY forms_insert_policy ON public.forms FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('forms', 'manage'));
DROP POLICY IF EXISTS forms_update_policy ON public.forms;
CREATE POLICY forms_update_policy ON public.forms FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('forms', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('forms', 'manage'));

-- Version bump — server-side and unavoidable. Any change to `schema` increments `version` and
-- refreshes `updated_at`; other column edits leave `version` alone.
CREATE OR REPLACE FUNCTION public.fn_forms_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.schema IS DISTINCT FROM OLD.schema THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_forms_bump_version ON public.forms;
CREATE TRIGGER trg_forms_bump_version
BEFORE UPDATE ON public.forms
FOR EACH ROW EXECUTE FUNCTION public.fn_forms_bump_version();

-- ---------------------------------------------------------------------------------------------
-- 2) public.form_results — captured answers. Singleton: one current answer-set per
--    (tenant_id, domain, reference_id). Writes go through fn_form_result_upsert (below).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_results (
  id               bigserial PRIMARY KEY,
  uid              uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  form_id          bigint NOT NULL REFERENCES public.forms(id) ON DELETE RESTRICT,
  form_key         text NOT NULL,
  reference_id     text NOT NULL,
  domain           text NOT NULL,
  version          integer NOT NULL,
  schema_snapshot  jsonb NOT NULL,
  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by     uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT form_results_uid_unique UNIQUE (uid),
  CONSTRAINT form_results_singleton_unique UNIQUE (tenant_id, domain, reference_id)
);

CREATE INDEX IF NOT EXISTS form_results_answers_gin
  ON public.form_results USING gin (answers jsonb_path_ops);
CREATE INDEX IF NOT EXISTS form_results_lookup
  ON public.form_results (tenant_id, domain, reference_id);

ALTER TABLE public.form_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.form_results TO auth_user;
REVOKE DELETE ON TABLE public.form_results FROM auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.form_results_id_seq TO auth_user;

-- SELECT: owners see their own captures, forms.manage holders (and root) see all.
DROP POLICY IF EXISTS form_results_select_policy ON public.form_results;
CREATE POLICY form_results_select_policy ON public.form_results FOR SELECT TO auth_user
USING (submitted_by = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('forms', 'manage'));

-- INSERT / UPDATE: the invoker may only write their own rows. The RPC below runs as the invoker
-- (NOT SECURITY DEFINER), so these policies apply to it too.
DROP POLICY IF EXISTS form_results_insert_policy ON public.form_results;
CREATE POLICY form_results_insert_policy ON public.form_results FOR INSERT TO auth_user
WITH CHECK (submitted_by = auth.fun_auth_user_id());
DROP POLICY IF EXISTS form_results_update_policy ON public.form_results;
CREATE POLICY form_results_update_policy ON public.form_results FOR UPDATE TO auth_user
USING (submitted_by = auth.fun_auth_user_id())
WITH CHECK (submitted_by = auth.fun_auth_user_id());

-- ---------------------------------------------------------------------------------------------
-- 3) fn_form_result_upsert — the sanctioned write path for answers. A composite-key upsert does
--    not fit the generic PATCH /api/resources/:resource/:id flow (no id known at capture time),
--    so this RPC (exposed via the existing /api/postgrest/rpc proxy) is the way in. Not
--    SECURITY DEFINER — RLS on both tables already scopes it for the invoker.
--
--    The `forms` lookup below is intentionally NOT scoped to the caller's own tenant: forms_select_policy
--    already makes any active form readable by every tenant (and anon) — forms are a shared,
--    reusable catalog (see `is_reusable`), not per-tenant private config. A consumer whose forms
--    are managed by a different tenant than the one submitting answers (e.g. a shared taxonomy
--    admin owning `form_key`s that provider tenants fill in) must still resolve them. Only the
--    write side (INSERT/UPDATE on `forms`, gated by forms_insert/update_policy) is tenant-permissioned.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_form_result_upsert(
  p_form_key     text,
  p_domain       text,
  p_reference_id text,
  p_answers      jsonb
)
 RETURNS public.form_results
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_form      public.forms%ROWTYPE;
  v_result    public.form_results%ROWTYPE;
BEGIN
  SELECT * INTO v_form
  FROM public.forms
  WHERE form_key = p_form_key
    AND active = true
  ORDER BY tenant_id = auth.fun_auth_current_tenant_id() DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum formulario ativo para form_key=%', p_form_key
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.form_results (
    form_id, form_key, reference_id, domain, version, schema_snapshot, answers
  )
  VALUES (
    v_form.id, v_form.form_key, p_reference_id, p_domain, v_form.version, v_form.schema,
    COALESCE(p_answers, '{}'::jsonb)
  )
  ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
    answers          = EXCLUDED.answers,
    version          = EXCLUDED.version,
    schema_snapshot  = EXCLUDED.schema_snapshot,
    form_id          = EXCLUDED.form_id,
    form_key         = EXCLUDED.form_key,
    updated_at       = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_form_result_upsert(text, text, text, jsonb) TO auth_user;

-- ---------------------------------------------------------------------------------------------
-- 4) RBAC wiring + plugin registration (see kizuna-core/plugins/README.md convention).
-- ---------------------------------------------------------------------------------------------
INSERT INTO auth.permissions (resource, action, name)
VALUES ('forms', 'manage', 'Gerenciar formularios')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('forms', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: taxonomy  (3 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/taxonomy/0001_taxonomy.sql
-- ===============================================================================================

-- plugins/taxonomy/0001_taxonomy.sql
-- Plugin: taxonomy — generic hierarchical taxonomy mechanism, group -> category -> subcategory ->
-- tag. This plugin owns categories_group, categories_sub, and categories_sub_tags outright
-- (CREATE TABLE). Only the middle level, public.categories, is expected to already exist in the
-- consuming project's own base schema (this plugin only ALTERs it — it does not define its base
-- CREATE TABLE, to avoid fighting a project's own migration order for a table that may be FK'd
-- elsewhere, e.g. a `services`/`ads` table owned by the consumer).
--
-- Idempotent, from-zero-safe — same convention as kizuna-core/plugins/*/0001_*.sql (see
-- kizuna-core/plugins/README.md): CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
-- ON CONFLICT DO ..., self-registers in auth.plugin_registry, and registers a `categorias`
-- resource + permission (`view`/`manage`) that a consuming project's own admin UI and nav-perm
-- checks are expected to gate on, matching the write policies below.
--
-- IDs are bigserial (not uuid) across the whole tree — verified faster to index for a taxonomy
-- this size, and there's no cross-tenant/cross-system sharing need that would call for uuid.
-- public.categories (the one table this plugin doesn't own) is expected to use the same bigserial
-- convention in the consumer's own migration, since categories_group_id/category_id FKs here are
-- typed bigint.

-- public.categories definição

-- Drop table


-- ---------------------------------------------------------------------------------------------
-- 1) categories_group — enum-like table of top-level groups that classify categories, one level
--    above them. Same column conventions as public.categories.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories_group (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  tags text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_group_slug_key UNIQUE (slug)
);

ALTER TABLE public.categories_group ALTER COLUMN tenant_id SET DEFAULT auth.fun_auth_current_tenant_id();
ALTER TABLE public.categories_group ALTER COLUMN created_by SET DEFAULT auth.fun_auth_user_id();


-- ---------------------------------------------------------------------------------------------
-- 2) categories gains the columns the taxonomy feature needs on top of whatever base shape the
--    consuming project already defines for it: a group + icon + description (icon: a
--    client-resolved icon name, e.g. an icon-library component name). Also gains tenant_id/
--    created_by, matching the ownership columns every other domain table normally carries —
--    nullable (not NOT NULL) because a project's base schema may already seed rows with neither
--    column set; new rows created afterwards pick up the current session via the column defaults.
-- ---------------------------------------------------------------------------------------------

-- DROP TABLE public.categories;

CREATE TABLE public.categories (
   id bigserial PRIMARY KEY,
	"name" text NOT NULL,
	slug text NOT NULL,
	active bool DEFAULT true NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	icon text NULL,
	description text NULL,
	tenant_id uuid DEFAULT auth.fun_auth_current_tenant_id() NULL,
	created_by uuid DEFAULT auth.fun_auth_user_id() NULL,
	category_group_id int8 NULL,
	form_key text NULL, -- form_key de um public.forms ativo (plugin forms). Quando setado, o wizard de servicos exibe o passo de formulario dinamico para servicos desta categoria. Sem FK — forms e escopado por tenant.
	request_form_key text NULL,
	CONSTRAINT categories_slug_key UNIQUE (slug)
);

-- Column comments

COMMENT ON COLUMN public.categories.form_key IS 'form_key de um public.forms ativo (plugin forms). Quando setado, o wizard de servicos exibe o passo de formulario dinamico para servicos desta categoria. Sem FK — forms e escopado por tenant.';


-- public.categories chaves estrangeiras

ALTER TABLE public.categories ADD CONSTRAINT categories_category_group_id_fkey FOREIGN KEY (category_group_id) REFERENCES public.categories_group(id);



-- form_key: optional bridge to the `forms` plugin. When set, a category points at a reusable
-- `public.forms` row (by its tenant-scoped `form_key` string — no FK, `forms` may not be
-- installed). Consuming UIs (the service wizard's dynamic step) use it to decide whether to
-- render a `<DynamicFormStep>` for entities in that category. Harmless (nullable, unreferenced)
-- when the `forms` plugin is absent. Surfaced by kizuna-core's `taxonomy-edit-panel`.
-- Sibling column: `request_form_key` below is the symmetric bridge for the buyer's side —
-- `form_key` is the form the entity's PROVIDER fills (extra fields describing the offer),
-- `request_form_key` is the form the BUYER fills when requesting a quote / closing an order.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS form_key text;

COMMENT ON COLUMN public.categories.form_key IS
  'form_key of an active public.forms row (forms plugin). When set, consuming UIs render that form (filled by the entity provider) for entities in this category. No FK — forms is tenant-scoped. Sibling: request_form_key (buyer-facing).';

-- request_form_key: symmetric sibling of `form_key`. Same bridge mechanism (tenant-scoped
-- `public.forms.form_key` string, no FK, `forms` may not be installed), but this points at the
-- form the BUYER fills when requesting a quote / closing an order for entities in this category,
-- as opposed to `form_key` which is filled by the entity's provider. Harmless (nullable,
-- unreferenced) when the `forms` plugin is absent. Surfaced by kizuna-core's `taxonomy-edit-panel`.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS request_form_key text;

COMMENT ON COLUMN public.categories.request_form_key IS
  'form_key of an active public.forms row (forms plugin) used for the buyer''s quote/order-request flow for entities in this category. Buyer-facing sibling of form_key (provider-facing). No FK — forms is tenant-scoped.';

-- ---------------------------------------------------------------------------------------------
-- 3) categories_sub — owned outright by this plugin (unlike `categories`, nothing outside the
--    taxonomy feature FKs it, so there's no reason to leave its base table to the consumer).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories_sub (
  id bigserial PRIMARY KEY,
  category_id bigint NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  tags text,
  tenant_id uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by uuid DEFAULT auth.fun_auth_user_id(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_sub_slug_key UNIQUE (slug)
);

-- ---------------------------------------------------------------------------------------------
-- 4) categories_sub_tags — free-text search tags one level below categories_sub (the
--    "what the user would type in the search bar" leaf level). Not a globally-unique slug: the
--    same tag text may intentionally repeat under two different subcategories, so uniqueness is
--    scoped to (category_sub_id, slug) instead.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories_sub_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id bigint NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  category_sub_id bigint NOT NULL REFERENCES public.categories_sub(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  tenant_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_sub_tags_sub_slug_key UNIQUE (category_sub_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_sub_tags_category_id ON public.categories_sub_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_sub_tags_category_sub_id ON public.categories_sub_tags(category_sub_id);
CREATE INDEX IF NOT EXISTS idx_categories_sub_category_id ON public.categories_sub(category_id);

-- ---------------------------------------------------------------------------------------------
-- 5) RLS. The whole tree (group/category/subcategory/tag) is read-open — it's meant to serve
--    public browse data to anon — and write-gated behind the single `categorias`/`manage`
--    permission, shared by whatever admin screens a consuming project builds for it.
--    `categories` is expected to predate this plugin (defined in the consuming project's own
--    base schema) and may have no RLS policy of its own to mirror; this plugin is the first to
--    enable RLS on it, using the same read-open/write-gated shape as the tables it owns outright
--    so the whole feature is protected consistently under one permission.
-- ---------------------------------------------------------------------------------------------

-- categories_group
-- bigserial's underlying sequence needs its own GRANT — a table GRANT never covers it. Without
-- this, PostgREST returns "permission denied for sequence categories_group_id_seq" on insert
-- even though the table's own GRANT/policy already allow it.
GRANT USAGE, SELECT ON SEQUENCE public.categories_group_id_seq TO auth_user;
ALTER TABLE public.categories_group ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.categories_group TO anon, auth_user;
-- No DELETE — no plugin does physical delete (see plugins/README.md). Removing a group is a
-- soft delete (`active = false`), already covered by the UPDATE grant/policy below.
GRANT INSERT, UPDATE ON TABLE public.categories_group TO auth_user;
REVOKE DELETE ON TABLE public.categories_group FROM auth_user;
DROP POLICY IF EXISTS categories_group_select_policy ON public.categories_group;
CREATE POLICY categories_group_select_policy ON public.categories_group FOR SELECT TO anon, auth_user
USING (true);
DROP POLICY IF EXISTS categories_group_insert_policy ON public.categories_group;
CREATE POLICY categories_group_insert_policy ON public.categories_group FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
DROP POLICY IF EXISTS categories_group_update_policy ON public.categories_group;
CREATE POLICY categories_group_update_policy ON public.categories_group FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('categorias', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS categories_group_delete_policy ON public.categories_group;

-- categories (predates this plugin — see note above)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.categories TO anon, auth_user;
-- No DELETE — soft delete (`active = false`) via the UPDATE grant/policy below.
GRANT INSERT, UPDATE ON TABLE public.categories TO auth_user;
REVOKE DELETE ON TABLE public.categories FROM auth_user;
DROP POLICY IF EXISTS categories_select_policy ON public.categories;
CREATE POLICY categories_select_policy ON public.categories FOR SELECT TO anon, auth_user
USING (true);
DROP POLICY IF EXISTS categories_insert_policy ON public.categories;
CREATE POLICY categories_insert_policy ON public.categories FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
DROP POLICY IF EXISTS categories_update_policy ON public.categories;
CREATE POLICY categories_update_policy ON public.categories FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('categorias', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS categories_delete_policy ON public.categories;

-- categories_sub
GRANT USAGE, SELECT ON SEQUENCE public.categories_sub_id_seq TO auth_user;
ALTER TABLE public.categories_sub ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.categories_sub TO anon, auth_user;
-- No DELETE — soft delete (`active = false`) via the UPDATE grant/policy below.
GRANT INSERT, UPDATE ON TABLE public.categories_sub TO auth_user;
REVOKE DELETE ON TABLE public.categories_sub FROM auth_user;
DROP POLICY IF EXISTS categories_sub_select_policy ON public.categories_sub;
CREATE POLICY categories_sub_select_policy ON public.categories_sub FOR SELECT TO anon, auth_user
USING (true);
DROP POLICY IF EXISTS categories_sub_insert_policy ON public.categories_sub;
CREATE POLICY categories_sub_insert_policy ON public.categories_sub FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
DROP POLICY IF EXISTS categories_sub_update_policy ON public.categories_sub;
CREATE POLICY categories_sub_update_policy ON public.categories_sub FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('categorias', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS categories_sub_delete_policy ON public.categories_sub;

-- categories_sub_tags
ALTER TABLE public.categories_sub_tags ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.categories_sub_tags TO anon, auth_user;
-- No DELETE — soft delete (`active = false`) via the UPDATE grant/policy below.
GRANT INSERT, UPDATE ON TABLE public.categories_sub_tags TO auth_user;
REVOKE DELETE ON TABLE public.categories_sub_tags FROM auth_user;
DROP POLICY IF EXISTS categories_sub_tags_select_policy ON public.categories_sub_tags;
CREATE POLICY categories_sub_tags_select_policy ON public.categories_sub_tags FOR SELECT TO anon, auth_user
USING (true);
DROP POLICY IF EXISTS categories_sub_tags_insert_policy ON public.categories_sub_tags;
CREATE POLICY categories_sub_tags_insert_policy ON public.categories_sub_tags FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
DROP POLICY IF EXISTS categories_sub_tags_update_policy ON public.categories_sub_tags;
CREATE POLICY categories_sub_tags_update_policy ON public.categories_sub_tags FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('categorias', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));
-- No longer created — physical delete is disallowed (see the GRANT note above).
DROP POLICY IF EXISTS categories_sub_tags_delete_policy ON public.categories_sub_tags;

-- ---------------------------------------------------------------------------------------------
-- 6) RBAC wiring (see kizuna-core/plugins/README.md convention). Two actions on the `categorias`
--    resource: `view` for read access to the admin UI a consuming project builds on top of this
--    (a nav-perm check typically defaults an authenticated user's check to the 'view' action);
--    `manage` is what the write policies above gate on. Both only exist in the catalog
--    (auth.permissions) — nobody gets either by default. ROOT already reaches everything through
--    fun_auth_has_perm's is_root bypass, no grant needed. Granting either action to a role is a
--    deliberate decision made by whoever administers the consuming project, not a default of
--    this plugin.
-- ---------------------------------------------------------------------------------------------
INSERT INTO auth.permissions (resource, action, name)
VALUES
  ('categorias', 'view', 'Ver categorias e taxonomia'),
  ('categorias', 'manage', 'Gerenciar categorias, subcategorias e tags de busca')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('taxonomy', '1.2.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/taxonomy/0002_taxonomy_stats_view.sql
-- ===============================================================================================

-- plugins/taxonomy/0002_taxonomy_stats_view.sql
-- Read model for taxonomy browse/admin UIs. One row per active subcategory, carrying its parent
-- category (id, name, group) plus `qtd` = number of active subcategories in that same parent
-- category (window count).
--
-- PURE taxonomy: this view references ONLY the taxonomy tables. It deliberately does NOT count
-- listings/services/ads — that is consumer-specific (a `services`/`ads` table this plugin knows
-- nothing about). A consuming project that needs "listings per subcategory" layers its own view
-- on top (see foco-total's src/lib/server/resources/resource-search.ts).
--
-- Idempotent: CREATE OR REPLACE VIEW. `security_invoker = true` so the querying role's RLS on the
-- underlying taxonomy tables applies (they are already read-open to anon / auth_user via
-- 0001_taxonomy.sql).
--
-- Applied by scripts/install.sh after 0001_taxonomy.sql (files run in filename order).

CREATE OR REPLACE VIEW public.vw_category_subcategory_stats
WITH (security_invoker = true) AS
SELECT
  cs.id                                   AS subcategory_id,
  cs.name                                 AS subcategory_name,
  c.id                                    AS category_id,
  c.name                                  AS category_name,
  c.icon                                  AS category_icon,
  c.category_group_id                     AS category_group_id,
  (count(*) OVER (PARTITION BY c.id))::int AS qtd
FROM public.categories_sub cs
JOIN public.categories c ON c.id = cs.category_id
WHERE cs.active = true
  AND c.active = true;

GRANT SELECT ON public.vw_category_subcategory_stats TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('taxonomy', '1.3.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/taxonomy/0003_taxonomy_group_link.sql
-- ===============================================================================================

-- plugins/taxonomy/0003_taxonomy_group_link.sql
-- Adds cross-group discovery to the taxonomy tree WITHOUT turning `category_group_id` into a
-- many-to-many column. `categories.category_group_id` stays the category's single "home" group
-- (unchanged — it's what a service inherits at creation time via `services.category_group_id`,
-- see plugins/services/0001_services.sql). This migration only adds an OPTIONAL secondary
-- membership: a category can additionally be listed under other groups' browse/search vitrines,
-- without touching `services` or `service_categories_sub` at all.
--
-- Pure join table, same shape/grant convention as `service_categories_sub` (plugins/services/
-- 0001_services.sql) rather than the entity tables above (categories_group/categories/
-- categories_sub/categories_sub_tags): a link row has no independent lifecycle to soft-delete —
-- removing a secondary group membership is a real DELETE, not `active = false`.
--
-- Idempotent, from-zero-safe — same convention as every other plugins/*/NNNN_*.sql.

CREATE TABLE IF NOT EXISTS public.categories_group_link (
  id                 bigserial PRIMARY KEY,
  category_id        bigint NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  category_group_id  bigint NOT NULL REFERENCES public.categories_group(id) ON DELETE CASCADE,
  tenant_id          uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by         uuid DEFAULT auth.fun_auth_user_id(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_group_link_unique UNIQUE (category_id, category_group_id)
);

CREATE INDEX IF NOT EXISTS idx_categories_group_link_category_id ON public.categories_group_link(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_group_link_group_id ON public.categories_group_link(category_group_id);

-- bigserial's underlying sequence needs its own GRANT — a table GRANT never covers it.
GRANT USAGE, SELECT ON SEQUENCE public.categories_group_link_id_seq TO auth_user;

ALTER TABLE public.categories_group_link ENABLE ROW LEVEL SECURITY;

-- Read-open (same as the rest of the taxonomy tree — /busca and the wizard's category picker
-- both read this as `anon` or `auth_user`), write-gated behind `categorias.manage`. Physical
-- DELETE is granted here (unlike the entity tables) because this row IS the membership — there
-- is nothing left to soft-delete once it's gone, exactly like `service_categories_sub`.
GRANT SELECT ON TABLE public.categories_group_link TO anon, auth_user;
GRANT INSERT, DELETE ON TABLE public.categories_group_link TO auth_user;

DROP POLICY IF EXISTS categories_group_link_select_policy ON public.categories_group_link;
CREATE POLICY categories_group_link_select_policy ON public.categories_group_link FOR SELECT TO anon, auth_user
USING (true);

DROP POLICY IF EXISTS categories_group_link_insert_policy ON public.categories_group_link;
CREATE POLICY categories_group_link_insert_policy ON public.categories_group_link FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('categorias', 'manage'));

DROP POLICY IF EXISTS categories_group_link_delete_policy ON public.categories_group_link;
CREATE POLICY categories_group_link_delete_policy ON public.categories_group_link FOR DELETE TO auth_user
USING (auth.fun_auth_has_perm('categorias', 'manage'));

INSERT INTO auth.plugin_registry (name, version)
VALUES ('taxonomy', '1.4.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: services  (2 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/services/0001_services.sql
-- ===============================================================================================

-- plugins/services/0001_services.sql
-- Plugin: services — domínio "marketplace de serviços" (o anúncio de um prestador) + a fila de
-- moderação desse anúncio. Idempotente, from-zero-safe (mesma convenção de plugins/*/0001_*.sql,
-- ver plugins/README.md). NÃO faz ALTER em tabela do projeto consumidor. Depende do plugin
-- `taxonomy` (referencia categories_group/categories por id) e do plugin `storage` (imagens em
-- extras.images apontam pra files, sem FK). Design: foco-total/docs/superpowers/specs/2026-09-09-wizard-engine-plugin-services-design.md

-- =========================================================================
-- 1) Enums
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.price_unit AS ENUM
    ('quote','service','hour','fixed','unit','visit','m2_metro_quadrado','project','package','monthly','day','km');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_status AS ENUM ('pending','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_location AS ENUM ('no_cliente','no_estabelecimento','remoto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 2) Tabelas
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.services (
  id                 bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid                uuid NOT NULL DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  category_group_id  bigint REFERENCES public.categories_group(id),
  category_id        bigint NOT NULL REFERENCES public.categories(id),
  description        text,
  starting_price     numeric NOT NULL DEFAULT 0,
  price_unit         public.price_unit NOT NULL DEFAULT 'quote',
  urgent_available   boolean NOT NULL DEFAULT false,
  extras             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             public.service_status NOT NULL DEFAULT 'pending',
  sponsored          boolean NOT NULL DEFAULT false,
  service_location   public.service_location,
  tenant_id          uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  created_by         uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_uid_unique UNIQUE (uid)
);
CREATE INDEX IF NOT EXISTS services_tenant   ON public.services (tenant_id, status) WHERE active;
CREATE INDEX IF NOT EXISTS services_owner    ON public.services (created_by);
CREATE INDEX IF NOT EXISTS services_category ON public.services (category_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.service_categories_sub (
  id                 bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_id         bigint NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  category_group_id  bigint NOT NULL REFERENCES public.categories_group(id),
  category_id        bigint NOT NULL REFERENCES public.categories(id),
  category_sub_id    bigint NOT NULL REFERENCES public.categories_sub(id),
  tenant_id          uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id(),
  created_by         uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_sub_unique UNIQUE (service_id, category_sub_id)
);
CREATE INDEX IF NOT EXISTS service_categories_sub_service ON public.service_categories_sub (service_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.service_moderations (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid               uuid NOT NULL DEFAULT gen_random_uuid(),
  service_id        bigint NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  decision          text NOT NULL CHECK (decision IN ('approved','rejected','escalated')),
  decision_note     text,
  rejection_reason  text CHECK (rejection_reason IS NULL OR rejection_reason IN
                      ('inappropriate_content','misleading','duplicate','wrong_category','incomplete','policy_violation','other')),
  priority          smallint NOT NULL DEFAULT 2,
  decided_at        timestamptz NOT NULL DEFAULT now(),
  auto_approved     boolean NOT NULL DEFAULT false,
  tenant_id         uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id(),
  created_by        uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_moderations_uid_unique UNIQUE (uid)
);
CREATE INDEX IF NOT EXISTS service_moderations_service ON public.service_moderations (service_id, decided_at DESC);

-- =========================================================================
-- 3) RLS
-- =========================================================================
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.services TO auth_user;
GRANT SELECT ON TABLE public.services TO anon;
REVOKE DELETE ON TABLE public.services FROM auth_user, anon;

DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read ON public.services FOR SELECT TO anon
  USING (active AND status = 'active');

DROP POLICY IF EXISTS services_owner_read ON public.services;
CREATE POLICY services_owner_read ON public.services FOR SELECT TO auth_user
  USING (active AND (created_by = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('services','moderate')
         OR (status = 'active')));

DROP POLICY IF EXISTS services_owner_write ON public.services;
CREATE POLICY services_owner_write ON public.services FOR INSERT TO auth_user
  WITH CHECK (created_by = auth.fun_auth_user_id());

DROP POLICY IF EXISTS services_owner_update ON public.services;
CREATE POLICY services_owner_update ON public.services FOR UPDATE TO auth_user
  USING (created_by = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('services','moderate'))
  WITH CHECK (created_by = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('services','moderate'));

ALTER TABLE public.service_categories_sub ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_categories_sub TO auth_user;
GRANT DELETE ON TABLE public.service_categories_sub TO auth_user;
GRANT SELECT ON TABLE public.service_categories_sub TO anon;
REVOKE DELETE ON TABLE public.service_categories_sub FROM anon;

DROP POLICY IF EXISTS scs_read ON public.service_categories_sub;
CREATE POLICY scs_read ON public.service_categories_sub FOR SELECT USING (true);

DROP POLICY IF EXISTS scs_owner_write ON public.service_categories_sub;
CREATE POLICY scs_owner_write ON public.service_categories_sub FOR ALL TO auth_user
  USING (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.created_by = auth.fun_auth_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.created_by = auth.fun_auth_user_id()));

ALTER TABLE public.service_moderations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.service_moderations TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.service_moderations FROM auth_user, anon;

DROP POLICY IF EXISTS sm_read ON public.service_moderations;
CREATE POLICY sm_read ON public.service_moderations FOR SELECT TO auth_user
  USING (auth.fun_auth_has_perm('services','moderate')
         OR EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.created_by = auth.fun_auth_user_id()));

-- =========================================================================
-- 4) RPC — fn_service_moderate: insere a moderação E deriva services.status, atômico.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_service_moderate(
  p_service_id       bigint,
  p_decision         text,
  p_note             text DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL
) RETURNS public.service_moderations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_row    public.service_moderations;
  v_status public.service_status;
BEGIN
  IF NOT auth.fun_auth_has_perm('services','moderate') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected','escalated') THEN
    RAISE EXCEPTION 'decisão inválida: %', p_decision USING errcode = '22023';
  END IF;

  v_status := CASE p_decision
    WHEN 'approved' THEN 'active'::public.service_status
    WHEN 'rejected' THEN 'archived'::public.service_status
    ELSE 'pending'::public.service_status
  END;

  INSERT INTO public.service_moderations (service_id, decision, decision_note, rejection_reason)
  VALUES (
    p_service_id, p_decision, NULLIF(btrim(coalesce(p_note,'')),''),
    CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  )
  RETURNING * INTO v_row;

  UPDATE public.services SET status = v_status, updated_at = now() WHERE id = p_service_id;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_service_moderate(bigint, text, text, text) TO auth_user;

-- =========================================================================
-- 5) RBAC + registro do plugin
-- =========================================================================
INSERT INTO auth.permissions (resource, action, name) VALUES
  ('services', 'moderate', 'Moderar anúncios de serviço')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/services/0002_services_category_stats_view.sql
-- ===============================================================================================

-- plugins/services/0002_services_category_stats_view.sql
-- Read model: quantos anúncios PUBLICADOS cada categoria tem. Uma linha por categoria ativa com
-- ao menos um anúncio publicado (`active AND status = 'active'`) — categoria sem anúncio não
-- aparece. Usada pelo <CategoryCarousel onlyWithListings> (home: `home.categoriesOnlyWithListings`
-- no kizuna.config.json) para esconder categorias vazias.
--
-- Mora aqui, e não no plugin taxonomy, porque a taxonomy é pura e não conhece `services`
-- (ver o cabeçalho de plugins/taxonomy/0002_taxonomy_stats_view.sql).
--
-- Idempotente: CREATE OR REPLACE VIEW. `security_invoker = true` — valem as RLS de `services` e
-- `categories` de quem consulta; o filtro explícito de status garante que um usuário logado não
-- conte os próprios anúncios pendentes (que a policy services_owner_read deixaria ver).

CREATE OR REPLACE VIEW public.vw_category_service_stats
WITH (security_invoker = true) AS
SELECT
  c.id                  AS category_id,
  c.name                AS category_name,
  count(s.id)::int      AS services_count
FROM public.categories c
JOIN public.services s
  ON s.category_id = c.id
 AND s.active = true
 AND s.status = 'active'
WHERE c.active = true
GROUP BY c.id, c.name;

GRANT SELECT ON public.vw_category_service_stats TO anon, auth_user;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('services', '1.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: reviews  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/reviews/0001_reviews.sql
-- ===============================================================================================

-- plugins/reviews/0001_reviews.sql
-- Plugin: reviews — infraestrutura genérica de avaliações da plataforma. Escopada por
-- `domain` + `reference_id` (SEM FK para a entidade avaliada), no mesmo molde de
-- forms/form_results: leitura aberta, escrita pela RPC. Primeiro consumidor: serviços
-- (`domain = 'service'`), mas o mecanismo já serve provider/product/company no futuro sem
-- reescrita.
--
-- Idempotente, from-zero-safe — mesma convenção de kizuna-core/plugins/*/0001_*.sql (ver
-- kizuna-core/plugins/README.md): CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE,
-- DROP POLICY IF EXISTS antes de CREATE POLICY, REVOKE DELETE (soft-delete só), GRANT de
-- sequência bigserial explícito, self-register em auth.plugin_registry, registra as permissões
-- `reviews`/`moderate` e `reviews`/`manage_tags` catálogo-only (sem grant automático — root passa
-- por auth.fun_auth_has_perm), NOTIFY pgrst no fim.
--
-- Este plugin NÃO faz ALTER em nenhuma tabela do projeto consumidor — é seguro listar em
-- kizuna.plugins.json incondicionalmente (como `forms`).
--
-- Design completo: foco-total/docs/superpowers/specs/2026-09-06-plugin-avaliacoes-design.md
--
-- EXCEÇÃO documentada à convenção "tenant_id sempre vem do JWT": `reviews.tenant_id` e
-- `review_moderation_requests.tenant_id` guardam o tenant DA ENTIDADE AVALIADA (o prestador),
-- não o do avaliador — o marketplace é cross-tenant (o avaliador está noutro tenant). Por isso
-- `reviews.tenant_id` NÃO tem DEFAULT: quem escreve é a RPC fn_review_create, que resolve o
-- tenant a partir do serviço. Um INSERT direto sem tenant falha (NOT NULL) de propósito.

-- =============================================================================================
-- 0) Funções de config (STABLE, sem dependência de tabela do plugin) — definidas antes das
--    policies que as referenciam.
-- =============================================================================================

-- Modo de moderação: 'post' (default) => nova avaliação nasce 'published'; 'pre' => 'pending'.
CREATE OR REPLACE FUNCTION public.fn_review_default_status()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN (SELECT value #>> '{}' FROM auth.system_config WHERE key = 'reviews.moderation_mode') = 'pre'
    THEN 'pending'
    ELSE 'published'
  END;
$function$;

-- Janela de edição do autor, em dias (auth.system_config chave 'reviews.edit_window_days').
CREATE OR REPLACE FUNCTION public.fn_review_edit_window_days()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    NULLIF((SELECT value #>> '{}' FROM auth.system_config WHERE key = 'reviews.edit_window_days'), '')::integer,
    7
  );
$function$;

-- =============================================================================================
-- 1) public.reviews — a avaliação
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id            bigserial PRIMARY KEY,
  uid           uuid NOT NULL DEFAULT gen_random_uuid(),
  domain        text NOT NULL,
  reference_id  text NOT NULL,
  id_customer   uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  tenant_id     uuid NOT NULL REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  rating        smallint NOT NULL,
  comment       text,
  author_name   text,                                 -- snapshot do nome público do avaliador na hora da criação (privacidade: só string, sem id)
  status        text NOT NULL DEFAULT 'published',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_uid_unique UNIQUE (uid),
  CONSTRAINT reviews_one_per_customer UNIQUE (domain, reference_id, id_customer),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_status_chk CHECK (status IN ('pending','published','hidden','rejected'))
);

-- Migração para instalações anteriores à v1.0.0 (CREATE TABLE IF NOT EXISTS não adiciona coluna).
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS author_name text;

CREATE INDEX IF NOT EXISTS reviews_lookup       ON public.reviews (domain, reference_id, status) WHERE active;
CREATE INDEX IF NOT EXISTS reviews_customer     ON public.reviews (id_customer);
CREATE INDEX IF NOT EXISTS reviews_tenant       ON public.reviews (tenant_id, status);
CREATE INDEX IF NOT EXISTS reviews_moderation_q ON public.reviews (status, created_at) WHERE status IN ('pending','hidden');

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.reviews TO auth_user;
GRANT SELECT ON TABLE public.reviews TO anon;
REVOKE DELETE ON TABLE public.reviews FROM auth_user, anon;
GRANT USAGE, SELECT ON SEQUENCE public.reviews_id_seq TO auth_user;

-- SELECT: qualquer um vê avaliação publicada+ativa. auth_user vê também a própria (qualquer
-- status) e, se tiver `reviews.moderate`, vê todas.
DROP POLICY IF EXISTS reviews_select_anon ON public.reviews;
CREATE POLICY reviews_select_anon ON public.reviews FOR SELECT TO anon
USING (status = 'published' AND active);

DROP POLICY IF EXISTS reviews_select_auth ON public.reviews;
CREATE POLICY reviews_select_auth ON public.reviews FOR SELECT TO auth_user
USING (
  (status = 'published' AND active)
  OR id_customer = auth.fun_auth_user_id()
  OR auth.fun_auth_has_perm('reviews', 'moderate')
);

-- INSERT: só a própria linha (a RPC fn_review_create roda como invoker e passa por aqui).
DROP POLICY IF EXISTS reviews_insert_auth ON public.reviews;
CREATE POLICY reviews_insert_auth ON public.reviews FOR INSERT TO auth_user
WITH CHECK (id_customer = auth.fun_auth_user_id());

-- UPDATE: o autor edita rating/comment dentro da janela (reviews.edit_window_days, default 7)
-- enquanto não estiver rejeitada; quem tem `reviews.moderate` edita qualquer uma (status).
DROP POLICY IF EXISTS reviews_update_auth ON public.reviews;
CREATE POLICY reviews_update_auth ON public.reviews FOR UPDATE TO auth_user
USING (
  auth.fun_auth_has_perm('reviews', 'moderate')
  OR (
    id_customer = auth.fun_auth_user_id()
    AND status <> 'rejected'
    AND created_at > now() - (public.fn_review_edit_window_days() || ' days')::interval
  )
)
WITH CHECK (
  auth.fun_auth_has_perm('reviews', 'moderate')
  OR (
    id_customer = auth.fun_auth_user_id()
    AND status <> 'rejected'
  )
);

-- =============================================================================================
-- 2) public.review_tags — catálogo de tags configurável pela administração
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.review_tags (
  id           bigserial PRIMARY KEY,
  uid          uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  domain       text,                                  -- NULL = vale para todos os domínios
  slug         text NOT NULL,
  label        text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  selectable   boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_tags_uid_unique UNIQUE (uid),
  CONSTRAINT review_tags_tenant_domain_slug_unique UNIQUE (tenant_id, domain, slug)
);

CREATE INDEX IF NOT EXISTS review_tags_catalog ON public.review_tags (domain, active, sort_order);

ALTER TABLE public.review_tags ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.review_tags TO auth_user;
GRANT SELECT ON TABLE public.review_tags TO anon;
REVOKE DELETE ON TABLE public.review_tags FROM auth_user, anon;
GRANT USAGE, SELECT ON SEQUENCE public.review_tags_id_seq TO auth_user;

DROP POLICY IF EXISTS review_tags_select_all ON public.review_tags;
CREATE POLICY review_tags_select_all ON public.review_tags FOR SELECT TO anon, auth_user
USING (active);

DROP POLICY IF EXISTS review_tags_insert ON public.review_tags;
CREATE POLICY review_tags_insert ON public.review_tags FOR INSERT TO auth_user
WITH CHECK (auth.fun_auth_has_perm('reviews', 'manage_tags'));

DROP POLICY IF EXISTS review_tags_update ON public.review_tags;
CREATE POLICY review_tags_update ON public.review_tags FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('reviews', 'manage_tags'))
WITH CHECK (auth.fun_auth_has_perm('reviews', 'manage_tags'));

-- =============================================================================================
-- 3) public.review_tag_links — join review <-> tag, com snapshot do texto (histórico)
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.review_tag_links (
  id                 bigserial PRIMARY KEY,
  review_id          bigint NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  tag_id             bigint REFERENCES public.review_tags(id) ON DELETE SET NULL,
  tag_slug_snapshot  text NOT NULL,
  tag_label_snapshot text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_tag_links_unique UNIQUE (review_id, tag_slug_snapshot)
);

CREATE INDEX IF NOT EXISTS review_tag_links_review ON public.review_tag_links (review_id);

ALTER TABLE public.review_tag_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.review_tag_links TO auth_user;
GRANT SELECT ON TABLE public.review_tag_links TO anon;
REVOKE UPDATE, DELETE ON TABLE public.review_tag_links FROM auth_user, anon;
GRANT USAGE, SELECT ON SEQUENCE public.review_tag_links_id_seq TO auth_user;

-- SELECT liberado: o snapshot só contém o texto da tag, que já é público na avaliação.
DROP POLICY IF EXISTS review_tag_links_select_all ON public.review_tag_links;
CREATE POLICY review_tag_links_select_all ON public.review_tag_links FOR SELECT TO anon, auth_user
USING (true);

-- INSERT: só via fn_review_create (invoker) — a review referida tem que ser do próprio caller.
DROP POLICY IF EXISTS review_tag_links_insert ON public.review_tag_links;
CREATE POLICY review_tag_links_insert ON public.review_tag_links FOR INSERT TO auth_user
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = review_id AND r.id_customer = auth.fun_auth_user_id()
  )
);

-- =============================================================================================
-- 4) public.review_moderation_requests — "solicitar revisão" pelo dono da entidade avaliada
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.review_moderation_requests (
  id                bigserial PRIMARY KEY,
  uid               uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id         bigint NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  moderator_id      uuid REFERENCES auth.users(uid) ON DELETE SET NULL,
  moderator_comment text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  CONSTRAINT review_moderation_requests_uid_unique UNIQUE (uid),
  CONSTRAINT review_moderation_requests_status_chk
    CHECK (status IN ('pending','approved','rejected','cancelled'))
);

-- No máximo UMA solicitação aberta por avaliação.
CREATE UNIQUE INDEX IF NOT EXISTS review_moderation_requests_one_open
  ON public.review_moderation_requests (review_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS review_moderation_requests_queue
  ON public.review_moderation_requests (status, created_at);

ALTER TABLE public.review_moderation_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.review_moderation_requests TO auth_user;
REVOKE DELETE ON TABLE public.review_moderation_requests FROM auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.review_moderation_requests_id_seq TO auth_user;

DROP POLICY IF EXISTS review_moderation_requests_select ON public.review_moderation_requests;
CREATE POLICY review_moderation_requests_select ON public.review_moderation_requests FOR SELECT TO auth_user
USING (
  requester_user_id = auth.fun_auth_user_id()
  OR auth.fun_auth_has_perm('reviews', 'moderate')
);

-- INSERT: só a própria (a RPC fn_review_moderation_request roda como invoker e valida o dono).
DROP POLICY IF EXISTS review_moderation_requests_insert ON public.review_moderation_requests;
CREATE POLICY review_moderation_requests_insert ON public.review_moderation_requests FOR INSERT TO auth_user
WITH CHECK (requester_user_id = auth.fun_auth_user_id());

-- UPDATE: moderador resolve; requester só cancela a própria enquanto pendente.
DROP POLICY IF EXISTS review_moderation_requests_update ON public.review_moderation_requests;
CREATE POLICY review_moderation_requests_update ON public.review_moderation_requests FOR UPDATE TO auth_user
USING (
  auth.fun_auth_has_perm('reviews', 'moderate')
  OR (requester_user_id = auth.fun_auth_user_id() AND status = 'pending')
)
WITH CHECK (
  auth.fun_auth_has_perm('reviews', 'moderate')
  OR (requester_user_id = auth.fun_auth_user_id() AND status = 'cancelled')
);

-- =============================================================================================
-- 5) public.review_moderation_events — trilha de auditoria append-only (idioma do `ad_reviews`)
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.review_moderation_events (
  id             bigserial PRIMARY KEY,
  review_id      bigint NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  actor_user_id  uuid NOT NULL,
  action         text NOT NULL,
  from_status    text,
  to_status      text,
  note           text,
  request_id     bigint REFERENCES public.review_moderation_requests(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_moderation_events_review
  ON public.review_moderation_events (review_id, created_at);

ALTER TABLE public.review_moderation_events ENABLE ROW LEVEL SECURITY;
-- Sem GRANT de INSERT — só fn_review_moderate (SECURITY DEFINER) escreve aqui, como `notifications`.
GRANT SELECT ON TABLE public.review_moderation_events TO auth_user;
DROP POLICY IF EXISTS review_moderation_events_select ON public.review_moderation_events;
CREATE POLICY review_moderation_events_select ON public.review_moderation_events FOR SELECT TO auth_user
USING (auth.fun_auth_has_perm('reviews', 'moderate'));

-- =============================================================================================
-- 6) public.review_stats — agregado mantido por trigger (resumo O(1), público)
-- =============================================================================================
CREATE TABLE IF NOT EXISTS public.review_stats (
  domain         text NOT NULL,
  reference_id   text NOT NULL,
  tenant_id      uuid,
  total_reviews  integer NOT NULL DEFAULT 0,
  average_rating numeric(3,2) NOT NULL DEFAULT 0,
  dist           jsonb NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, reference_id)
);

ALTER TABLE public.review_stats ENABLE ROW LEVEL SECURITY;
-- Sem GRANT de escrita — só o trigger (SECURITY DEFINER) mantém.
GRANT SELECT ON TABLE public.review_stats TO anon, auth_user;
DROP POLICY IF EXISTS review_stats_select_all ON public.review_stats;
CREATE POLICY review_stats_select_all ON public.review_stats FOR SELECT TO anon, auth_user
USING (true);

-- =============================================================================================
-- 7) Funções auxiliares
-- =============================================================================================

-- Recalcula review_stats para uma chave (domain, reference_id). Recompute completo por chave —
-- barato dado o índice reviews_lookup; a mitigação incremental está documentada na spec (§20).
-- SECURITY DEFINER: chamado pelo trigger no contexto de um auth_user que não tem grant em
-- review_stats.
CREATE OR REPLACE FUNCTION public.fn_review_stats_recompute(p_domain text, p_reference_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.review_stats AS s (domain, reference_id, tenant_id, total_reviews, average_rating, dist, updated_at)
  SELECT
    p_domain,
    p_reference_id,
    (SELECT r0.tenant_id FROM public.reviews r0
      WHERE r0.domain = p_domain AND r0.reference_id = p_reference_id
      ORDER BY r0.created_at LIMIT 1),
    COALESCE(count(*) FILTER (WHERE r.status = 'published' AND r.active), 0),
    COALESCE(round(avg(r.rating) FILTER (WHERE r.status = 'published' AND r.active), 2), 0),
    jsonb_build_object(
      '1', count(*) FILTER (WHERE r.status = 'published' AND r.active AND r.rating = 1),
      '2', count(*) FILTER (WHERE r.status = 'published' AND r.active AND r.rating = 2),
      '3', count(*) FILTER (WHERE r.status = 'published' AND r.active AND r.rating = 3),
      '4', count(*) FILTER (WHERE r.status = 'published' AND r.active AND r.rating = 4),
      '5', count(*) FILTER (WHERE r.status = 'published' AND r.active AND r.rating = 5)
    ),
    now()
  FROM public.reviews r
  WHERE r.domain = p_domain AND r.reference_id = p_reference_id
  ON CONFLICT (domain, reference_id) DO UPDATE SET
    tenant_id      = COALESCE(EXCLUDED.tenant_id, s.tenant_id),
    total_reviews  = EXCLUDED.total_reviews,
    average_rating = EXCLUDED.average_rating,
    dist           = EXCLUDED.dist,
    updated_at     = now();
END;
$function$;

-- touch updated_at
CREATE OR REPLACE FUNCTION public.fn_reviews_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- trigger de stats
CREATE OR REPLACE FUNCTION public.fn_reviews_stats_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_review_stats_recompute(OLD.domain, OLD.reference_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_review_stats_recompute(NEW.domain, NEW.reference_id);
  IF TG_OP = 'UPDATE' AND (OLD.domain, OLD.reference_id) IS DISTINCT FROM (NEW.domain, NEW.reference_id) THEN
    PERFORM public.fn_review_stats_recompute(OLD.domain, OLD.reference_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reviews_touch_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_touch_updated_at BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.fn_reviews_touch_updated_at();

DROP TRIGGER IF EXISTS trg_review_tags_touch_updated_at ON public.review_tags;
CREATE TRIGGER trg_review_tags_touch_updated_at BEFORE UPDATE ON public.review_tags
FOR EACH ROW EXECUTE FUNCTION public.fn_reviews_touch_updated_at();

DROP TRIGGER IF EXISTS trg_review_moderation_requests_touch_updated_at ON public.review_moderation_requests;
CREATE TRIGGER trg_review_moderation_requests_touch_updated_at BEFORE UPDATE ON public.review_moderation_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_reviews_touch_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_stats ON public.reviews;
CREATE TRIGGER trg_reviews_stats AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.fn_reviews_stats_trigger();

-- =============================================================================================
-- 8) RPCs
-- =============================================================================================

-- 8.1 fn_review_create — SECURITY INVOKER (RLS escopa; a tabela services é lida sob a policy do
--     próprio caller, que já pode ver serviços ativos). Cross-tenant: seta reviews.tenant_id com
--     o tenant do serviço.
CREATE OR REPLACE FUNCTION public.fn_review_create(
  p_domain       text,
  p_reference_id text,
  p_rating       smallint,
  p_comment      text DEFAULT NULL,
  p_tag_ids      bigint[] DEFAULT '{}'
)
 RETURNS public.reviews
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_uid     uuid := auth.fun_auth_user_id();
  v_tenant  uuid;
  v_owner   uuid;
  v_status  text;
  v_author  text;
  v_review  public.reviews%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_domain <> 'service' THEN
    RAISE EXCEPTION 'Domínio de avaliação não suportado: %', p_domain USING ERRCODE = 'check_violation';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'A nota precisa estar entre 1 e 5.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.tenant_id, s.created_by
    INTO v_tenant, v_owner
    FROM public.services s
   WHERE s.id = p_reference_id::bigint
     AND s.active = true
     AND s.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou indisponível.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'Você não pode avaliar o próprio serviço.' USING ERRCODE = 'check_violation';
  END IF;

  v_status := public.fn_review_default_status();

  SELECT COALESCE(NULLIF(btrim(ud.display_name), ''), NULLIF(btrim(ud.full_name), ''))
    INTO v_author
    FROM public.user_data ud
   WHERE ud.uid = v_uid AND ud.active = true
   ORDER BY ud.created_at
   LIMIT 1;

  BEGIN
    INSERT INTO public.reviews (domain, reference_id, id_customer, tenant_id, rating, comment, author_name, status)
    VALUES (p_domain, p_reference_id, v_uid, v_tenant, p_rating, NULLIF(btrim(p_comment), ''), v_author, v_status)
    RETURNING * INTO v_review;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Você já avaliou este serviço.' USING ERRCODE = 'unique_violation';
  END;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) IS NOT NULL THEN
    INSERT INTO public.review_tag_links (review_id, tag_id, tag_slug_snapshot, tag_label_snapshot)
    SELECT v_review.id, t.id, t.slug, t.label
      FROM public.review_tags t
     WHERE t.id = ANY (p_tag_ids)
       AND t.active
       AND t.selectable
       AND (t.domain IS NULL OR t.domain = p_domain)
    ON CONFLICT (review_id, tag_slug_snapshot) DO NOTHING;
  END IF;

  RETURN v_review;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_review_create(text, text, smallint, text, bigint[]) TO auth_user;

-- 8.2 fn_review_moderation_request — SECURITY INVOKER. Valida que o caller é dono do serviço
--     avaliado (não confia em nada do front). 403 se não for.
CREATE OR REPLACE FUNCTION public.fn_review_moderation_request(
  p_review_id bigint,
  p_reason    text
)
 RETURNS public.review_moderation_requests
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_uid     uuid := auth.fun_auth_user_id();
  v_review  public.reviews%ROWTYPE;
  v_is_owner boolean := false;
  v_request public.review_moderation_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Descreva o motivo da solicitação.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_review FROM public.reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_review.domain = 'service' THEN
    SELECT true INTO v_is_owner
      FROM public.services s
     WHERE s.id = v_review.reference_id::bigint
       AND s.created_by = v_uid;
  END IF;

  IF NOT COALESCE(v_is_owner, false) THEN
    RAISE EXCEPTION 'Apenas o dono do anúncio pode solicitar revisão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    INSERT INTO public.review_moderation_requests (review_id, tenant_id, requester_user_id, reason, status)
    VALUES (p_review_id, v_review.tenant_id, v_uid, btrim(p_reason), 'pending')
    RETURNING * INTO v_request;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma solicitação em análise para esta avaliação.' USING ERRCODE = 'unique_violation';
  END;

  RETURN v_request;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_review_moderation_request(bigint, text) TO auth_user;

-- 8.3 fn_review_moderate — SECURITY DEFINER (escreve review_moderation_events, sem grant a
--     auth_user). Autorização real: exige reviews.moderate (is_root passa por dentro).
CREATE OR REPLACE FUNCTION public.fn_review_moderate(
  p_review_id   bigint,
  p_to_status   text,
  p_note        text DEFAULT NULL,
  p_soft_delete boolean DEFAULT NULL,
  p_request_id  bigint DEFAULT NULL
)
 RETURNS public.reviews
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.fun_auth_user_id();
  v_review   public.reviews%ROWTYPE;
  v_from     text;
  v_action   text;
  v_new_active boolean;
BEGIN
  IF NOT auth.fun_auth_has_perm('reviews', 'moderate') THEN
    RAISE EXCEPTION 'Sem permissão para moderar avaliações.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_to_status NOT IN ('pending','published','hidden','rejected') THEN
    RAISE EXCEPTION 'Status inválido: %', p_to_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_review FROM public.reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  v_from := v_review.status;
  v_new_active := CASE
    WHEN p_soft_delete IS TRUE THEN false
    WHEN p_soft_delete IS FALSE THEN true
    ELSE v_review.active
  END;

  UPDATE public.reviews
     SET status = p_to_status,
         active = v_new_active
   WHERE id = p_review_id
  RETURNING * INTO v_review;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.review_moderation_requests
       SET status = CASE WHEN p_to_status IN ('hidden','rejected') OR p_soft_delete IS TRUE
                         THEN 'approved' ELSE 'rejected' END,
           moderator_id = v_uid,
           moderator_comment = p_note,
           resolved_at = now()
     WHERE id = p_request_id AND status = 'pending';
  END IF;

  v_action := CASE
    WHEN p_soft_delete IS TRUE THEN 'removed'
    WHEN p_to_status = 'published' THEN 'published'
    WHEN p_to_status = 'hidden' THEN 'hidden'
    WHEN p_to_status = 'rejected' THEN 'rejected'
    WHEN p_to_status = 'pending' THEN 'reopened'
    ELSE 'updated'
  END;
  IF p_request_id IS NOT NULL AND p_to_status = v_from AND p_soft_delete IS NOT TRUE THEN
    v_action := 'request_reviewed';
  END IF;

  INSERT INTO public.review_moderation_events
    (review_id, actor_user_id, action, from_status, to_status, note, request_id)
  VALUES (p_review_id, v_uid, v_action, v_from, p_to_status, p_note, p_request_id);

  RETURN v_review;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_review_moderate(bigint, text, text, boolean, bigint) TO auth_user;

-- =============================================================================================
-- 9) RBAC + registro do plugin (ver kizuna-core/plugins/README.md)
-- =============================================================================================
-- `view` existe só para o gate de nav/UI do projeto consumidor (client `hasPerm('reviews')`
-- default action) — os writes reais gateiam em `moderate` / `manage_tags`. Mesmo par que o
-- plugin `taxonomy` registra (`categorias.view` + `categorias.manage`).
INSERT INTO auth.permissions (resource, action, name) VALUES
  ('reviews', 'view',        'Ver o painel de avaliações'),
  ('reviews', 'moderate',    'Moderar avaliações'),
  ('reviews', 'manage_tags', 'Gerenciar tags de avaliação')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('reviews', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: messaging  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/messaging/0001_messaging.sql
-- ===============================================================================================

-- plugins/messaging/0001_messaging.sql
-- Optional. Infra de conversação multicanal. Depende do core (auth.users, auth.tenants,
-- auth.fun_auth_user_id(), auth.fun_auth_current_tenant_id(), auth.fun_auth_has_perm()) E do
-- plugin `user_data` (fn_msg_list_conversations faz LEFT JOIN em public.user_data) — instalar
-- sempre como `--plugins user_data,messaging`.
-- Acesso é SEMPRE por participação (conversation_participant.user_id), nunca por tenant nem por
-- telefone — ver docs/superpowers/specs/2026-09-06-plugin-messaging-multicanal-design.md.
-- Só o canal PLATFORM é exercitado hoje; as colunas/enums de whatsapp/instagram/etc. já existem
-- mas ficam sem uso até o worker de ingestão externa existir.

-- ============================================================================================
-- 1) conversation
-- ============================================================================================
CREATE TABLE IF NOT EXISTS public.conversation (
    id                    bigserial PRIMARY KEY,
    uid                   uuid NOT NULL DEFAULT gen_random_uuid(),
    status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','archived')),
    context_type          text,
    context_id            text,
    subject               text,
    created_by            uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
    tenant_id             uuid DEFAULT auth.fun_auth_current_tenant_id() REFERENCES auth.tenants(uid) ON DELETE RESTRICT,
    last_message_at       timestamptz,
    last_message_preview  text,
    last_message_source   text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conversation_uid_unique UNIQUE (uid)
);

-- ============================================================================================
-- 2) conversation_participant
-- ============================================================================================
CREATE TABLE IF NOT EXISTS public.conversation_participant (
    id                     bigserial PRIMARY KEY,
    conversation_id        bigint NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    user_id                uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
    role                   text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    last_read_message_id   bigint NOT NULL DEFAULT 0,
    last_read_at           timestamptz,
    muted                  boolean NOT NULL DEFAULT false,
    active                 boolean NOT NULL DEFAULT true,
    joined_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conversation_participant_unique UNIQUE (conversation_id, user_id)
);

-- ============================================================================================
-- 3) message  — id é o cursor de paginação e delta-sync
-- ============================================================================================
CREATE TABLE IF NOT EXISTS public.message (
    id               bigserial PRIMARY KEY,
    uid              uuid NOT NULL DEFAULT gen_random_uuid(),
    conversation_id  bigint NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    sender_id        uuid REFERENCES auth.users(uid) ON DELETE SET NULL,
    source           text NOT NULL DEFAULT 'platform'
                     CHECK (source IN ('platform','whatsapp','instagram','telegram','email','system')),
    direction        text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
    message_type     text NOT NULL DEFAULT 'text'
                     CHECK (message_type IN ('text','image','video','audio','document','system')),
    content          text,
    metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    status           text NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('pending','sent','delivered','read','failed')),
    external_id      text,
    external_source  text,
    error_reason     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT message_uid_unique UNIQUE (uid)
);

-- ============================================================================================
-- 4) message_external_identity
-- ============================================================================================
CREATE TABLE IF NOT EXISTS public.message_external_identity (
    id                   bigserial PRIMARY KEY,
    user_id              uuid REFERENCES auth.users(uid) ON DELETE SET NULL,
    channel              text NOT NULL CHECK (channel IN ('whatsapp','instagram','telegram','email')),
    external_contact_id  text NOT NULL,
    display_name         text,
    verified             boolean NOT NULL DEFAULT false,
    active               boolean NOT NULL DEFAULT true,
    metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================================
-- Índices
-- ============================================================================================
CREATE INDEX IF NOT EXISTS idx_message_conv_id_desc   ON public.message (conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_message_conv_created    ON public.message (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_external  ON public.message (external_source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_sender          ON public.message (sender_id);
CREATE INDEX IF NOT EXISTS idx_message_pending         ON public.message (status) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_participant_user_active ON public.conversation_participant (user_id, active);
CREATE INDEX IF NOT EXISTS idx_conversation_last_msg   ON public.conversation (last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ident_active      ON public.message_external_identity (channel, external_contact_id) WHERE active;

-- ============================================================================================
-- Triggers
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.fun_msg_touch_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.conversation
       SET last_message_at      = NEW.created_at,
           last_message_preview = left(coalesce(NEW.content, ''), 160),
           last_message_source  = NEW.source,
           updated_at           = now()
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_touch_conversation ON public.message;
CREATE TRIGGER trg_message_touch_conversation
    AFTER INSERT ON public.message
    FOR EACH ROW EXECUTE FUNCTION public.fun_msg_touch_conversation();

CREATE OR REPLACE FUNCTION public.fun_msg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversation_updated_at ON public.conversation;
CREATE TRIGGER trg_conversation_updated_at BEFORE UPDATE ON public.conversation
    FOR EACH ROW EXECUTE FUNCTION public.fun_msg_set_updated_at();
DROP TRIGGER IF EXISTS trg_message_updated_at ON public.message;
CREATE TRIGGER trg_message_updated_at BEFORE UPDATE ON public.message
    FOR EACH ROW EXECUTE FUNCTION public.fun_msg_set_updated_at();

CREATE OR REPLACE FUNCTION public.fun_msg_notify_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('messaging_events', json_build_object(
        'type', CASE WHEN TG_OP = 'INSERT' THEN 'message_created' ELSE 'message_status' END,
        'message_id', NEW.id,
        'conversation_id', NEW.conversation_id,
        'source', NEW.source,
        'direction', NEW.direction,
        'status', NEW.status
    )::text);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_notify ON public.message;
CREATE TRIGGER trg_message_notify
    AFTER INSERT OR UPDATE OF status ON public.message
    FOR EACH ROW EXECUTE FUNCTION public.fun_msg_notify_event();

-- ============================================================================================
-- RLS
-- ============================================================================================
CREATE OR REPLACE FUNCTION auth.fun_msg_is_participant(p_conversation_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_participant
        WHERE conversation_id = p_conversation_id
          AND user_id = auth.fun_auth_user_id()
          AND active
    );
$$;

ALTER TABLE public.conversation                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participant    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_external_identity   ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.conversation             TO auth_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversation_participant TO auth_user;
GRANT SELECT, INSERT          ON TABLE public.message                 TO auth_user;
GRANT SELECT                  ON TABLE public.message_external_identity TO auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.conversation_id_seq, public.conversation_participant_id_seq,
    public.message_id_seq TO auth_user;

DROP POLICY IF EXISTS conversation_select ON public.conversation;
CREATE POLICY conversation_select ON public.conversation FOR SELECT TO auth_user
    USING (auth.fun_msg_is_participant(id) OR auth.fun_auth_has_perm('messaging','manage'));
DROP POLICY IF EXISTS conversation_insert ON public.conversation;
CREATE POLICY conversation_insert ON public.conversation FOR INSERT TO auth_user
    WITH CHECK (created_by = auth.fun_auth_user_id());
DROP POLICY IF EXISTS conversation_update ON public.conversation;
CREATE POLICY conversation_update ON public.conversation FOR UPDATE TO auth_user
    USING (auth.fun_msg_is_participant(id)) WITH CHECK (auth.fun_msg_is_participant(id));

DROP POLICY IF EXISTS participant_select ON public.conversation_participant;
CREATE POLICY participant_select ON public.conversation_participant FOR SELECT TO auth_user
    USING (auth.fun_msg_is_participant(conversation_id) OR auth.fun_auth_has_perm('messaging','manage'));
DROP POLICY IF EXISTS participant_insert ON public.conversation_participant;
CREATE POLICY participant_insert ON public.conversation_participant FOR INSERT TO auth_user
    WITH CHECK (
        user_id = auth.fun_auth_user_id()
        OR EXISTS (SELECT 1 FROM public.conversation c
                   WHERE c.id = conversation_id AND c.created_by = auth.fun_auth_user_id())
    );
DROP POLICY IF EXISTS participant_update ON public.conversation_participant;
CREATE POLICY participant_update ON public.conversation_participant FOR UPDATE TO auth_user
    USING (user_id = auth.fun_auth_user_id()) WITH CHECK (user_id = auth.fun_auth_user_id());

DROP POLICY IF EXISTS message_select ON public.message;
CREATE POLICY message_select ON public.message FOR SELECT TO auth_user
    USING (auth.fun_msg_is_participant(conversation_id) OR auth.fun_auth_has_perm('messaging','manage'));
DROP POLICY IF EXISTS message_insert ON public.message;
CREATE POLICY message_insert ON public.message FOR INSERT TO auth_user
    WITH CHECK (
        auth.fun_msg_is_participant(conversation_id)
        AND sender_id = auth.fun_auth_user_id()
        AND direction = 'outbound'
        AND source = 'platform'
    );

DROP POLICY IF EXISTS identity_select ON public.message_external_identity;
CREATE POLICY identity_select ON public.message_external_identity FOR SELECT TO auth_user
    USING (user_id = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('messaging','manage'));

-- ============================================================================================
-- RPCs
-- ============================================================================================

-- Cria (ou reaproveita) uma conversa 1:1 e insere a primeira mensagem. SECURITY DEFINER: precisa
-- inserir a linha de participante do OUTRO usuário.
CREATE OR REPLACE FUNCTION public.fn_msg_start_conversation(
    p_target_user   uuid,
    p_context_type  text DEFAULT NULL,
    p_context_id    text DEFAULT NULL,
    p_first_message text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_me   uuid := auth.fun_auth_user_id();
    v_conv public.conversation%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
    IF p_target_user IS NULL OR p_target_user = v_me THEN
        RAISE EXCEPTION 'destinatário inválido';
    END IF;

    SELECT c.* INTO v_conv
      FROM public.conversation c
      JOIN public.conversation_participant p1 ON p1.conversation_id = c.id AND p1.user_id = v_me
      JOIN public.conversation_participant p2 ON p2.conversation_id = c.id AND p2.user_id = p_target_user
     WHERE c.status = 'open'
       AND c.context_type IS NOT DISTINCT FROM p_context_type
       AND c.context_id   IS NOT DISTINCT FROM p_context_id
     ORDER BY c.id DESC
     LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.conversation (context_type, context_id, created_by, tenant_id)
        VALUES (p_context_type, p_context_id, v_me, auth.fun_auth_current_tenant_id())
        RETURNING * INTO v_conv;
        INSERT INTO public.conversation_participant (conversation_id, user_id, role)
        VALUES (v_conv.id, v_me, 'owner'), (v_conv.id, p_target_user, 'member');
    END IF;

    IF p_first_message IS NOT NULL AND length(trim(p_first_message)) > 0 THEN
        INSERT INTO public.message (conversation_id, sender_id, source, direction, content, status)
        VALUES (v_conv.id, v_me, 'platform', 'outbound', p_first_message, 'sent');
    END IF;

    RETURN v_conv.uid;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_msg_start_conversation(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_msg_start_conversation(uuid, text, text, text) TO auth_user;

-- Envia uma mensagem de plataforma. SECURITY DEFINER pra capturar sender do JWT e dedupar por
-- client_token (optimistic retry não duplica).
CREATE OR REPLACE FUNCTION public.fn_msg_send_message(
    p_conversation_id bigint,
    p_content         text,
    p_client_token    text DEFAULT NULL
) RETURNS public.message LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_me  uuid := auth.fun_auth_user_id();
    v_row public.message%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_participant
                   WHERE conversation_id = p_conversation_id AND user_id = v_me AND active) THEN
        RAISE EXCEPTION 'não é participante da conversa';
    END IF;
    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RAISE EXCEPTION 'mensagem vazia';
    END IF;

    IF p_client_token IS NOT NULL THEN
        SELECT * INTO v_row FROM public.message
         WHERE conversation_id = p_conversation_id
           AND sender_id = v_me
           AND metadata->>'client_token' = p_client_token
           AND created_at > now() - interval '5 minutes'
         LIMIT 1;
        IF FOUND THEN RETURN v_row; END IF;
    END IF;

    INSERT INTO public.message (conversation_id, sender_id, source, direction, content, status, metadata)
    VALUES (p_conversation_id, v_me, 'platform', 'outbound', p_content, 'sent',
            CASE WHEN p_client_token IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('client_token', p_client_token) END)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_msg_send_message(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_msg_send_message(bigint, text, text) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_msg_mark_read(
    p_conversation_id bigint,
    p_up_to_message_id bigint
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE public.conversation_participant
       SET last_read_message_id = greatest(last_read_message_id, coalesce(p_up_to_message_id, 0)),
           last_read_at = now()
     WHERE conversation_id = p_conversation_id
       AND user_id = auth.fun_auth_user_id();
$$;
REVOKE ALL ON FUNCTION public.fn_msg_mark_read(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_msg_mark_read(bigint, bigint) TO auth_user;

-- Lista de conversas do caller + last_message + unread_count + outro participante.
CREATE OR REPLACE FUNCTION public.fn_msg_list_conversations(
    p_limit  int DEFAULT 30,
    p_before timestamptz DEFAULT NULL
) RETURNS TABLE (
    id bigint, uid uuid, status text, context_type text, context_id text,
    last_message_at timestamptz, last_message_preview text, last_message_source text,
    unread_count bigint,
    other_uid uuid, other_name text, other_avatar text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
    WITH me AS (SELECT auth.fun_auth_user_id() AS uid)
    SELECT c.id, c.uid, c.status, c.context_type, c.context_id,
           c.last_message_at, c.last_message_preview, c.last_message_source,
           (SELECT count(*) FROM public.message m
             WHERE m.conversation_id = c.id
               AND m.id > mp.last_read_message_id
               AND (m.sender_id IS DISTINCT FROM (SELECT uid FROM me))) AS unread_count,
           op.user_id AS other_uid,
           coalesce(ud.full_name, '') AS other_name,
           ud.avatar_url AS other_avatar
      FROM public.conversation c
      JOIN public.conversation_participant mp
        ON mp.conversation_id = c.id AND mp.user_id = (SELECT uid FROM me) AND mp.active
      LEFT JOIN public.conversation_participant op
        ON op.conversation_id = c.id AND op.user_id <> (SELECT uid FROM me)
      LEFT JOIN public.user_data ud ON ud.uid = op.user_id
     WHERE (p_before IS NULL OR c.last_message_at < p_before)
     ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
     LIMIT least(coalesce(p_limit, 30), 100);
$$;
REVOKE ALL ON FUNCTION public.fn_msg_list_conversations(int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_msg_list_conversations(int, timestamptz) TO auth_user;

-- ============================================================================================
-- Registro do plugin + catálogo de permissão
-- ============================================================================================
INSERT INTO auth.permissions (resource, action, name)
VALUES ('messaging', 'manage', 'Ver e moderar todas as conversas de mensageria')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('messaging', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: ai_assistant  (1 arquivo)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/ai_assistant/0001_ai_assistant.sql
-- ===============================================================================================

-- plugins/ai_assistant/0001_ai_assistant.sql
-- Plugin: ai_assistant — mecanismo genérico de assistente de IA da plataforma (provider
-- plugável, skills declaradas no projeto consumidor, degradação graciosa quando a IA está
-- indisponível). SEM tabela de dados na v1 — toda a configuração vive em `auth.system_config`
-- (chaves `ai_assistant.provider` / `.model` / `.contexts`). A chave de API do provider fica
-- em variável de ambiente, nunca no banco.
--
-- Depende do plugin `system_config` (tabela `auth.system_config`). Também usa `auth.permissions`
-- e `auth.plugin_registry`, que já existem no core.
--
-- Idempotente, from-zero-safe — mesma convenção de kizuna-core/plugins/*/0001_*.sql (ver
-- kizuna-core/plugins/README.md): INSERT ... ON CONFLICT DO NOTHING para permissão e seeds,
-- self-register em `auth.plugin_registry` via ON CONFLICT DO UPDATE, NOTIFY pgrst no fim.
-- Registra a permissão `ai_assistant`/`manage` catálogo-only (sem grant automático — root passa
-- por auth.fun_auth_has_perm).
--
-- Este plugin NÃO faz CREATE TABLE nem ALTER em nenhuma tabela — é seguro listar em
-- kizuna.plugins.json incondicionalmente (como `forms`).
--
-- Design completo: foco-total/docs/superpowers/specs/2026-09-09-plugin-ai-assistant-design.md §2.1

INSERT INTO auth.permissions (resource, action, name) VALUES
  ('ai_assistant', 'manage', 'Configurar o assistente de IA')
ON CONFLICT (resource, action) DO NOTHING;

-- Seed das chaves de config (só provider/model/contexts — a chave de API fica em env var).
-- `contexts` nasce `{}` — o projeto consumidor liga os contextos na tela admin; contexto
-- ausente é tratado como ligado (default-on), então o marketplace funciona sem config manual.
INSERT INTO auth.system_config (key, value) VALUES
  ('ai_assistant.provider', '"gemini"'::jsonb),
  ('ai_assistant.model',    '"gemini-3.6-flash"'::jsonb),
  ('ai_assistant.contexts', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('ai_assistant', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: demandas  (4 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/demandas/0001_demandas.sql
-- ===============================================================================================

-- plugins/demandas/0001_demandas.sql
-- Plugin: demandas — "pedido aberto" independente de prestador. Cliente publica uma demanda
-- (moderada antes de ficar visível), prestadores cuja categoria bate respondem com propostas
-- (cada uma ancorada em >=1 service_id do próprio prestador). Depende de `services`/`taxonomy`/
-- `forms` — por isso NÃO entra em kizuna.plugins.json, aplicado manualmente pelo db/install.sh
-- entre services (2.6) e pedidos (2.7, que ganha a FK pedido.demanda_id). MVP: fn_demanda_fechar
-- fica pra depois. Design: foco-total/docs/superpowers/specs/2026-09-15-demanda-e-propostas-design.md

CREATE TABLE IF NOT EXISTS public.demanda (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid         uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  category_id bigint NOT NULL REFERENCES public.categories(id),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','aberta','rejeitada','fechada')),
  tenant_id   uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by  uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demanda_uid_unique UNIQUE (uid)
);
CREATE INDEX IF NOT EXISTS demanda_cliente ON public.demanda (cliente_id);
CREATE INDEX IF NOT EXISTS demanda_category_status ON public.demanda (category_id) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS public.demanda_moderacao (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid               uuid NOT NULL DEFAULT gen_random_uuid(),
  demanda_id        bigint NOT NULL REFERENCES public.demanda(id) ON DELETE CASCADE,
  decision          text NOT NULL CHECK (decision IN ('approved','rejected','escalated')),
  decision_note     text,
  rejection_reason  text,
  decided_at        timestamptz NOT NULL DEFAULT now(),
  tenant_id         uuid NOT NULL DEFAULT auth.fun_auth_current_tenant_id(),
  created_by        uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demanda_moderacao_uid_unique UNIQUE (uid)
);
CREATE INDEX IF NOT EXISTS demanda_moderacao_demanda ON public.demanda_moderacao (demanda_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.demanda_proposta (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid           uuid NOT NULL DEFAULT gen_random_uuid(),
  demanda_id    bigint NOT NULL REFERENCES public.demanda(id) ON DELETE CASCADE,
  prestador_id  uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  mensagem      text,
  status        text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','aceita','recusada')),
  tenant_id     uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by    uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demanda_proposta_uid_unique UNIQUE (uid),
  CONSTRAINT demanda_proposta_unique UNIQUE (demanda_id, prestador_id)
);
CREATE INDEX IF NOT EXISTS demanda_proposta_demanda ON public.demanda_proposta (demanda_id);
CREATE INDEX IF NOT EXISTS demanda_proposta_prestador ON public.demanda_proposta (prestador_id);

CREATE TABLE IF NOT EXISTS public.demanda_proposta_servico (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid         uuid NOT NULL DEFAULT gen_random_uuid(),
  proposta_id bigint NOT NULL REFERENCES public.demanda_proposta(id) ON DELETE CASCADE,
  service_id  bigint NOT NULL REFERENCES public.services(id),
  tenant_id   uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by  uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demanda_proposta_servico_uid_unique UNIQUE (uid),
  CONSTRAINT demanda_proposta_servico_unique UNIQUE (proposta_id, service_id)
);
CREATE INDEX IF NOT EXISTS demanda_proposta_servico_proposta ON public.demanda_proposta_servico (proposta_id);

-- =========================================================================
-- Helpers SECURITY DEFINER pra quebrar a recursão de RLS entre demanda <-> demanda_proposta
-- (cada policy consultando a tabela da outra, direto, causaria "infinite recursion detected" —
-- mesmo padrão de auth.fun_pedido_is_participant no plugin pedidos: rodando como o dono das
-- tabelas, a consulta interna não reavalia RLS, então não há ciclo).
-- =========================================================================
CREATE OR REPLACE FUNCTION auth.fun_demanda_is_cliente(p_demanda_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.demanda d
        WHERE d.id = p_demanda_id AND d.cliente_id = auth.fun_auth_user_id()
    );
$$;

CREATE OR REPLACE FUNCTION auth.fun_demanda_prestador_respondeu(p_demanda_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.demanda_proposta dp
        WHERE dp.demanda_id = p_demanda_id AND dp.prestador_id = auth.fun_auth_user_id()
    );
$$;

-- =========================================================================
-- RLS
-- =========================================================================
ALTER TABLE public.demanda ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.demanda TO auth_user;
REVOKE UPDATE, DELETE ON TABLE public.demanda FROM auth_user;

DROP POLICY IF EXISTS demanda_select ON public.demanda;
CREATE POLICY demanda_select ON public.demanda FOR SELECT TO auth_user
  USING (
    cliente_id = auth.fun_auth_user_id()
    OR (
      status = 'aberta'
      AND category_id IN (
        SELECT s.category_id FROM public.services s
         WHERE s.created_by = auth.fun_auth_user_id() AND s.active AND s.status = 'active'
      )
    )
    OR auth.fun_demanda_prestador_respondeu(demanda.id)
    OR auth.fun_auth_has_perm('demandas','moderate')
  );

DROP POLICY IF EXISTS demanda_insert ON public.demanda;
CREATE POLICY demanda_insert ON public.demanda FOR INSERT TO auth_user
  WITH CHECK (cliente_id = auth.fun_auth_user_id());

ALTER TABLE public.demanda_moderacao ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.demanda_moderacao TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.demanda_moderacao FROM auth_user;

DROP POLICY IF EXISTS demanda_moderacao_select ON public.demanda_moderacao;
CREATE POLICY demanda_moderacao_select ON public.demanda_moderacao FOR SELECT TO auth_user
  USING (
    auth.fun_auth_has_perm('demandas','moderate')
    OR auth.fun_demanda_is_cliente(demanda_id)
  );

ALTER TABLE public.demanda_proposta ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.demanda_proposta TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.demanda_proposta FROM auth_user;

DROP POLICY IF EXISTS demanda_proposta_select ON public.demanda_proposta;
CREATE POLICY demanda_proposta_select ON public.demanda_proposta FOR SELECT TO auth_user
  USING (
    prestador_id = auth.fun_auth_user_id()
    OR auth.fun_demanda_is_cliente(demanda_id)
  );

ALTER TABLE public.demanda_proposta_servico ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.demanda_proposta_servico TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.demanda_proposta_servico FROM auth_user;

DROP POLICY IF EXISTS demanda_proposta_servico_select ON public.demanda_proposta_servico;
CREATE POLICY demanda_proposta_servico_select ON public.demanda_proposta_servico FOR SELECT TO auth_user
  USING (
    EXISTS (
      SELECT 1 FROM public.demanda_proposta dp
       WHERE dp.id = proposta_id
         AND (dp.prestador_id = auth.fun_auth_user_id() OR auth.fun_demanda_is_cliente(dp.demanda_id))
    )
  );

-- =========================================================================
-- RPCs
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_demanda_create(
  p_category_id  bigint,
  p_form_answers jsonb DEFAULT '{}'::jsonb
) RETURNS public.demanda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $function$
DECLARE
  v_demanda  public.demanda;
  v_form_key text;
BEGIN
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'categoria obrigatória' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND active) THEN
    RAISE EXCEPTION 'categoria inválida' USING errcode = '22023';
  END IF;

  INSERT INTO public.demanda (category_id) VALUES (p_category_id)
  RETURNING * INTO v_demanda;

  IF p_form_answers IS NOT NULL AND p_form_answers <> '{}'::jsonb THEN
    SELECT c.request_form_key INTO v_form_key FROM public.categories c WHERE c.id = p_category_id;
    IF v_form_key IS NOT NULL THEN
      PERFORM public.fn_form_result_upsert(v_form_key, 'demanda', v_demanda.uid::text, p_form_answers);
    END IF;
  END IF;

  RETURN v_demanda;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_create(bigint, jsonb) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_demanda_moderate(
  p_demanda_id       bigint,
  p_decision         text,
  p_note             text DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL
) RETURNS public.demanda_moderacao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_row    public.demanda_moderacao;
  v_status text;
BEGIN
  IF NOT auth.fun_auth_has_perm('demandas','moderate') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected','escalated') THEN
    RAISE EXCEPTION 'decisão inválida: %', p_decision USING errcode = '22023';
  END IF;

  v_status := CASE p_decision
    WHEN 'approved' THEN 'aberta'
    WHEN 'rejected' THEN 'rejeitada'
    ELSE 'pending'
  END;

  INSERT INTO public.demanda_moderacao (demanda_id, decision, decision_note, rejection_reason)
  VALUES (
    p_demanda_id, p_decision, NULLIF(btrim(coalesce(p_note,'')),''),
    CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  )
  RETURNING * INTO v_row;

  UPDATE public.demanda SET status = v_status, updated_at = now() WHERE id = p_demanda_id;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_moderate(bigint, text, text, text) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_demanda_propor(
  p_demanda_id  bigint,
  p_service_ids bigint[],
  p_mensagem    text DEFAULT NULL
) RETURNS public.demanda_proposta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_me       uuid := auth.fun_auth_user_id();
  v_status   text;
  v_proposta public.demanda_proposta;
  v_bad_ct   integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING errcode = '42501';
  END IF;
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'proposta precisa de pelo menos 1 anúncio' USING errcode = '22023';
  END IF;

  SELECT status INTO v_status FROM public.demanda WHERE id = p_demanda_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'demanda não encontrada' USING errcode = '22023';
  END IF;
  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'demanda não está aberta' USING errcode = '22023';
  END IF;

  SELECT count(*) INTO v_bad_ct
    FROM unnest(p_service_ids) sid
    LEFT JOIN public.services s ON s.id = sid AND s.created_by = v_me
   WHERE s.id IS NULL;
  IF v_bad_ct > 0 THEN
    RAISE EXCEPTION 'todo service_id precisa pertencer a você' USING errcode = '22023';
  END IF;

  INSERT INTO public.demanda_proposta (demanda_id, mensagem)
  VALUES (p_demanda_id, NULLIF(btrim(coalesce(p_mensagem,'')),''))
  ON CONFLICT (demanda_id, prestador_id) DO UPDATE
    SET mensagem = EXCLUDED.mensagem, updated_at = now()
  RETURNING * INTO v_proposta;

  DELETE FROM public.demanda_proposta_servico
   WHERE proposta_id = v_proposta.id AND service_id <> ALL(p_service_ids);

  INSERT INTO public.demanda_proposta_servico (proposta_id, service_id)
  SELECT v_proposta.id, sid FROM unnest(p_service_ids) sid
  ON CONFLICT (proposta_id, service_id) DO NOTHING;

  PERFORM auth.fun_notify(
    (SELECT cliente_id FROM public.demanda WHERE id = p_demanda_id),
    'demanda_proposta_recebida', 'Nova proposta na sua demanda',
    NULL, 'demanda', (SELECT uid FROM public.demanda WHERE id = p_demanda_id)::text
  );

  RETURN v_proposta;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_propor(bigint, bigint[], text) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_demanda_fechar(p_demanda_id bigint) RETURNS public.demanda
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_demanda public.demanda;
BEGIN
  UPDATE public.demanda SET status = 'fechada', updated_at = now()
   WHERE id = p_demanda_id AND cliente_id = auth.fun_auth_user_id()
   RETURNING * INTO v_demanda;
  IF v_demanda IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN v_demanda;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_fechar(bigint) TO auth_user;

INSERT INTO auth.permissions (resource, action, name) VALUES
  ('demandas', 'moderate', 'Moderar demandas de clientes')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('demandas', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/demandas/0002_demandas_attachments.sql
-- ===============================================================================================

-- plugins/demandas/0002_demandas_attachments.sql
-- Anexos (imagem/PDF) na demanda: cliente pode anexar arquivos ao pedir um serviço. Segue o
-- mesmo padrão de `services.extras.images` — só um array de `public.files.id` guardado direto na
-- linha, sem tabela de junção (files.purpose = 'demanda_attachment', ver
-- 0003_storage_demanda_attachment_purpose.sql no plugin storage). Os arquivos são enviados pro
-- storage genérico ANTES da demanda existir (o cliente anexa enquanto preenche o formulário) —
-- `fn_demanda_create` ganha um terceiro parâmetro opcional pra receber os ids escolhidos.

ALTER TABLE public.demanda ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- CREATE OR REPLACE doesn't overwrite a different-arity signature — it'd leave the old 2-arg
-- version installed alongside this one, and PostgREST refuses to call an overloaded RPC name
-- without an explicit Prefer resolution. Drop the old signature first.
DROP FUNCTION IF EXISTS public.fn_demanda_create(bigint, jsonb);

CREATE OR REPLACE FUNCTION public.fn_demanda_create(
  p_category_id     bigint,
  p_form_answers    jsonb DEFAULT '{}'::jsonb,
  p_attachment_ids  jsonb DEFAULT '[]'::jsonb
) RETURNS public.demanda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $function$
DECLARE
  v_demanda  public.demanda;
  v_form_key text;
BEGIN
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'categoria obrigatória' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND active) THEN
    RAISE EXCEPTION 'categoria inválida' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attachment_ids, 'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_attachment_ids deve ser um array' USING errcode = '22023';
  END IF;

  INSERT INTO public.demanda (category_id, attachments)
  VALUES (p_category_id, p_attachment_ids)
  RETURNING * INTO v_demanda;

  IF p_form_answers IS NOT NULL AND p_form_answers <> '{}'::jsonb THEN
    SELECT c.request_form_key INTO v_form_key FROM public.categories c WHERE c.id = p_category_id;
    IF v_form_key IS NOT NULL THEN
      PERFORM public.fn_form_result_upsert(v_form_key, 'demanda', v_demanda.uid::text, p_form_answers);
    END IF;
  END IF;

  RETURN v_demanda;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_create(bigint, jsonb, jsonb) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/demandas/0003_demandas_expiration.sql
-- ===============================================================================================

-- plugins/demandas/0003_demandas_expiration.sql
-- Expiração automática de demanda `aberta` esquecida (sem prestador respondendo). Guardada como
-- data (`expires_at`), não como job/cron — nada neste projeto roda jobs em background. O prazo em
-- dias é uma env do APP (`DEMANDA_EXPIRATION_DAYS`, foco-total/.env), não do plugin — o cliente
-- não define isso, o servidor calcula `expires_at` na criação (ver
-- foco-total/src/app/api/demandas/route.ts) e manda pronto pra `fn_demanda_create` via
-- `p_expires_at`. `fn_demanda_create` mantém um fallback de 30 dias caso `p_expires_at` não seja
-- informado (chamada direta via RPC genérica, sem passar pela rota dedicada).
--
-- "Expirada" ainda não é um status novo em `demanda.status` — checar/marcar como expirada
-- (`status = 'aberta' AND expires_at < now()`) fica pra quando alguém consumir isso (listagem,
-- fechamento automático). Este migration só guarda a data.

ALTER TABLE public.demanda ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DROP FUNCTION IF EXISTS public.fn_demanda_create(bigint, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.fn_demanda_create(
  p_category_id     bigint,
  p_form_answers    jsonb DEFAULT '{}'::jsonb,
  p_attachment_ids  jsonb DEFAULT '[]'::jsonb,
  p_expires_at      timestamptz DEFAULT NULL
) RETURNS public.demanda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $function$
DECLARE
  v_demanda  public.demanda;
  v_form_key text;
BEGIN
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'categoria obrigatória' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND active) THEN
    RAISE EXCEPTION 'categoria inválida' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attachment_ids, 'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_attachment_ids deve ser um array' USING errcode = '22023';
  END IF;

  INSERT INTO public.demanda (category_id, attachments, expires_at)
  VALUES (p_category_id, p_attachment_ids, coalesce(p_expires_at, now() + interval '30 days'))
  RETURNING * INTO v_demanda;

  IF p_form_answers IS NOT NULL AND p_form_answers <> '{}'::jsonb THEN
    SELECT c.request_form_key INTO v_form_key FROM public.categories c WHERE c.id = p_category_id;
    IF v_form_key IS NOT NULL THEN
      PERFORM public.fn_form_result_upsert(v_form_key, 'demanda', v_demanda.uid::text, p_form_answers);
    END IF;
  END IF;

  RETURN v_demanda;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_create(bigint, jsonb, jsonb, timestamptz) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/demandas/0004_demandas_subcategories.sql
-- ===============================================================================================

-- plugins/demandas/0004_demandas_subcategories.sql
-- Demanda ganha um step obrigatório de subcategoria (categories_sub) entre a escolha de categoria
-- e o formulário dinâmico — cliente escolhe 1+ subcategorias (chips, multi-select) pra dar mais
-- sinal de qual serviço específico ele precisa. Guardado como array de `categories_sub.id`, mesmo
-- padrão de `attachments` (0002) — sem tabela de junção, sem validação server-side de que os ids
-- pertencem à categoria escolhida (mesmo nível de confiança que o resto do payload client-supplied
-- desta RPC, ver nota em 0002/0003).

ALTER TABLE public.demanda ADD COLUMN IF NOT EXISTS subcategory_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.fn_demanda_create(bigint, jsonb, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_demanda_create(
  p_category_id       bigint,
  p_form_answers      jsonb DEFAULT '{}'::jsonb,
  p_attachment_ids     jsonb DEFAULT '[]'::jsonb,
  p_expires_at         timestamptz DEFAULT NULL,
  p_subcategory_ids    jsonb DEFAULT '[]'::jsonb
) RETURNS public.demanda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $function$
DECLARE
  v_demanda  public.demanda;
  v_form_key text;
BEGIN
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'categoria obrigatória' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND active) THEN
    RAISE EXCEPTION 'categoria inválida' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attachment_ids, 'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_attachment_ids deve ser um array' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_subcategory_ids, 'null'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_subcategory_ids deve ser um array' USING errcode = '22023';
  END IF;

  INSERT INTO public.demanda (category_id, attachments, expires_at, subcategory_ids)
  VALUES (
    p_category_id, p_attachment_ids, coalesce(p_expires_at, now() + interval '30 days'),
    p_subcategory_ids
  )
  RETURNING * INTO v_demanda;

  IF p_form_answers IS NOT NULL AND p_form_answers <> '{}'::jsonb THEN
    SELECT c.request_form_key INTO v_form_key FROM public.categories c WHERE c.id = p_category_id;
    IF v_form_key IS NOT NULL THEN
      PERFORM public.fn_form_result_upsert(v_form_key, 'demanda', v_demanda.uid::text, p_form_answers);
    END IF;
  END IF;

  RETURN v_demanda;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_demanda_create(bigint, jsonb, jsonb, timestamptz, jsonb) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- PLUGIN: pedidos  (4 arquivos)
-- ===============================================================================================



-- ===============================================================================================
-- kizuna-core/plugins/pedidos/0001_pedidos.sql
-- ===============================================================================================

-- plugins/pedidos/0001_pedidos.sql
-- Plugin: pedidos — o container 1:1 (cliente, prestador) que nasce junto com uma conversation de
-- solicitação e pode acumular varios `services` do mesmo prestador. Depende de `services`
-- (plugin services) e `conversation` (plugin messaging) via FK — por isso NÃO entra em
-- kizuna.plugins.json, é aplicado manualmente pelo db/install.sh depois de services + messaging
-- (ver Task 5). Design: foco-total/docs/superpowers/specs/2026-09-15-plugin-pedidos-design.md

-- =========================================================================
-- 1) Tabelas
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pedido (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid               uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  prestador_id      uuid NOT NULL REFERENCES auth.users(uid) ON DELETE RESTRICT,
  conversation_id   bigint NOT NULL REFERENCES public.conversation(id) ON DELETE RESTRICT,
  origem            text NOT NULL CHECK (origem IN ('anuncio','demanda')),
  status            text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','concluido','cancelado')),
  tenant_id         uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by        uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_uid_unique UNIQUE (uid),
  CONSTRAINT pedido_conversation_unique UNIQUE (conversation_id)
);
CREATE INDEX IF NOT EXISTS pedido_cliente    ON public.pedido (cliente_id);
CREATE INDEX IF NOT EXISTS pedido_prestador  ON public.pedido (prestador_id);

CREATE TABLE IF NOT EXISTS public.pedido_servico (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uid               uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id         bigint NOT NULL REFERENCES public.pedido(id) ON DELETE CASCADE,
  service_id        bigint NOT NULL REFERENCES public.services(id),
  status            text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','agendado','concluido','cancelado')),
  agenda_event_id   bigint,
  tenant_id         uuid DEFAULT auth.fun_auth_current_tenant_id(),
  created_by        uuid NOT NULL DEFAULT auth.fun_auth_user_id(),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_servico_uid_unique UNIQUE (uid),
  CONSTRAINT pedido_servico_unique UNIQUE (pedido_id, service_id)
);
CREATE INDEX IF NOT EXISTS pedido_servico_pedido ON public.pedido_servico (pedido_id);

-- =========================================================================
-- 2) Helper de participação (mesmo padrão de auth.fun_msg_is_participant)
-- =========================================================================
CREATE OR REPLACE FUNCTION auth.fun_pedido_is_participant(p_pedido_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pedido
        WHERE id = p_pedido_id
          AND (cliente_id = auth.fun_auth_user_id() OR prestador_id = auth.fun_auth_user_id())
    );
$$;

-- =========================================================================
-- 3) RLS
-- =========================================================================
ALTER TABLE public.pedido ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.pedido TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pedido FROM auth_user;

DROP POLICY IF EXISTS pedido_select ON public.pedido;
CREATE POLICY pedido_select ON public.pedido FOR SELECT TO auth_user
  USING (cliente_id = auth.fun_auth_user_id() OR prestador_id = auth.fun_auth_user_id());

ALTER TABLE public.pedido_servico ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.pedido_servico TO auth_user;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pedido_servico FROM auth_user;

DROP POLICY IF EXISTS pedido_servico_select ON public.pedido_servico;
CREATE POLICY pedido_servico_select ON public.pedido_servico FOR SELECT TO auth_user
  USING (auth.fun_pedido_is_participant(pedido_id));

-- =========================================================================
-- 4) RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_pedido_create(
  p_conversation_id bigint,
  p_prestador_id    uuid,
  p_origem          text,
  p_service_ids     bigint[]
) RETURNS public.pedido
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_pedido  public.pedido;
  v_bad_ct  integer;
BEGIN
  IF NOT auth.fun_msg_is_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- I1: p_prestador_id precisa ser de fato o OUTRO participante da conversa — sem isso, qualquer
  -- participante poderia nomear qualquer prestador (service_id é publicamente legível) e criar um
  -- pedido que esse prestador nunca concordou em integrar.
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participant
     WHERE conversation_id = p_conversation_id
       AND user_id = p_prestador_id
       AND active
  ) THEN
    RAISE EXCEPTION 'p_prestador_id não participa desta conversa' USING errcode = '22023';
  END IF;

  IF p_origem NOT IN ('anuncio','demanda') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem USING errcode = '22023';
  END IF;
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'pedido precisa de pelo menos 1 serviço' USING errcode = '22023';
  END IF;

  SELECT count(*) INTO v_bad_ct
    FROM unnest(p_service_ids) sid
    LEFT JOIN public.services s ON s.id = sid AND s.created_by = p_prestador_id
   WHERE s.id IS NULL;
  IF v_bad_ct > 0 THEN
    RAISE EXCEPTION 'todo service_id precisa pertencer a p_prestador_id' USING errcode = '22023';
  END IF;

  INSERT INTO public.pedido (cliente_id, prestador_id, conversation_id, origem)
  VALUES (auth.fun_auth_user_id(), p_prestador_id, p_conversation_id, p_origem)
  RETURNING * INTO v_pedido;

  INSERT INTO public.pedido_servico (pedido_id, service_id)
  SELECT v_pedido.id, sid FROM unnest(p_service_ids) sid;

  PERFORM auth.fun_notify(
    p_prestador_id, 'pedido_criado', 'Novo pedido recebido',
    NULL, 'pedido', v_pedido.uid::text
  );

  RETURN v_pedido;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_create(bigint, uuid, text, bigint[]) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_pedido_add_servico(
  p_pedido_id bigint,
  p_service_id bigint
) RETURNS public.pedido_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_row     public.pedido_servico;
  v_pres    uuid;
  v_pstatus text;
BEGIN
  IF NOT auth.fun_pedido_is_participant(p_pedido_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT prestador_id, status INTO v_pres, v_pstatus FROM public.pedido WHERE id = p_pedido_id;

  -- I2: um pedido já concluído/cancelado é terminal — aceitar um novo serviço `pendente` nele
  -- reabriria implicitamente o pedido pela regra de derivação de status em
  -- fn_pedido_servico_atualizar_status (nenhum serviço pendente/agendado + ao menos 1 concluído).
  IF v_pstatus <> 'aberto' THEN
    RAISE EXCEPTION 'pedido não está aberto' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND created_by = v_pres) THEN
    RAISE EXCEPTION 'serviço não pertence ao prestador deste pedido' USING errcode = '22023';
  END IF;

  INSERT INTO public.pedido_servico (pedido_id, service_id)
  VALUES (p_pedido_id, p_service_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_add_servico(bigint, bigint) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_pedido_servico_atualizar_status(
  p_pedido_servico_id bigint,
  p_status             text
) RETURNS public.pedido_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_row        public.pedido_servico;
  v_pedido_id  bigint;
  v_pstatus    text;
  v_cliente    uuid;
  v_prestador  uuid;
  v_other      uuid;
  v_open_ct    integer;
  v_done_ct    integer;
BEGIN
  SELECT pedido_id INTO v_pedido_id FROM public.pedido_servico WHERE id = p_pedido_servico_id;
  IF v_pedido_id IS NULL OR NOT auth.fun_pedido_is_participant(v_pedido_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('pendente','agendado','concluido','cancelado') THEN
    RAISE EXCEPTION 'status inválido: %', p_status USING errcode = '22023';
  END IF;

  SELECT status, cliente_id, prestador_id INTO v_pstatus, v_cliente, v_prestador
    FROM public.pedido WHERE id = v_pedido_id;

  -- I2: pedido terminal (concluído/cancelado) não aceita mais transições de status dos seus
  -- serviços — evita, por exemplo, um `pedido_servico` sendo marcado `concluido` depois que o
  -- pedido já foi cancelado, o que reabriria o pedido via a derivação de status abaixo.
  IF v_pstatus <> 'aberto' THEN
    RAISE EXCEPTION 'pedido não está aberto' USING errcode = '22023';
  END IF;

  -- C2: só o prestador pode marcar um serviço como concluído — do contrário o próprio cliente
  -- poderia forjar a precondição "pedido concluído" que hoje é usada para liberar avaliação.
  IF p_status = 'concluido' AND auth.fun_auth_user_id() <> v_prestador THEN
    RAISE EXCEPTION 'somente o prestador pode concluir um serviço' USING errcode = '42501';
  END IF;

  UPDATE public.pedido_servico SET status = p_status, updated_at = now()
   WHERE id = p_pedido_servico_id
   RETURNING * INTO v_row;

  v_other := CASE WHEN auth.fun_auth_user_id() = v_cliente THEN v_prestador ELSE v_cliente END;

  IF p_status = 'concluido' THEN
    PERFORM auth.fun_notify(
      v_other, 'pedido_servico_concluido', 'Um serviço do seu pedido foi concluído',
      NULL, 'pedido', (SELECT uid FROM public.pedido WHERE id = v_pedido_id)::text
    );
  END IF;

  -- Derivação de §3.1 do spec: fecha o pedido quando nenhum serviço está pendente/agendado E
  -- pelo menos um está concluído. Se todos cancelados (sem nenhum concluído), não fecha sozinho.
  SELECT count(*) FILTER (WHERE status IN ('pendente','agendado')),
         count(*) FILTER (WHERE status = 'concluido')
    INTO v_open_ct, v_done_ct
    FROM public.pedido_servico WHERE pedido_id = v_pedido_id;

  IF v_open_ct = 0 AND v_done_ct > 0 THEN
    UPDATE public.pedido SET status = 'concluido', updated_at = now() WHERE id = v_pedido_id;
  END IF;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_servico_atualizar_status(bigint, text) TO auth_user;

CREATE OR REPLACE FUNCTION public.fn_pedido_cancelar(p_pedido_id bigint) RETURNS public.pedido
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_pedido public.pedido;
  v_other  uuid;
BEGIN
  IF NOT auth.fun_pedido_is_participant(p_pedido_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE public.pedido SET status = 'cancelado', updated_at = now()
   WHERE id = p_pedido_id
   RETURNING * INTO v_pedido;

  v_other := CASE WHEN auth.fun_auth_user_id() = v_pedido.cliente_id
                   THEN v_pedido.prestador_id ELSE v_pedido.cliente_id END;
  PERFORM auth.fun_notify(
    v_other, 'pedido_cancelado', 'Um pedido foi cancelado', NULL, 'pedido', v_pedido.uid::text
  );

  RETURN v_pedido;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_cancelar(bigint) TO auth_user;

-- =========================================================================
-- 5) Registro do plugin
-- =========================================================================
INSERT INTO auth.plugin_registry (name, version)
VALUES ('pedidos', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/pedidos/0002_pedido_confirmar.sql
-- ===============================================================================================

-- plugins/pedidos/0002_pedido_confirmar.sql
-- Bloco 2 (solicitar-anuncio-pedido): coluna de confirmação do resumo do pedido + RPC idempotente
-- chamável por qualquer um dos dois participantes. Design:
-- foco-total/docs/superpowers/specs/2026-09-15-solicitar-anuncio-pedido-design.md §4

ALTER TABLE public.pedido ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_pedido_confirmar(p_pedido_id bigint) RETURNS public.pedido
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_pedido public.pedido;
BEGIN
  IF NOT auth.fun_pedido_is_participant(p_pedido_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- Idempotente: a segunda chamada (de qualquer um dos dois lados) não é erro, só devolve a
  -- linha já confirmada — evita corrida entre cliente e prestador clicando quase ao mesmo tempo.
  UPDATE public.pedido SET confirmado_em = now()
   WHERE id = p_pedido_id AND confirmado_em IS NULL
   RETURNING * INTO v_pedido;

  IF NOT FOUND THEN
    SELECT * INTO v_pedido FROM public.pedido WHERE id = p_pedido_id;
  END IF;

  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'pedido não encontrado' USING errcode = '22023';
  END IF;

  RETURN v_pedido;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_confirmar(bigint) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/pedidos/0003_pedido_iniciar_por_servico.sql
-- ===============================================================================================

-- plugins/pedidos/0003_pedido_iniciar_por_servico.sql
-- Bloco 2: cria pedido + conversation atomicamente a partir de um anúncio. Reaproveita a conversa
-- "Falar com" existente pro mesmo serviço se houver uma aberta (mesma lógica de dedupe de
-- fn_msg_start_conversation) — assim "solicitar" dentro de um chat de dúvida já aberto vira o
-- mesmo pedido em vez de duplicar a conversa. Design:
-- foco-total/docs/superpowers/specs/2026-09-15-solicitar-anuncio-pedido-design.md §3

CREATE OR REPLACE FUNCTION public.fn_pedido_iniciar_por_servico(
  p_service_ids  bigint[],
  p_resumo       text,
  p_form_answers jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (pedido_uid uuid, conversation_uid uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_me           uuid := auth.fun_auth_user_id();
  v_prestador_id uuid;
  v_category_id  bigint;
  v_form_key     text;
  v_bad_ct       integer;
  v_conv         public.conversation%ROWTYPE;
  v_pedido       public.pedido;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING errcode = '42501';
  END IF;
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'pedido precisa de pelo menos 1 serviço' USING errcode = '22023';
  END IF;

  SELECT s.created_by, s.category_id INTO v_prestador_id, v_category_id
    FROM public.services s WHERE s.id = p_service_ids[1];
  IF v_prestador_id IS NULL THEN
    RAISE EXCEPTION 'serviço inválido' USING errcode = '22023';
  END IF;
  IF v_prestador_id = v_me THEN
    RAISE EXCEPTION 'não é possível solicitar o próprio anúncio' USING errcode = '22023';
  END IF;

  -- Mesma checagem de fn_pedido_create (I1 do review do Bloco 1): todo service_id precisa
  -- pertencer ao MESMO prestador — sem isso um pedido misturaria anúncios de donos diferentes.
  SELECT count(*) INTO v_bad_ct
    FROM unnest(p_service_ids) sid
    LEFT JOIN public.services s ON s.id = sid AND s.created_by = v_prestador_id
   WHERE s.id IS NULL;
  IF v_bad_ct > 0 THEN
    RAISE EXCEPTION 'todo service_id precisa pertencer ao mesmo prestador' USING errcode = '22023';
  END IF;

  SELECT c.* INTO v_conv
    FROM public.conversation c
    JOIN public.conversation_participant p1 ON p1.conversation_id = c.id AND p1.user_id = v_me AND p1.active
    JOIN public.conversation_participant p2 ON p2.conversation_id = c.id AND p2.user_id = v_prestador_id AND p2.active
   WHERE c.status = 'open'
     AND c.context_type = 'service'
     AND c.context_id = p_service_ids[1]::text
   ORDER BY c.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.conversation (context_type, context_id, created_by, tenant_id)
    VALUES ('service', p_service_ids[1]::text, v_me, auth.fun_auth_current_tenant_id())
    RETURNING * INTO v_conv;
    INSERT INTO public.conversation_participant (conversation_id, user_id, role)
    VALUES (v_conv.id, v_me, 'owner'), (v_conv.id, v_prestador_id, 'member');
  END IF;

  IF p_resumo IS NOT NULL AND length(trim(p_resumo)) > 0 THEN
    INSERT INTO public.message (conversation_id, sender_id, source, direction, content, status)
    VALUES (v_conv.id, v_me, 'platform', 'outbound', p_resumo, 'sent');
  END IF;

  -- Reaproveita a validação/inserts já especificados no Bloco 1 em vez de duplicá-los aqui.
  v_pedido := public.fn_pedido_create(v_conv.id, v_prestador_id, 'anuncio', p_service_ids);

  -- Só agora o pedido existe: promove a conversa de "dúvida sobre um serviço" pra "pedido".
  UPDATE public.conversation SET context_type = 'pedido', context_id = v_pedido.uid::text
   WHERE id = v_conv.id;

  IF v_category_id IS NOT NULL AND p_form_answers IS NOT NULL AND p_form_answers <> '{}'::jsonb THEN
    SELECT c.request_form_key INTO v_form_key FROM public.categories c WHERE c.id = v_category_id;
    IF v_form_key IS NOT NULL THEN
      PERFORM public.fn_form_result_upsert(v_form_key, 'pedido', v_pedido.uid::text, p_form_answers);
    END IF;
  END IF;

  RETURN QUERY SELECT v_pedido.uid, v_conv.uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_iniciar_por_servico(bigint[], text, jsonb) TO auth_user;

NOTIFY pgrst, 'reload schema';


-- ===============================================================================================
-- kizuna-core/plugins/pedidos/0004_pedido_iniciar_por_demanda.sql
-- ===============================================================================================

-- plugins/pedidos/0004_pedido_iniciar_por_demanda.sql
-- Bloco 4: aceitar uma demanda_proposta cria pedido + conversation atomicamente, igual ao Bloco 2
-- (fn_pedido_iniciar_por_servico), mas o prestador vem da proposta (não de services.created_by
-- direto), os service_ids precisam ser subconjunto do que a proposta ofereceu, e as respostas do
-- formulário já capturadas na demanda são copiadas (não pedidas de novo) pro pedido. Design:
-- foco-total/docs/superpowers/specs/2026-09-15-demanda-e-propostas-design.md §4

ALTER TABLE public.pedido ADD COLUMN IF NOT EXISTS demanda_id bigint REFERENCES public.demanda(id);

CREATE OR REPLACE FUNCTION public.fn_pedido_iniciar_por_demanda(
  p_proposta_id bigint,
  p_service_ids bigint[],
  p_resumo      text
) RETURNS TABLE (pedido_uid uuid, conversation_uid uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_me           uuid := auth.fun_auth_user_id();
  v_demanda_id   bigint;
  v_demanda_uid  uuid;
  v_cliente_id   uuid;
  v_prestador_id uuid;
  v_bad_ct       integer;
  v_conv         public.conversation%ROWTYPE;
  v_pedido       public.pedido;
  v_form_row     record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING errcode = '42501';
  END IF;
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'pedido precisa de pelo menos 1 serviço' USING errcode = '22023';
  END IF;

  SELECT dp.demanda_id, dp.prestador_id, d.uid, d.cliente_id
    INTO v_demanda_id, v_prestador_id, v_demanda_uid, v_cliente_id
    FROM public.demanda_proposta dp
    JOIN public.demanda d ON d.id = dp.demanda_id
   WHERE dp.id = p_proposta_id;

  IF v_demanda_id IS NULL THEN
    RAISE EXCEPTION 'proposta não encontrada' USING errcode = '22023';
  END IF;
  IF v_cliente_id <> v_me THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT count(*) INTO v_bad_ct
    FROM unnest(p_service_ids) sid
    LEFT JOIN public.demanda_proposta_servico dps
      ON dps.service_id = sid AND dps.proposta_id = p_proposta_id
   WHERE dps.id IS NULL;
  IF v_bad_ct > 0 THEN
    RAISE EXCEPTION 'todo service_id precisa estar na proposta' USING errcode = '22023';
  END IF;

  SELECT c.* INTO v_conv
    FROM public.conversation c
    JOIN public.conversation_participant p1 ON p1.conversation_id = c.id AND p1.user_id = v_me AND p1.active
    JOIN public.conversation_participant p2 ON p2.conversation_id = c.id AND p2.user_id = v_prestador_id AND p2.active
   WHERE c.status = 'open'
     AND c.context_type = 'demanda'
     AND c.context_id = v_demanda_uid::text
   ORDER BY c.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.conversation (context_type, context_id, created_by, tenant_id)
    VALUES ('demanda', v_demanda_uid::text, v_me, auth.fun_auth_current_tenant_id())
    RETURNING * INTO v_conv;
    INSERT INTO public.conversation_participant (conversation_id, user_id, role)
    VALUES (v_conv.id, v_me, 'owner'), (v_conv.id, v_prestador_id, 'member');
  END IF;

  IF p_resumo IS NOT NULL AND length(trim(p_resumo)) > 0 THEN
    INSERT INTO public.message (conversation_id, sender_id, source, direction, content, status)
    VALUES (v_conv.id, v_me, 'platform', 'outbound', p_resumo, 'sent');
  END IF;

  v_pedido := public.fn_pedido_create(v_conv.id, v_prestador_id, 'demanda', p_service_ids);

  UPDATE public.pedido SET demanda_id = v_demanda_id WHERE id = v_pedido.id;

  UPDATE public.conversation SET context_type = 'pedido', context_id = v_pedido.uid::text
   WHERE id = v_conv.id;

  UPDATE public.demanda_proposta SET status = 'aceita', updated_at = now()
   WHERE id = p_proposta_id;

  SELECT fr.form_key, fr.answers INTO v_form_row
    FROM public.form_results fr WHERE fr.domain = 'demanda' AND fr.reference_id = v_demanda_uid::text;
  IF v_form_row.form_key IS NOT NULL THEN
    PERFORM public.fn_form_result_upsert(v_form_row.form_key, 'pedido', v_pedido.uid::text, v_form_row.answers);
  END IF;

  RETURN QUERY SELECT v_pedido.uid, v_conv.uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pedido_iniciar_por_demanda(bigint, bigint[], text) TO auth_user;

NOTIFY pgrst, 'reload schema';
