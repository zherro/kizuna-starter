-- db/extras/reorganiza_eventos.sql
-- Reorganiza o grupo "Eventos" por FORMATO do evento. Os temas viram subcategorias:
--
--   Eventos
--   ├─ Shows                  (shows-e-musica-ao-vivo)
--   ├─ Festas                 (festas-e-baladas)      ← absorve festas-tradicionais-e-religiosas
--   ├─ Festivais & Feiras     (festivais-e-exposicoes)
--   ├─ Teatro & Espetáculos   (teatro)                ← absorve humor-e-espetaculos; sai do grupo
--   │                                                    teatro-e-espetaculos e entra em Eventos
--   └─ Palestras & Cursos     (palestras-e-encontros)
--
-- Os SLUGS das categorias que ficam não mudam: o assistente do crawler, o de-para e o
-- kizuna.config.json referenciam esses slugs. Só nome, descrição, ícone e grupo mudam.
--
-- O que acontece com os dados:
-- * subcategorias (e as tags delas) das categorias fundidas passam para a categoria de destino;
-- * anúncios (services), vínculos de subcategoria (service_categories_sub) e demandas das
--   categorias fundidas passam para a categoria de destino;
-- * todo anúncio das 5 categorias passa a ter category_group_id = Eventos;
-- * as categorias fundidas e o grupo "Teatro & Espetáculos" ficam INATIVOS (não são apagados).
--
-- Seguro rodar de novo (idempotente). Uma transação só: qualquer erro desfaz tudo.
--   node kizuna-core/cli db run db/extras/reorganiza_eventos.sql
-- Rode ANTES, para conferir o que vai mudar, o bloco "Prévia" no fim deste arquivo.

BEGIN;

DO $reorg$
DECLARE
  v_eventos bigint;
  v_teatro_grupo bigint;
  v_from bigint;
  v_to bigint;
  v_n int;
  m record;
