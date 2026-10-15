-- db/extras/forms_seed_lugares.sql
--
-- Seed do formulario `lugares` (plugin forms). Um anuncio = um lugar (shopping, casa de festas, parque...):
--   - Funcionamento: horario (`list` de linhas de texto), preco (texto livre), gratuito (lugar publico ou
--     entrada franca) e dicas de chegada.
--   - Contato: telefone, WhatsApp, Instagram e site.
-- Titulo, descricao, imagens, endereco e codigo ficam no anuncio (coluna/tabela/extras proprios).
--
-- O importador (scripts/lugares-para-servicos.mjs, docs/integracoes/lugares-depara.md) grava as respostas
-- direto em public.form_results e repete as mesmas chaves em services.extras.
--
-- DESTRUTIVO (recria): apaga e reinsere o formulario do tenant do root; ABORTA se ja houver respostas.
-- Vincula as categorias do grupo `lugares` (categories.form_key) sem sobrescrever um form_key existente.
-- Rode DEPOIS de db/extras/taxonomy_seed_bora_cuiaba.sql (o clear-all dele zera o form_key).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/forms_seed_lugares.sql

BEGIN;

-- 0) Remocao (sempre recria) — com guarda: so se o formulario nao tiver respostas ----------------
DO $clear$
DECLARE
  v_tenant uuid;
  v_n bigint;
BEGIN
  SELECT tn.uid INTO v_tenant
  FROM auth.tenants tn
  JOIN (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1) u ON tn.owner_uid = u.uid
  ORDER BY tn.created_at ASC LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'sem root/tenant: remocao ignorada (o INSERT abaixo tambem sera no-op).';
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.form_results r
  JOIN public.forms f ON f.id = r.form_id
  WHERE f.tenant_id = v_tenant AND f.form_key = 'lugares';

  IF v_n > 0 THEN
    RAISE EXCEPTION 'recriacao do formulario lugares abortada: ha % resposta(s) em public.form_results. Atualize o schema no lugar (UPDATE public.forms).', v_n;
  END IF;

  DELETE FROM public.forms WHERE tenant_id = v_tenant AND form_key = 'lugares';
END
$clear$;

-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'lugares', 'Lugares — funcionamento e contato',
       'Horário, preço, como chegar e contato do lugar.', $schema$
{
  "title": "Lugares — funcionamento e contato",
  "description": "Horário, preço, como chegar e contato do lugar.",
  "fields": [
    {
      "id": "lug_01_secao_lugar", "key": "secao_lugar", "name": "secao_lugar", "type": "heading", "label": "Funcionamento",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "lug_02_horario", "key": "horario", "name": "horario", "type": "list", "label": "Horário de funcionamento",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Horário",
      "itemFields": [
        {
          "id": "hor_texto", "key": "texto", "name": "texto", "type": "text", "label": "Horário",
          "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
          "behavior": { "required": true }, "validation": {}, "appearance": {},
          "placeholder": "Seg a sáb, 10h às 22h"
        }
      ]
    },
    {
      "id": "lug_03_preco", "key": "preco", "name": "preco", "type": "text", "label": "Preço",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {},
      "placeholder": "Entrada, consumação, faixa de preço"
    },
    {
      "id": "lug_04_gratuito", "key": "gratuito", "name": "gratuito", "type": "switch", "label": "Público/gratuito",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "lug_05_dicas_chegada", "key": "dicas_chegada", "name": "dicas_chegada", "type": "textarea", "label": "Como chegar",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "placeholder": "Estacionamento, ônibus, ponto de referência"
    },
    {
      "id": "lug_06_secao_contato", "key": "secao_contato", "name": "secao_contato", "type": "heading", "label": "Contato",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "lug_07_contato_telefone", "key": "contato_telefone", "name": "contato_telefone", "type": "phone", "label": "Telefone",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "lug_08_contato_whatsapp", "key": "contato_whatsapp", "name": "contato_whatsapp", "type": "phone", "label": "WhatsApp",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "lug_09_contato_instagram", "key": "contato_instagram", "name": "contato_instagram", "type": "text", "label": "Instagram",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {},
      "placeholder": "@perfil"
    },
    {
      "id": "lug_10_site", "key": "site", "name": "site", "type": "url", "label": "Site",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {},
      "placeholder": "https://"
    }
  ]
}
$schema$::jsonb, true, u.uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1) AS u
JOIN LATERAL (
    SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at ASC LIMIT 1
) AS t ON true
ON CONFLICT (tenant_id, form_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  schema = EXCLUDED.schema,
  active = true;

-- `lugares` e um GRUPO da taxonomia: vincula todas as categorias dele.
UPDATE public.categories SET form_key = 'lugares'
WHERE category_group_id = (SELECT id FROM public.categories_group WHERE slug = 'lugares')
  AND (form_key IS NULL OR form_key = '');

COMMIT;
