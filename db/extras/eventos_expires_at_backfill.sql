-- db/extras/eventos_expires_at_backfill.sql
-- "Acontece em" dos eventos = services.expires_at.
--
-- O formulário de eventos passou a pedir a data em que o evento acontece (passo "Detalhes do
-- evento", campo "Acontece em", kizuna.config.json stepProfiles["dynamic-form"].byGroup.eventos).
-- Esse campo grava services.expires_at: o instante é o FIM do dia escolhido, no horário de
-- Cuiabá (23:59:59.999), e é o que o card e o detalhe passam a mostrar.
--
-- Este script preenche o expires_at dos eventos que já existem a partir das respostas do
-- formulário (form_results.answers), com a mesma regra que o detalhe usa para saber se o evento
-- acabou (eventEnd): vale o ÚLTIMO dia conhecido entre
--   data_inicio, data_fim e sessoes[].data
-- Evento sem nenhuma dessas datas não é tocado (continua com o expires_at que tinha).
--
-- Só mexe em anúncios do grupo "eventos". Idempotente: rodar de novo recalcula o mesmo valor.
-- Uma transação só.
--   node kizuna-core/cli db run db/extras/eventos_expires_at_backfill.sql
-- Rode ANTES o bloco "Prévia" (no fim deste arquivo) para conferir o que vai mudar.

BEGIN;

-- 'AAAA-MM-DD' → date; data que não existe no calendário vira NULL em vez de derrubar o script.
CREATE FUNCTION pg_temp.dia_valido(p text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  RETURN p::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$f$;

WITH datas AS (
  SELECT
    s.id AS service_id,
    -- dia (AAAA-MM-DD) de cada resposta de data; texto que não é data é ignorado
    ARRAY_REMOVE(
      ARRAY[
        CASE WHEN fr.answers->>'data_inicio' ~ '^\d{4}-\d{2}-\d{2}'
             THEN left(fr.answers->>'data_inicio', 10) END,
        CASE WHEN fr.answers->>'data_fim' ~ '^\d{4}-\d{2}-\d{2}'
             THEN left(fr.answers->>'data_fim', 10) END
      ]
      || COALESCE(
        (SELECT array_agg(left(sess->>'data', 10))
           FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(fr.answers->'sessoes') = 'array'
                       THEN fr.answers->'sessoes' ELSE '[]'::jsonb END
                ) sess
          WHERE jsonb_typeof(sess) = 'object'
            AND sess->>'data' ~ '^\d{4}-\d{2}-\d{2}'),
        ARRAY[]::text[]
      ),
      NULL
    ) AS dias
  FROM public.services s
  JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
  JOIN public.form_results fr
    ON fr.domain = 'service' AND fr.reference_id = s.id::text
),
ultimo AS (
  SELECT
    d.service_id,
    -- ISO de texto ordena como data; o maior é o último dia
    (SELECT max(x) FROM unnest(d.dias) x WHERE pg_temp.dia_valido(x) IS NOT NULL) AS dia
  FROM datas d
  WHERE cardinality(d.dias) > 0
),
novo AS (
  SELECT
    u.service_id,
    -- fim do dia no horário de Cuiabá; dia que o calendário não aceita (ex.: 2026-02-31) sai
    CASE WHEN pg_temp.dia_valido(u.dia) IS NOT NULL
         THEN ((pg_temp.dia_valido(u.dia) + 1)::timestamp AT TIME ZONE 'America/Cuiaba')
              - interval '1 millisecond'
    END AS expires_at
  FROM ultimo u
)
UPDATE public.services s
   SET expires_at = n.expires_at,
       updated_at = now()
  FROM novo n
 WHERE s.id = n.service_id
   AND n.expires_at IS NOT NULL
   AND s.expires_at IS DISTINCT FROM n.expires_at;

COMMIT;

-- ---------------------------------------------------------------------------
-- Prévia (rode antes do script; não altera nada): como o expires_at fica em cada evento.
--
-- SELECT s.id, s.title, s.expires_at AS atual,
--        fr.answers->>'data_inicio' AS data_inicio,
--        fr.answers->>'data_fim'    AS data_fim,
--        jsonb_path_query_array(fr.answers, '$.sessoes[*].data') AS sessoes
--   FROM public.services s
--   JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
--   LEFT JOIN public.form_results fr
--     ON fr.domain = 'service' AND fr.reference_id = s.id::text
--  ORDER BY s.id;
--
-- Eventos sem nenhuma data nas respostas (não serão alterados):
--
-- SELECT s.id, s.title, s.expires_at
--   FROM public.services s
--   JOIN public.categories_group g ON g.id = s.category_group_id AND g.slug = 'eventos'
--   LEFT JOIN public.form_results fr
--     ON fr.domain = 'service' AND fr.reference_id = s.id::text
--  WHERE fr.answers->>'data_inicio' IS NULL
--    AND fr.answers->>'data_fim' IS NULL
--    AND jsonb_typeof(fr.answers->'sessoes') IS DISTINCT FROM 'array';
