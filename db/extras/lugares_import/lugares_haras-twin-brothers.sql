-- db/extras/lugares_import/lugares_haras-twin-brothers.sql
-- GERADO por scripts/lugares-para-servicos.mjs — não edite à mão; rode o script de novo.
-- De-para: docs/integracoes/lugares-depara.md
--
-- Grava artigos de content/lugares/ como anúncios (public.services) no tenant do usuário root:
-- haras-twin-brothers — 0 foto(s). Status no INSERT: 'pending' (o dono aprova no painel).
-- Idempotente: o anúncio é achado por extras.origem (fonte = 'content/lugares', slug); rodar de novo
-- atualiza, não duplica. Fotos têm id determinístico pelo conteúdo (sha256).
-- Uma transação por arquivo: qualquer erro desfaz o arquivo inteiro. Os arquivos são independentes.
--
-- Pré-requisitos: core + plugins instalados, root cadastrado, grupo "lugares" na taxonomia
-- (db/extras/taxonomy_seed_bora_cuiaba.sql ou, em banco com anúncios, db/extras/lugares_grupo_migracao.sql),
-- formulário db/extras/forms_seed_lugares.sql e, para o código IBGE, db/extras/location_seed_bora_cuiaba.sql.
-- Atenção: depois deste import existem serviços, e o seed de taxonomia (destrutivo) passa a abortar.
--
-- Aplicar:
--   node kizuna-core/cli db run db/extras/lugares_import/lugares_haras-twin-brothers.sql          (usa $DATABASE_URL; ou --db-url <url>)
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/lugares_import/lugares_haras-twin-brothers.sql

BEGIN;

-- Haras Twin Brothers (content/lugares/haras-twin-brothers/index.md) — 0 foto(s)
DO $lugar_1$
DECLARE
  c_slug      constant text   := 'haras-twin-brothers';
  c_extras    constant jsonb  := '{"origem":{"fonte":"content/lugares","slug":"haras-twin-brothers","arquivo":"content/lugares/haras-twin-brothers/index.md","atualizado_em":"2026-10-29","status_artigo":"revisao","categoria_artigo":"Haras e escola de equitação","cidade":"cuiaba-mt","titulo_md5":"5bb5e28b0f578c036459d3859ee3138a","descricao_md5":"e688c386d57921c176d0885b0b7cb185"},"resumo":"Haras em Cuiabá fundado em 2000 pelos irmãos Marco e Carlos Póvoas, com escola de equitação, equoterapia, laço, tambor e eventos hípicos.","endereco_texto":"Rua Trinta e Sete, s/n, Santa Cruz II, Cuiabá - MT","tags":["hipismo","local:haras-twin-brothers"],"codigo":"haras-twin-brothers"}'::jsonb;
  c_titulo    constant text   := 'Haras Twin Brothers';
  c_descricao constant text   := '<p>O Haras Twin Brothers é um haras de Cuiabá dedicado a cavalos e a quem quer aprender a montar. Fica na Rua Trinta e Sete, no bairro Santa Cruz II, e reúne criação de cavalos, escola de equitação e eventos hípicos.</p>

<h2>História</h2>
<p>O haras foi fundado em 2000 pelos irmãos Marco e Carlos Póvoas. A empresa por trás dele é a Sociedade Hípica Cuiabana Póvoas &amp; Corrêa.</p>

<h2>O que tem</h2>
<ul>
  <li><strong>Escola de equitação</strong> para crianças, jovens e adultos;</li>
  <li><strong>Equoterapia</strong>, terapia com cavalos para crianças, jovens e adultos;</li>
  <li><strong>Modalidades de prova:</strong> laço, tambor e baliza;</li>
  <li><strong>Criação de cavalos</strong>, com trabalho de melhoramento genético;</li>
  <li><strong>Eventos hípicos</strong> e provas equestres.</li>
</ul>

<h2>Antes de ir</h2>
<p>Horários, valores das aulas e a agenda de provas mudam ao longo do ano. Confirme direto com o haras antes de ir, principalmente para matricular crianças na escolinha ou agendar a equoterapia.</p>

