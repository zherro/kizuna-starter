-- db/extras/services_inativar_pelo_dono.sql
-- Aplica no banco a migração kizuna-core/plugins/services/0018_services_owner_read_inactive.sql
-- (switch "Ativo" em /painel/meus-servicos). Idempotente:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/services_inativar_pelo_dono.sql

-- Exclusão lógica pelo próprio dono: o switch "Ativo" de /painel/meus-servicos grava
-- `services.active = false`. A policy de leitura do 0001 exigia `active` até para o dono, então o
-- anúncio inativado sumia da própria listagem (sem como religar) e o PATCH com
-- `return=representation` falhava (a linha nova não passava no SELECT).
--
-- Nova regra de leitura para auth_user:
--   dono ou moderador: lê o anúncio ativo OU inativo;
--   os demais: só o ativo e aprovado (`active AND status = 'active'`), como o anon.
-- O público (anon, busca, detalhe, sitemap) não muda: continua exigindo `active`.
-- Aditivo e idempotente.

DROP POLICY IF EXISTS services_owner_read ON public.services;
CREATE POLICY services_owner_read ON public.services FOR SELECT TO auth_user
  USING (
    created_by = auth.fun_auth_user_id()
    OR auth.fun_auth_has_perm('services', 'moderate')
    OR (active AND status = 'active')
  );

NOTIFY pgrst, 'reload schema';
