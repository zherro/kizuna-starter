-- Delta: permissões próprias dos menus do painel (Chamados, Métricas). Idempotente.
-- Aplicar em base já provisionada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/permissoes_menu_painel.sql
-- Fonte: kizuna-core/plugins/tickets/0003 e plugins/analytics/0002 (já estão no db/public.sql).

BEGIN;

-- ===== kizuna-core/plugins/tickets/0003_tickets_view_permission.sql =====
-- plugins/tickets/0003_tickets_view_permission.sql
-- `tickets/view`: permissão própria do menu "Chamados" (abrir e acompanhar os próprios chamados).
-- Antes o menu usava `default/view` e, na tela de papéis, aparecia misturado ao acesso básico do
-- painel — não dava para liberar o painel sem liberar chamados, nem o contrário.
--
-- Para ninguém perder acesso, todo papel que hoje tem `default/view` ganha `tickets/view`.
-- `tickets/manage` (ver todos, responder) continua separado. As policies de `tickets` não mudam:
-- o dono sempre vê os próprios chamados; esta permissão só controla o menu e a rota.

INSERT INTO auth.permissions (resource, action, name)
VALUES ('tickets', 'view', 'Abrir e acompanhar os próprios chamados')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.role_grants (role_id, permission_id)
SELECT g.role_id, t.id
  FROM auth.role_grants g
  JOIN auth.permissions d ON d.id = g.permission_id AND d.resource = 'default' AND d.action = 'view'
 CROSS JOIN auth.permissions t
 WHERE t.resource = 'tickets' AND t.action = 'view'
ON CONFLICT DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('tickets', '1.2.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

-- ===== kizuna-core/plugins/analytics/0002_analytics_view_permission.sql =====
-- plugins/analytics/0002_analytics_view_permission.sql
-- `analytics/view`: permissão própria do menu "Métricas" do painel, para liberá-lo por papel na tela
-- de papéis. Só entra no catálogo — nenhum papel recebe por padrão (root passa sempre); quem for
-- liberar concede em /painel/root/papeis. As policies das tabelas de analytics não mudam.

INSERT INTO auth.permissions (resource, action, name)
VALUES ('analytics', 'view', 'Ver as métricas das próprias publicações')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('analytics', '2.1.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

COMMIT;
