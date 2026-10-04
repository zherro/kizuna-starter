-- db/extras/painel_menu_permissions.sql
--
-- Uma permissão por item do menu do painel (src/components/panel-nav.ts), para cada item poder ser
-- habilitado/desabilitado por perfil em /painel/root/papeis. "Painel" continua sendo `default`
-- (Acessar o painel — sql/0116 do core), que também libera as telas sem item próprio.
--
-- Não muda nada para ninguém ao rodar: todo perfil que hoje tem `default/view` recebe as novas
-- (antes todos esses itens dependiam só de `default`). Depois é desmarcar na tela de papéis.
-- As permissões vão no token da sessão: vale a partir do próximo login de cada usuário.
--
-- Idempotente. Aplicar ANTES do deploy que troca o permResource dos itens:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/painel_menu_permissions.sql

BEGIN;

INSERT INTO auth.permissions (resource, action, name) VALUES
  ('painel_nova_publicacao',    'view', 'Nova publicação'),
  ('painel_minhas_publicacoes', 'view', 'Minhas publicações'),
  ('painel_metricas',           'view', 'Métricas'),
  ('painel_avaliacoes',         'view', 'Avaliação'),
  ('painel_chamados',           'view', 'Chamados'),
  ('painel_tela_inicial',       'view', 'Tela inicial'),
  ('painel_minha_conta',        'view', 'Minha conta')
ON CONFLICT (resource, action) DO NOTHING;

-- Quem já acessa o painel continua vendo os mesmos itens.
INSERT INTO auth.role_grants (role_id, permission_id)
SELECT rg.role_id, p.id
FROM auth.role_grants rg
JOIN auth.permissions d ON d.id = rg.permission_id AND d.resource = 'default' AND d.action = 'view'
CROSS JOIN auth.permissions p
WHERE p.action = 'view'
  AND p.resource IN (
    'painel_nova_publicacao', 'painel_minhas_publicacoes', 'painel_metricas', 'painel_avaliacoes',
    'painel_chamados', 'painel_tela_inicial', 'painel_minha_conta'
  )
ON CONFLICT DO NOTHING;

COMMIT;