BEGIN
  SELECT id INTO v_eventos FROM public.categories_group WHERE slug = 'eventos';
  IF v_eventos IS NULL THEN
    RAISE EXCEPTION 'grupo "eventos" não existe: nada foi alterado';
  END IF;
  SELECT id INTO v_teatro_grupo FROM public.categories_group WHERE slug = 'teatro-e-espetaculos';

  -- 1) Categorias que ficam: nome, descrição, ícone, grupo Eventos, formulário de eventos.
  UPDATE public.categories c
     SET name = v.name, description = v.description, icon = v.icon,
         category_group_id = v_eventos, form_key = 'eventos', active = true, updated_at = now()
    FROM (VALUES
      ('shows-e-musica-ao-vivo', 'Shows',                'Shows e música ao vivo de todos os estilos, dos grandes palcos aos barzinhos.', 'Music'),
      ('festas-e-baladas',       'Festas',               'Baladas, festas temáticas e as festas tradicionais e religiosas da região.',  'PartyPopper'),
      ('festivais-e-exposicoes', 'Festivais & Feiras',   'Festivais, feiras, exposições agropecuárias e eventos de vários dias.',      'Ticket'),
      ('teatro',                 'Teatro & Espetáculos', 'Peças, stand-up, dança, circo e espetáculos de palco.',                     'Drama'),
      ('palestras-e-encontros',  'Palestras & Cursos',   'Palestras, workshops, congressos e encontros de networking.',               'Presentation')
    ) AS v(slug, name, description, icon)
   WHERE c.slug = v.slug;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'categorias atualizadas: %', v_n;

  -- 2) Fusões: tudo da categoria de origem vai para a de destino.
  FOR m IN
    SELECT * FROM (VALUES
      ('festas-tradicionais-e-religiosas', 'festas-e-baladas'),
      ('humor-e-espetaculos',              'teatro')
    ) AS t(from_slug, to_slug)
  LOOP
    SELECT id INTO v_from FROM public.categories WHERE slug = m.from_slug;
    SELECT id INTO v_to   FROM public.categories WHERE slug = m.to_slug;
    IF v_from IS NULL OR v_to IS NULL THEN
      RAISE NOTICE 'fusão % -> %: categoria ausente, pulada', m.from_slug, m.to_slug;
      CONTINUE;
    END IF;

    UPDATE public.categories_sub SET category_id = v_to, updated_at = now() WHERE category_id = v_from;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'fusão % -> %: % subcategoria(s)', m.from_slug, m.to_slug, v_n;

    UPDATE public.categories_sub_tags SET category_id = v_to WHERE category_id = v_from;

    UPDATE public.service_categories_sub
       SET category_id = v_to, category_group_id = v_eventos, updated_at = now()
     WHERE category_id = v_from;

    UPDATE public.services
       SET category_id = v_to, category_group_id = v_eventos, updated_at = now()
     WHERE category_id = v_from;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'fusão % -> %: % anúncio(s)', m.from_slug, m.to_slug, v_n;

    UPDATE public.demanda SET category_id = v_to WHERE category_id = v_from;

    DELETE FROM public.categories_group_link WHERE category_id = v_from;
    UPDATE public.categories SET active = false, updated_at = now() WHERE id = v_from;
  END LOOP;

  -- 3) Anúncios das 5 categorias ficam no grupo Eventos (teatro vinha de Teatro & Espetáculos).
  UPDATE public.services s
     SET category_group_id = v_eventos, updated_at = now()
    FROM public.categories c
   WHERE c.id = s.category_id
     AND c.slug IN ('shows-e-musica-ao-vivo', 'festas-e-baladas', 'festivais-e-exposicoes',
                    'teatro', 'palestras-e-encontros')
     AND s.category_group_id IS DISTINCT FROM v_eventos;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'anúncios movidos para o grupo Eventos: %', v_n;

  UPDATE public.service_categories_sub scs
     SET category_group_id = v_eventos, updated_at = now()
    FROM public.categories c
   WHERE c.id = scs.category_id
     AND c.slug IN ('shows-e-musica-ao-vivo', 'festas-e-baladas', 'festivais-e-exposicoes',
                    'teatro', 'palestras-e-encontros')
     AND scs.category_group_id IS DISTINCT FROM v_eventos;

  -- 4) Vínculos secundários: teatro já é de Eventos (o vínculo com Eventos sobra); festas de
  --    santo e juninas continuam aparecendo em Cultura & Arte, agora via Festas.
  DELETE FROM public.categories_group_link l
   USING public.categories c
   WHERE c.id = l.category_id AND l.category_group_id = v_eventos
     AND c.slug IN ('shows-e-musica-ao-vivo', 'festas-e-baladas', 'festivais-e-exposicoes',
                    'teatro', 'palestras-e-encontros');

  INSERT INTO public.categories_group_link (category_id, category_group_id, tenant_id, created_by)
  SELECT c.id, g.id, c.tenant_id, c.created_by
    FROM public.categories c
    JOIN public.categories_group g ON g.slug = 'cultura-e-arte'
   WHERE c.slug = 'festas-e-baladas'
  ON CONFLICT ON CONSTRAINT categories_group_link_unique DO NOTHING;

  -- 5) Grupo Teatro & Espetáculos sai de cena (fica inativo, sem vínculos).
  IF v_teatro_grupo IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.categories
                WHERE category_group_id = v_teatro_grupo AND active) THEN
      RAISE NOTICE 'grupo teatro-e-espetaculos ainda tem categoria ativa: mantido ativo';
    ELSE
      DELETE FROM public.categories_group_link WHERE category_group_id = v_teatro_grupo;
      UPDATE public.categories_group SET active = false, updated_at = now() WHERE id = v_teatro_grupo;
      RAISE NOTICE 'grupo teatro-e-espetaculos desativado';
    END IF;
  END IF;
END
$reorg$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Prévia (só leitura; rode antes para ver o que cada categoria tem):
-- select c.slug, c.name, g.slug grupo, c.active,
--   (select count(*) from categories_sub cs where cs.category_id = c.id) subcats,
--   (select count(*) from services s where s.category_id = c.id) anuncios
-- from categories c left join categories_group g on g.id = c.category_group_id
-- where c.slug in ('shows-e-musica-ao-vivo','festas-e-baladas','festas-tradicionais-e-religiosas',
--   'festivais-e-exposicoes','palestras-e-encontros','teatro','humor-e-espetaculos')
-- order by 1;