<p><small>Fontes: CAA/MT (notícia de 21/09/2012), Mato Grosso Mais (24/04/2024) e cadastro público de empresas; consultados em 29/10/2026.</small></p>';
  c_images    constant text[] := ARRAY[]::text[];
  c_subs      constant text[] := ARRAY[]::text[];
  c_answers   constant jsonb  := '{}'::jsonb;
  c_form_keys constant text[] := ARRAY['horario', 'preco', 'gratuito', 'dicas_chegada', 'contato_telefone', 'contato_whatsapp', 'contato_instagram', 'site']::text[];
  v_root uuid; v_tenant uuid; v_group bigint; v_cat bigint; v_form text; v_form_id bigint; v_form_ver int; v_form_schema jsonb;
  v_sid bigint; v_old jsonb; v_old_titulo text; v_old_desc text;
  v_old_import text[]; v_kept text[]; v_images jsonb; v_cover text; v_ibge text; v_missing text[];
BEGIN
  SELECT u.uid, t.uid INTO v_root, v_tenant
  FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
  JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lugares: sem usuário root/tenant'; END IF;

  SELECT g.id, c.id, NULLIF(c.form_key, '') INTO v_group, v_cat, v_form
  FROM public.categories c JOIN public.categories_group g ON g.id = c.category_group_id
  WHERE g.slug = 'lugares' AND c.slug = 'esporte';
  IF v_cat IS NULL THEN RAISE EXCEPTION 'lugares/%: categoria lugares/esporte não existe (rode o seed de taxonomia)', c_slug; END IF;
  IF v_form IS NULL THEN
    RAISE NOTICE 'lugares/%: a categoria não tem form_key (rode db/extras/forms_seed_lugares.sql); horário/contato só em services.extras', c_slug;
  ELSE
    SELECT id, version, schema INTO v_form_id, v_form_ver, v_form_schema
    FROM public.forms WHERE tenant_id = v_tenant AND form_key = v_form AND active;
    IF v_form_id IS NULL THEN RAISE EXCEPTION 'lugares/%: formulário % não existe no tenant', c_slug, v_form; END IF;
  END IF;

  SELECT array_agg(s) INTO v_missing FROM unnest(c_subs) s
  WHERE NOT EXISTS (SELECT 1 FROM public.categories_sub cs WHERE cs.slug = s AND cs.category_id = v_cat);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'lugares/%: subcategoria(s) % não existem sob esporte', c_slug, v_missing; END IF;

  -- Fotos (id determinístico pelo conteúdo: rodar de novo não duplica)
  -- (sem fotos)

  -- Serviço existente? (chave: extras.origem.fonte + slug; inclui inativo, que não é reativado)
  SELECT id, extras, title, description INTO v_sid, v_old, v_old_titulo, v_old_desc
  FROM public.services
  WHERE tenant_id = v_tenant AND extras->'origem'->>'fonte' = 'content/lugares' AND extras->'origem'->>'slug' = c_slug
  ORDER BY id LIMIT 1;

  -- Imagens: as do artigo primeiro; as que alguém subiu pelo painel continuam depois
  SELECT coalesce(array_agg(x), '{}') INTO v_old_import
  FROM (SELECT f->>'fileId' AS x FROM jsonb_array_elements(coalesce(v_old->'origem'->'fotos', '[]'::jsonb)) f) y;
  SELECT coalesce(array_agg(x ORDER BY o), '{}') INTO v_kept
  FROM jsonb_array_elements_text(coalesce(v_old->'images', '[]'::jsonb)) WITH ORDINALITY AS a(x, o)
  WHERE x <> ALL(v_old_import) AND x <> ALL(c_images);
  v_images := to_jsonb(c_images || v_kept);
  v_cover := CASE
    WHEN v_old->>'coverFileId' IS NOT NULL AND v_old->>'coverFileId' <> ALL(v_old_import)
         AND (c_images || v_kept) @> ARRAY[v_old->>'coverFileId'] THEN v_old->>'coverFileId'
    ELSE (c_images || v_kept)[1] END;

  -- Foto que saiu do artigo: desativa o arquivo antigo
  UPDATE public.files SET active = false, updated_at = now()
  WHERE id::text = ANY(v_old_import) AND id::text <> ALL(c_images) AND active;

  IF v_sid IS NULL THEN
    INSERT INTO public.services
      (title, category_group_id, category_id, description, starting_price, price_unit, status,
       service_location, extras, tenant_id, created_by, active)
    VALUES (c_titulo, v_group, v_cat, c_descricao, 0, 'quote', 'pending'::public.service_status,
            'no_estabelecimento',
            c_extras || jsonb_strip_nulls(jsonb_build_object('images', CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images END, 'coverFileId', v_cover)),
            v_tenant, v_root, true)
    RETURNING id INTO v_sid;
    RAISE NOTICE 'lugares/%: inserido (service id %)', c_slug, v_sid;
  ELSE
    -- Título/descrição só mudam se ninguém os editou desde o último import (md5 guardado em extras.origem)
    UPDATE public.services SET
      title = CASE WHEN v_old->'origem'->>'titulo_md5' IS NULL OR md5(v_old_titulo) = v_old->'origem'->>'titulo_md5'
                   THEN c_titulo ELSE title END,
      description = CASE WHEN v_old->'origem'->>'descricao_md5' IS NULL OR md5(coalesce(v_old_desc, '')) = v_old->'origem'->>'descricao_md5'
                         THEN c_descricao ELSE description END,
      category_group_id = v_group, category_id = v_cat,
      extras = (extras - 'origem' - 'resumo' - 'endereco_texto' - 'contato' - c_form_keys
                       - 'creditos' - 'tags' - 'codigo' - 'vinculosTitulo' - 'images' - 'coverFileId')
               || jsonb_set(c_extras, '{origem}', (c_extras->'origem')
                    || jsonb_build_object(
                         'titulo_md5', CASE WHEN v_old->'origem'->>'titulo_md5' IS NULL OR md5(v_old_titulo) = v_old->'origem'->>'titulo_md5'
                                            THEN c_extras->'origem'->>'titulo_md5' ELSE v_old->'origem'->>'titulo_md5' END,
                         'descricao_md5', CASE WHEN v_old->'origem'->>'descricao_md5' IS NULL OR md5(coalesce(v_old_desc, '')) = v_old->'origem'->>'descricao_md5'
                                               THEN c_extras->'origem'->>'descricao_md5' ELSE v_old->'origem'->>'descricao_md5' END))
               || jsonb_strip_nulls(jsonb_build_object('images', CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images END, 'coverFileId', v_cover)),
      updated_at = now()
    WHERE id = v_sid;
    RAISE NOTICE 'lugares/%: atualizado (service id %)', c_slug, v_sid;
  END IF;

  -- Endereço (apaga os do anúncio e grava um, principal)
  DELETE FROM public.service_addresses WHERE service_id = v_sid;
  BEGIN
    SELECT lc.id::text INTO v_ibge FROM public.location_city lc JOIN public.location_state ls ON ls.id = lc.state_id
    WHERE lower(lc.name) = lower('Cuiabá') AND upper(ls.code) = 'MT' LIMIT 1;
  EXCEPTION WHEN undefined_table THEN v_ibge := NULL;
  END;
  IF v_ibge IS NULL THEN RAISE NOTICE 'lugares/%: cidade % / % sem código IBGE em location_city', c_slug, 'Cuiabá', 'MT'; END IF;
  INSERT INTO public.service_addresses
    (service_id, label, street, number, complement, neighborhood, city, state, city_ibge,
     latitude, longitude, is_primary, tenant_id, created_by, active)
  VALUES (v_sid, c_titulo, 'Rua Trinta e Sete', 's/n', NULL, 'Santa Cruz II', 'Cuiabá', 'MT', v_ibge,
          NULL, NULL, true, v_tenant, v_root, true);

  -- Respostas do formulário (mesmas chaves de extras)
  IF v_form_id IS NOT NULL THEN
    INSERT INTO public.form_results
      (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
    VALUES (v_form_id, v_form, v_sid::text, 'service', v_form_ver, v_form_schema, c_answers, v_root, v_tenant)
    ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
      answers = EXCLUDED.answers, version = EXCLUDED.version, schema_snapshot = EXCLUDED.schema_snapshot,
      form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now();
  END IF;

  -- Subcategorias
  DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
  WHERE scs.service_id = v_sid AND cs.id = scs.category_sub_id
    AND (cs.category_id <> v_cat OR cs.slug <> ALL(c_subs));
  INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
  SELECT v_sid, v_group, v_cat, cs.id, v_tenant, v_root
  FROM public.categories_sub cs WHERE cs.category_id = v_cat AND cs.slug = ANY(c_subs)
  ON CONFLICT (service_id, category_sub_id) DO NOTHING;
END
$lugar_1$;

COMMIT;
