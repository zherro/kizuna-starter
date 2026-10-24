-- db/extras/forms_seed_eventos.sql
--
-- Seed do formulario `eventos` (plugin forms). Um anuncio = um evento:
--   - Evento: data, realizador, link, classificacao, gratuito e artistas.
--     Endereco, local cadastrado (`local_ref`) e pontos de venda (`pontos_de_venda`) NAO ficam no formulario:
--     o wizard os edita no passo de endereco (endereco em service_addresses; local e pontos de venda em
--     services.extras, via kizuna.config.json stepProfiles.location.byGroup.eventos.refs).
--     Respostas antigas com essas chaves continuam lidas pela pagina do evento.
--   - Sessoes (`list`): data e horarios de cada dia do evento.
--   - Ingressos (`list`): titulo, setor, tipo, pessoas (= pulseiras), lote, valor (mascara R$) e comprar (texto livre).
--   - Onde comprar: link de ingressos.
--   - Contato: telefone, WhatsApp e e-mail.
--   Meia-entrada, acessibilidade, formas de pagamento e observacoes NAO tem campo: o assistente as resume na
--   descricao do anuncio ("Informacoes uteis").
-- Titulo, descricao, preco, imagens, endereco do local e validade ficam no anuncio (coluna/tabela propria).
-- Categoria/subcategoria e taxonomia, nao formulario.
--
-- O importador (docs/integracoes/eventos-depara.md) grava as respostas direto em public.form_results e pode
-- acrescentar opcoes novas ao campo `ingressos.tipo`.
--
-- DESTRUTIVO (recria): apaga e reinsere o formulario do tenant do root; ABORTA se ja houver respostas.
-- Banco que ja tem respostas: use db/extras/pendentes_forms_eventos.sql (atualiza o schema no lugar).
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
    RAISE EXCEPTION 'recriacao do formulario eventos abortada: ha % resposta(s) em public.form_results. Use db/extras/pendentes_forms_eventos.sql.', v_n;
  END IF;

  DELETE FROM public.forms WHERE tenant_id = v_tenant AND form_key = 'eventos';
END
$clear$;

-- 1) Formulario -------------------------------------------------------------------------------------
INSERT INTO public.forms (tenant_id, form_key, title, description, schema, active, created_by)
SELECT t.uid, 'eventos', 'Eventos — detalhes e ingressos',
       'Data, sessões, ingressos, onde comprar e contato do evento.', $schema$
{
  "title": "Eventos — detalhes e ingressos",
  "description": "Data, sessões, ingressos, onde comprar e contato do evento.",
  "fields": [
    {
      "id": "evt_01_secao_evento", "key": "secao_evento", "name": "secao_evento", "type": "heading", "label": "Evento",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_02_data_inicio", "key": "data_inicio", "name": "data_inicio", "type": "datetime", "label": "Data e hora de início",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
      "behavior": { "required": true }, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_03_data_fim", "key": "data_fim", "name": "data_fim", "type": "datetime", "label": "Data e hora de término",
      "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 6, "xl": 6, "2xl": 6 },
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
      "id": "evt_13_secao_sessoes", "key": "secao_sessoes", "name": "secao_sessoes", "type": "heading", "label": "Datas e horários",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_14_sessoes", "key": "sessoes", "name": "sessoes", "type": "list", "label": "Sessões",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {},
      "itemLabel": "Sessão",
      "itemFields": [
        {
          "id": "ses_data", "key": "data", "name": "data", "type": "date", "label": "Data",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": { "required": true }, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_abertura_portoes", "key": "abertura_portoes", "name": "abertura_portoes", "type": "time", "label": "Abertura dos portões",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_inicio", "key": "hora_inicio", "name": "hora_inicio", "type": "time", "label": "Início",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 3, "xl": 3, "2xl": 3 },
          "behavior": {}, "validation": {}, "appearance": {}
        },
        {
          "id": "ses_hora_fim", "key": "hora_fim", "name": "hora_fim", "type": "time", "label": "Término",
          "grid": { "xs": 12, "sm": 12, "md": 6, "lg": 3, "xl": 3, "2xl": 3 },
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
      "id": "evt_15_secao_compra", "key": "secao_compra", "name": "secao_compra", "type": "heading", "label": "Onde comprar",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}
    },
    {
      "id": "evt_16_link_ingresso", "key": "link_ingresso", "name": "link_ingresso", "type": "url", "label": "Comprar ingresso (link)",
      "grid": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12, "2xl": 12 },
      "behavior": {}, "validation": {}, "appearance": {}, "placeholder": "https://"
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
