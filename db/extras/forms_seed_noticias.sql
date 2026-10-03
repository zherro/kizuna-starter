-- db/extras/forms_seed_noticias.sql
--
-- Seed do formulario `noticias` (plugin forms): data de publicacao, autor, fonte e link da fonte.
-- Titulo, texto e imagens ficam no anuncio.
-- O importador grava as respostas em public.form_results.
-- DESTRUTIVO (recria): apaga e reinsere o formulario do tenant do root; ABORTA se ja houver respostas.
-- Vincula as categorias do grupo ao formulario (categories.form_key) sem sobrescrever um form_key existente.
-- Rode DEPOIS de db/extras/taxonomy_seed_bora_cuiaba.sql (o clear-all dele zera o form_key).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/forms_seed_noticias.sql

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
  WHERE f.tenant_id = v_tenant AND f.form_key = 'noticias';

  IF v_n > 0 THEN
    RAISE EXCEPTION 'recriacao do formulario noticias abortada: ha % resposta(s) em public.form_results. Remova os anuncios de noticias antes.', v_n;
  END IF;

  DELETE FROM public.forms WHERE tenant_id = v_tenant AND form_key = 'noticias';
END
$clear$;

-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'noticias', 'Notícias — fonte e publicação',
       'Data, autoria e fonte da notícia.', $schema$
{
  "title": "Notícias — fonte e publicação",
  "description": "Data, autoria e fonte da notícia.",
  "fields": [
    {
      "id": "not_01_secao_noticia",
      "key": "secao_noticia",
      "name": "secao_noticia",
      "type": "heading",
      "label": "Notícia",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 12,
        "lg": 12,
        "xl": 12,
        "2xl": 12
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "not_02_data_publicacao",
      "key": "data_publicacao",
      "name": "data_publicacao",
      "type": "datetime",
      "label": "Data de publicação",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {
        "required": true
      },
      "validation": {},
      "appearance": {}
    },
    {
      "id": "not_03_autor",
      "key": "autor",
      "name": "autor",
      "type": "text",
      "label": "Autor",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {}
    },
    {
      "id": "not_04_fonte",
      "key": "fonte",
      "name": "fonte",
      "type": "text",
      "label": "Fonte",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
      "placeholder": "Veículo ou órgão de origem"
    },
    {
      "id": "not_05_link",
      "key": "link",
      "name": "link",
      "type": "url",
      "label": "Link da fonte",
      "grid": {
        "xs": 12,
        "sm": 12,
        "md": 6,
        "lg": 6,
        "xl": 6,
        "2xl": 6
      },
      "behavior": {},
      "validation": {},
      "appearance": {},
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

-- `noticias` e um GRUPO da taxonomia: vincula todas as categorias dele.
UPDATE public.categories SET form_key = 'noticias'
WHERE (category_group_id = (SELECT id FROM public.categories_group WHERE slug = 'noticias'))
  AND (form_key IS NULL OR form_key = '');

COMMIT;
