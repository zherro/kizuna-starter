-- db/extras/pendentes_forms_eventos.sql
--
-- Atualiza o formulario `eventos` de um banco existente para o schema de db/extras/forms_seed_eventos.sql
-- (sessoes, ingressos com setor/tipo/pessoas/lote/comprar e contato; endereco, local_ref e
-- pontos_de_venda sairam do formulario: ficam no passo de endereco do wizard; link_ingresso saiu), sem apagar
-- o formulario nem as respostas. As chaves antigas continuam iguais; as respostas ja gravadas seguem validas.
-- O trigger do plugin forms incrementa `version`. Opcoes acrescentadas pelo importador sao substituidas
-- pelas do seed (o importador as acrescenta de novo na proxima Fase 1).
-- Gerado a partir do seed: ao mudar o seed, regenere este arquivo (mesmo conteudo, sem o bloco 0).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/pendentes_forms_eventos.sql

BEGIN;


-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'eventos', 'Eventos — detalhes e ingressos',
       'Horários, ingressos, onde comprar e contato do evento.', $schema$
{
  "title": "Eventos — detalhes e ingressos",
  "description": "Horários, ingressos, onde comprar e contato do evento.",
  "fields": [
    {
      "id": "evt_01_secao_evento", "key": "secao_evento", "name": "secao_evento", "type": "heading", "label": "Evento",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_04_realizador", "key": "realizador", "name": "realizador", "type": "text", "label": "Realizador",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Quem organiza o evento"
    },
    {
      "id": "evt_05_link", "key": "link", "name": "link", "type": "url", "label": "Link do evento",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "https://"
    },
    {
      "id": "evt_10_classificacao_indicativa", "key": "classificacao_indicativa", "name": "classificacao_indicativa", "type": "select", "label": "Classificação indicativa",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {},
      "options": [
        { "label": "Livre", "value": "Livre" },
        { "label": "10 anos", "value": "10 anos" },
        { "label": "12 anos", "value": "12 anos" },
        { "label": "14 anos", "value": "14 anos" },
        { "label": "16 anos", "value": "16 anos" },
        { "label": "18 anos", "value": "18 anos" }
      ]
    },
    {
      "id": "evt_11_gratuito", "key": "gratuito", "name": "gratuito", "type": "switch", "label": "Evento gratuito",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_12_artistas", "key": "artistas", "name": "artistas", "type": "list", "label": "Artistas e atrações",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Atração",
      "itemFields": [
        {
          "id": "art_nome", "key": "nome", "name": "nome", "type": "text", "label": "Nome",
          "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
          "behavior": { "required": true }, "validation": {}, "appearance": {}
        }
      ]
    },
    {
      "id": "evt_13_secao_sessoes", "key": "secao_sessoes", "name": "secao_sessoes", "type": "heading", "label": "Horários",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_14_sessoes", "key": "sessoes", "name": "sessoes", "type": "list", "label": "Horários",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Horário",
      "itemFields": [
        {
          "id": "ses_abertura_portoes", "key": "abertura_portoes", "name": "abertura_portoes", "type": "time", "label": "Abertura dos portões",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_inicio", "key": "hora_inicio", "name": "hora_inicio", "type": "time", "label": "Início",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_fim", "key": "hora_fim", "name": "hora_fim", "type": "time", "label": "Término",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 4, "xl": 4, "2xl": 4 },
          "behavior": {}, "validation": {}, "appearance": {}
        }
      ]
    },
    {
      "id": "evt_07_secao_ingressos", "key": "secao_ingressos", "name": "secao_ingressos", "type": "heading", "label": "Ingressos",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_08_ingressos", "key": "ingressos", "name": "ingressos", "type": "list", "label": "Tabela de ingressos",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Ingresso",
      "itemFields": [
        {
          "id": "ing_titulo", "key": "titulo", "name": "titulo", "type": "text", "label": "Título",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": { "required": true }, "validation": {}, "appearance": {}, "placeholder": "Ex.: Pista — 1º lote"
        },
        {
          "id": "ing_setor", "key": "setor", "name": "setor", "type": "text", "label": "Setor",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: Pista, Camarote, Mesa"
        },
        {
          "id": "ing_tipo", "key": "tipo", "name": "tipo", "type": "select", "label": "Tipo",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": {}, "appearance": {},
          "options": [
            { "label": "Inteira", "value": "Inteira" },
            { "label": "Meia", "value": "Meia" },
            { "label": "Social", "value": "Social" },
            { "label": "Promocional", "value": "Promocional" },
            { "label": "Cortesia", "value": "Cortesia" }
          ]
        },
        {
          "id": "ing_pessoas", "key": "pessoas", "name": "pessoas", "type": "number", "label": "Pessoas",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": { "min": 1 }, "appearance": {}
        },
        {
          "id": "ing_lote", "key": "lote", "name": "lote", "type": "text", "label": "Lote",
          "grid": { "xs": 12, "sm": 12, "md": 4, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: 1º lote"
        },
        {
          "id": "ing_valor", "key": "valor", "name": "valor", "type": "currency", "label": "Valor",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "R$ 0,00"
        },
        {
          "id": "ing_comprar", "key": "comprar", "name": "comprar", "type": "text", "label": "Comprar",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
          "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "Ex.: comprar no site, link ou ponto de venda"
        }
      ]
    },
    {
      "id": "evt_21_secao_contato", "key": "secao_contato", "name": "secao_contato", "type": "heading", "label": "Contato",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_22_contato_telefone", "key": "contato_telefone", "name": "contato_telefone", "type": "phone", "label": "Telefone",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_23_contato_whatsapp", "key": "contato_whatsapp", "name": "contato_whatsapp", "type": "phone", "label": "WhatsApp",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_24_contato_email", "key": "contato_email", "name": "contato_email", "type": "email", "label": "E-mail",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": {}, "validation": {}, "appearance": {}
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
