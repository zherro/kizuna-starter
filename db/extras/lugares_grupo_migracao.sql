-- db/extras/lugares_grupo_migracao.sql
--
-- Cria o grupo de taxonomia "Lugares" num banco que JÁ TEM anúncios (o seed de taxonomia é destrutivo e
-- aborta nesse caso). Instalação nova: o grupo já vem em db/extras/taxonomy_seed_bora_cuiaba.sql.
--
-- NÃO destrutivo e idempotente (rodar 2x dá o mesmo resultado), numa transação só:
--   1) cria o grupo `lugares`, as 6 categorias e as subcategorias por slug (o que já existe não é editado);
--   2) MOVE para as novas categorias as subcategorias que já existiam com o mesmo conceito, com as tags
--      delas (o id não muda): shoppings, casas-noturnas, museus, centros-culturais, casas-de-festas
--      (pendente, criada pelo import de lugares) e festas-e-buffets-infantis (renomeada para buffets-infantis);
--   3) move os lugares importados (extras.origem.fonte = 'content/lugares') para a nova categoria e
--      refaz public.service_categories_sub deles.
-- Não apaga categoria, subcategoria nem tag de outros grupos. Aborta se um anúncio que NÃO é lugar
-- importado estiver vinculado a uma subcategoria que seria movida (o vínculo dele ficaria inconsistente).
--
-- Depois: db/extras/forms_seed_lugares.sql (form_key das categorias) e, para gravar horário/contato no
-- formato do formulário, node scripts/lugares-para-servicos.mjs + db/extras/lugares_import.sql.
--
-- Aplicar (só banco local/dev até a pessoa responsável liberar):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/lugares_grupo_migracao.sql

BEGIN;

DO $lugares$
DECLARE
  v_root uuid; v_tenant uuid; v_group bigint; v_cat bigint; v_sub bigint; v_n bigint;
  r record;
