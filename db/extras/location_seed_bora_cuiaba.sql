-- db/extras/location_seed_bora_cuiaba.sql
--
-- Cidades atendidas pelo Bora Cuiabá (plugin location). O seletor de local do header lista SÓ
-- as cidades com location_city.search_city = true (plugin location 1.1.0). Conteúdo específico
-- deste projeto, por isso fica em db/extras/ e não no plugin do core.
--
--   Brasil -> Centro-Oeste -> MT (6 cidades) + MS (1 cidade)
--
-- Ids = códigos oficiais do IBGE (estado 2 dígitos, município 7 dígitos) — é o que vai para
-- `p_city_ibge` na busca e casa com service_addresses.city_ibge / user_data.city_ibge.
--
-- Liberar cidade nova: acrescente uma linha no INSERT de location_city (código em
-- https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios) com
-- search_city = true e rode de novo. Estado novo: acrescente também em location_state. Tirar
-- cidade do seletor: UPDATE public.location_city SET search_city = false WHERE id = <código>;
-- — este seed só insere/atualiza, não apaga.
--
-- A cidade padrão (location.defaultCityIbge no kizuna.config.json, hoje Cuiabá 5103403) PRECISA
-- estar aqui com search_city = true; sem ela, cidade detectada fora da lista cai no seletor.
--
-- Pré-requisito: plugin location 1.1.0 aplicado (0002_location_search_city.sql). Idempotente.

BEGIN;

INSERT INTO public.location_country (code, name)
VALUES ('BR', 'Brasil')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO public.location_region (id, country_id, code, name)
SELECT 5, c.id, 'CO', 'Centro-Oeste'
FROM public.location_country c
WHERE c.code = 'BR'
ON CONFLICT (id) DO UPDATE
  SET country_id = EXCLUDED.country_id, code = EXCLUDED.code, name = EXCLUDED.name, updated_at = now();

INSERT INTO public.location_state (id, country_id, region_id, code, name)
SELECT v.id, c.id, 5, v.code, v.name
FROM public.location_country c
CROSS JOIN (VALUES
  (50, 'MS', 'Mato Grosso do Sul'),
  (51, 'MT', 'Mato Grosso')
) AS v(id, code, name)
WHERE c.code = 'BR'
ON CONFLICT (id) DO UPDATE
  SET country_id = EXCLUDED.country_id, region_id = EXCLUDED.region_id, code = EXCLUDED.code,
      name = EXCLUDED.name, updated_at = now();

INSERT INTO public.location_city (id, state_id, name, search_city)
VALUES
  (5103403, 51, 'Cuiabá', true),
  (5108402, 51, 'Várzea Grande', true),
  (5103007, 51, 'Chapada dos Guimarães', true),
  (5107602, 51, 'Rondonópolis', false),
  (5107909, 51, 'Sinop', false),
  (5107925, 51, 'Sorriso', false),
  (5002704, 50, 'Campo Grande', false)
ON CONFLICT (id) DO UPDATE
  SET state_id = EXCLUDED.state_id, name = EXCLUDED.name, search_city = EXCLUDED.search_city,
      updated_at = now();

COMMIT;
