-- db/extras/forms_seed_eventos.sql
--
-- Seed do formulario `eventos` (plugin forms): data, realizador, link, endereco e a tabela de
-- ingressos (`list`: descricao, valor, situacao). Titulo, descricao e imagens ficam no anuncio.
-- O importador grava as respostas em public.form_results.
-- DESTRUTIVO (recria): apaga e reinsere o formulario do tenant do root; ABORTA se ja houver respostas.
-- Vincula as categorias do grupo ao formulario (categories.form_key) sem sobrescrever um form_key existente.
-- Rode DEPOIS de db/extras/taxonomy_seed_bora_cuiaba.sql (o clear-all dele zera o form_key).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/forms_seed_eventos.sql

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
  WHERE f.tenant_id = v_tenant AND f.form_key = 'eventos';

  IF v_n > 0 THEN
    RAISE EXCEPTION 'recriacao do formulario eventos abortada: ha % resposta(s) em public.form_results. Remova os anuncios de eventos antes.', v_n;
  END IF;

  DELETE FROM public.forms WHERE tenant_id = v_tenant AND form_key = 'eventos';
END
$clear$;

-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'eventos', 'Eventos — detalhes e ingressos',
       'Data, local, realizador, link e tabela de ingressos.', $schema$
{
  "title": "Eventos — detalhes e ingressos",
  "description": "Data, local, realizador, link e tabela de ingressos.",
  "fields": [
    {
      "id": "evt_01_secao_evento",
      "key": "secao_evento",
      "name": "secao_evento",
      "type": "heading",
      "label": "Evento",
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
      "id": "evt_02_data_inicio",
      "key": "data_inicio",
      "name": "data_inicio",
      "type": "datetime",
      "label": "Data e hora de início",
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
      "id": "evt_03_data_fim",
      "key": "data_fim",
      "name": "data_fim",
      "type": "datetime",
      "label": "Data e hora de término",
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
      "id": "evt_04_realizador",
      "key": "realizador",
      "name": "realizador",
      "type": "text",
      "label": "Realizador",
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
      "placeholder": "Quem organiza o evento"
    },
    {
      "id": "evt_05_link",
      "key": "link",
      "name": "link",
      "type": "url",
      "label": "Link do evento",
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
    },
    {
      "id": "evt_06_endereco",
      "key": "endereco",
      "name": "endereco",
      "type": "text",
      "label": "Endereço",
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
      "appearance": {},
      "placeholder": "Local, rua, número, bairro"
    },
    {
      "id": "evt_07_secao_ingressos",
      "key": "secao_ingressos",
      "name": "secao_ingressos",
      "type": "heading",
      "label": "Ingressos",
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
      "id": "evt_08_ingressos",
      "key": "ingressos",
      "name": "ingressos",
      "type": "list",
      "label": "Tabela de ingressos",
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
      "appearance": {},
      "itemLabel": "Ingresso",
      "itemFields": [
        {
          "id": "ing_descricao",
          "key": "descricao",
          "name": "descricao",
          "type": "text",
          "label": "Descrição",
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
          "appearance": {},
          "placeholder": "Ex.: Pista — 1º lote"
        },
        {
          "id": "ing_valor",
          "key": "valor",
          "name": "valor",
          "type": "currency",
          "label": "Valor",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 3,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {},
          "validation": {},
          "appearance": {}
        },
        {
          "id": "ing_situacao",
          "key": "situacao",
          "name": "situacao",
          "type": "select",
          "label": "Situação",
          "grid": {
            "xs": 12,
            "sm": 12,
            "md": 3,
            "lg": 3,
            "xl": 3,
            "2xl": 3
          },
          "behavior": {},
          "validation": {},
          "appearance": {},
          "options": [
            {
              "label": "Disponível",
              "value": "Disponível"
            },
            {
              "label": "Últimas unidades",
              "value": "Últimas unidades"
            },
            {
              "label": "Esgotado",
              "value": "Esgotado"
            },
            {
              "label": "Em breve",
              "value": "Em breve"
            },
            {
              "label": "Encerrado",
              "value": "Encerrado"
            }
          ]
        }
      ]
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

-- `eventos` e um GRUPO da taxonomia: vincula todas as categorias dele (e as de palco que tambem aparecem no grupo).
UPDATE public.categories SET form_key = 'eventos'
WHERE (category_group_id = (SELECT id FROM public.categories_group WHERE slug = 'eventos')
   OR slug IN ('teatro', 'humor-e-espetaculos'))
  AND (form_key IS NULL OR form_key = '');

COMMIT;