BEGIN
  SELECT u.uid, t.uid INTO v_root, v_tenant
  FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
  JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lugares: sem usuário root/tenant'; END IF;

  -- 1) Grupo --------------------------------------------------------------------------------------
  INSERT INTO public.categories_group (name, slug, description, tags, icon, sort_order, active, tenant_id, created_by)
  VALUES ('Lugares', 'lugares',
          'Shoppings, casas de festas, parques, museus, estádios e casas noturnas: endereço, horário e contato.',
          'lugar, onde fica, endereço, horário, como chegar', 'MapPin', 15, true, v_tenant, v_root)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_group FROM public.categories_group WHERE slug = 'lugares';

  -- 2) Categorias ---------------------------------------------------------------------------------
  FOR r IN SELECT * FROM (VALUES
      ('Compras', 'compras', 'Shoppings, lojas, feiras e mercados.', 'ShoppingBag'),
      ('Festas e eventos', 'festas-e-eventos', 'Casas de festas, buffets infantis e espaços para eventos.', 'PartyPopper'),
      ('Ao ar livre', 'ao-ar-livre', 'Parques, praças, orlas e mirantes da cidade.', 'Trees'),
      ('Esporte', 'esporte', 'Estádios, arenas e ginásios.', 'Trophy'),
      ('Cultura', 'cultura', 'Museus, teatros e centros culturais.', 'Landmark'),
      ('Vida noturna', 'vida-noturna', 'Casas noturnas e bares.', 'Moon')
    ) AS v(name, slug, description, icon)
  LOOP
    INSERT INTO public.categories (category_group_id, name, slug, description, icon, active, tenant_id, created_by)
    VALUES (v_group, r.name, r.slug, r.description, r.icon, true, v_tenant, v_root)
    ON CONFLICT (slug) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = r.slug AND category_group_id = v_group) THEN
      RAISE EXCEPTION 'lugares: a categoria % já existe em outro grupo', r.slug;
    END IF;
  END LOOP;

  -- 3) Subcategorias existentes que mudam de categoria (mesmo conceito; id e tags preservados) ------
  -- festas-e-buffets-infantis vira buffets-infantis (só se o slug novo ainda não existir).
  UPDATE public.categories_sub SET slug = 'buffets-infantis', name = 'Buffets infantis', updated_at = now()
  WHERE slug = 'festas-e-buffets-infantis'
    AND NOT EXISTS (SELECT 1 FROM public.categories_sub WHERE slug = 'buffets-infantis');

  FOR r IN SELECT * FROM (VALUES
      ('shoppings', 'compras'),
      ('casas-noturnas', 'vida-noturna'),
      ('museus', 'cultura'),
      ('centros-culturais', 'cultura'),
      ('casas-de-festas', 'festas-e-eventos'),
      ('buffets-infantis', 'festas-e-eventos')
    ) AS v(sub_slug, cat_slug)
  LOOP
    SELECT id INTO v_cat FROM public.categories WHERE slug = r.cat_slug;
    SELECT id INTO v_sub FROM public.categories_sub WHERE slug = r.sub_slug AND category_id <> v_cat;
    CONTINUE WHEN v_sub IS NULL;  -- não existe ou já está no lugar

    SELECT count(*) INTO v_n
    FROM public.service_categories_sub scs JOIN public.services s ON s.id = scs.service_id
    WHERE scs.category_sub_id = v_sub
      AND coalesce(s.extras->'origem'->>'fonte', '') <> 'content/lugares';
    IF v_n > 0 THEN
      RAISE EXCEPTION 'lugares: % anúncio(s) fora dos lugares importados usam a subcategoria %; revise antes de mover', v_n, r.sub_slug;
    END IF;

    UPDATE public.categories_sub SET category_id = v_cat, updated_at = now() WHERE id = v_sub;
    UPDATE public.categories_sub_tags SET category_id = v_cat, updated_at = now() WHERE category_sub_id = v_sub;
    RAISE NOTICE 'lugares: subcategoria % movida para %', r.sub_slug, r.cat_slug;
  END LOOP;

  -- 4) Subcategorias novas ------------------------------------------------------------------------
  FOR r IN SELECT * FROM (VALUES
      ('compras', 'Shoppings', 'shoppings', 'Lojas, praça de alimentação e cinema em um só lugar.', 'praça de alimentação, estacionamento, cinema, lojas'),
      ('compras', 'Lojas', 'lojas', 'Lojas de rua, galerias e lojas de departamento.', 'loja, galeria, comércio, centro'),
      ('compras', 'Feiras & mercados', 'feiras-e-mercados', 'Mercados municipais e feiras fixas.', 'mercado, feira, mercado do porto, hortifrúti'),
      ('festas-e-eventos', 'Casas de festas', 'casas-de-festas', 'Espaços para alugar: aniversários, casamentos, encontros de família e confraternizações.', 'casa de festas, salão de festas, locação de espaço, aniversário, casamento, confraternização'),
      ('festas-e-eventos', 'Buffets infantis', 'buffets-infantis', 'Buffets e espaços para aniversários.', 'buffet, aniversário, recreação, decoração'),
      ('festas-e-eventos', 'Espaços de eventos', 'espacos-de-eventos', 'Centros de convenções, salões e espaços para eventos corporativos e shows.', 'centro de eventos, convenções, salão, corporativo'),
      ('ao-ar-livre', 'Parques', 'parques', 'Parques da cidade para caminhar, correr e levar as crianças.', 'parque, caminhada, mãe bonifácia, massairo okamura'),
      ('ao-ar-livre', 'Praças', 'pracas', 'Praças com sombra, feirinha e programação.', 'praça, centro, feirinha, sombra'),
      ('ao-ar-livre', 'Orlas & mirantes', 'orlas-e-mirantes', 'Orlas de rio e mirantes para ver o pôr do sol.', 'orla do porto, mirante, pôr do sol, vista'),
      ('esporte', 'Estádios & arenas', 'estadios-e-arenas', 'Estádios e arenas de jogos e shows.', 'estádio, arena pantanal, verdão, jogo'),
      ('esporte', 'Ginásios', 'ginasios', 'Ginásios poliesportivos e quadras cobertas.', 'ginásio, quadra coberta, aecim tocantins, poliesportivo'),
      ('cultura', 'Museus', 'museus', 'Museus de história, arte sacra, ciência e cultura regional.', 'museu do rio, arte sacra, história, exposição permanente'),
      ('cultura', 'Teatros', 'teatros', 'Teatros e salas de espetáculo.', 'teatro, palco, cine teatro, espetáculo'),
      ('cultura', 'Centros culturais', 'centros-culturais', 'Espaços com programação de teatro, música, cinema e oficinas.', 'programação, oficina, sesc arsenal, gratuito'),
      ('vida-noturna', 'Casas noturnas', 'casas-noturnas', 'Casas com pista, DJ e programação semanal.', 'pista, dj, dress code, camarote'),
      ('vida-noturna', 'Bares', 'bares', 'Bares e botecos com endereço fixo.', 'bar, boteco, chope, mesa na calçada')
    ) AS v(cat_slug, name, slug, description, tags)
  LOOP
    SELECT id INTO v_cat FROM public.categories WHERE slug = r.cat_slug;
    INSERT INTO public.categories_sub (category_id, name, slug, description, tags, active, tenant_id, created_by)
    VALUES (v_cat, r.name, r.slug, r.description, r.tags, true, v_tenant, v_root)
    ON CONFLICT (slug) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.categories_sub WHERE slug = r.slug AND category_id = v_cat) THEN
      RAISE EXCEPTION 'lugares: a subcategoria % existe sob outra categoria', r.slug;
    END IF;
  END LOOP;

  -- 5) Lugares importados -> nova categoria/subcategorias ---------------------------------------------
  FOR r IN SELECT v.lugar, v.cat_slug, v.subs, s.id AS sid, c.id AS cat_id
    FROM (VALUES
      ('lua-morena', 'vida-noturna', ARRAY['casas-noturnas']),
      ('arena-pantanal', 'esporte', ARRAY['estadios-e-arenas']),
      ('goiabeiras-shopping', 'compras', ARRAY['shoppings']),
      ('pantanal-shopping', 'compras', ARRAY['shoppings']),
      ('shopping-estacao-cuiaba', 'compras', ARRAY['shoppings']),
      ('shopping-tres-americas', 'compras', ARRAY['shoppings']),
      ('buffet-infantil-mundo-magico', 'festas-e-eventos', ARRAY['buffets-infantis']),
      ('espaco-art-festas-e-eventos', 'festas-e-eventos', ARRAY['casas-de-festas'])
    ) AS v(lugar, cat_slug, subs)
    JOIN public.categories c ON c.slug = v.cat_slug
    JOIN public.services s ON s.tenant_id = v_tenant
      AND s.extras->'origem'->>'fonte' = 'content/lugares' AND s.extras->'origem'->>'slug' = v.lugar
  LOOP
    UPDATE public.services SET category_group_id = v_group, category_id = r.cat_id, updated_at = now()
    WHERE id = r.sid AND (category_group_id IS DISTINCT FROM v_group OR category_id IS DISTINCT FROM r.cat_id);

    DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
    WHERE scs.service_id = r.sid AND cs.id = scs.category_sub_id
      AND (cs.category_id <> r.cat_id OR cs.slug <> ALL(r.subs));
    -- vínculo a uma sub movida: grupo/categoria antigos na linha
    UPDATE public.service_categories_sub SET category_group_id = v_group, category_id = r.cat_id
    WHERE service_id = r.sid AND (category_group_id <> v_group OR category_id <> r.cat_id);
    INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
    SELECT r.sid, v_group, r.cat_id, cs.id, v_tenant, v_root
    FROM public.categories_sub cs WHERE cs.category_id = r.cat_id AND cs.slug = ANY(r.subs)
    ON CONFLICT (service_id, category_sub_id) DO NOTHING;
    RAISE NOTICE 'lugares/%: % (service id %)', r.lugar, r.cat_slug, r.sid;
  END LOOP;
END
$lugares$;

COMMIT;

NOTIFY pgrst, 'reload schema';
