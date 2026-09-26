# Plano: endereços do serviço (N por serviço)

Status: proposta, aguardando aprovação. Nada implementado.

## Problema

O passo `location` do wizard de serviços não salva o endereço: o `AddressValue` vive num `useState` local de `StepLocation` (`step-location.tsx:94`), só o booleano `addressComplete` sobe, e o `persist` grava apenas o enum `service_location` (escolha única). Consequências: não há endereço persistido, nem mais de um, nem combinação presencial + online; a busca por cidade/UF usa o `user_data` do prestador.

## Decisões de desenho

1. **Tabela filha `public.service_addresses`** (N por serviço), no **core**: `kizuna-core/plugins/services/0003_service_addresses.sql`, `services` → 1.2.0, `kizuna.lock` migrations 2 → 3. Copia o padrão de `service_categories_sub` (FK `ON DELETE CASCADE`, `tenant_id`/`created_by` com default de JWT, `active`, GRANTs, `NOTIFY pgrst`).
2. **Colunas:** `id`, `service_id`, `label`, `zip_code`, `street`, `number`, `complement`, `neighborhood`, `city`, `state` (2), `city_ibge` (text, 7 dígitos), `latitude`/`longitude` `numeric(9,6)`, `place_id`, `is_primary`, `tenant_id`, `created_by`, `active`, `created_at`, `updated_at`.
3. **Índices:** `(service_id) WHERE active`; `(city_ibge) WHERE active AND city_ibge IS NOT NULL`; `(state) WHERE active`; único `(service_id) WHERE is_primary AND active`.
4. **RLS:** escrita só pelo dono do serviço (como `scs_owner_write`). Leitura pública **só de serviço ativo e `status='active'`** (não `USING (true)`), porque tem rua e número.
5. **Modalidade × endereço:** `service_location` (enum) continua como modalidade principal. Presencial exige ≥ 1 endereço; `remoto` não exige. Combinação presencial + online fica como pendência (o enum é de escolha única).
6. **Recurso** `service_addresses` em `screen-engine/resources/services.ts` (mapInput/mapOutput como `service_categories_sub`; filtro por `?filter.service_id=`); atualizar `services.test.ts`.
7. **Wizard:** novo model de opção `addresses` em `LocationProfile` (`location-options.ts`), com `maxAddresses` (default 5). O passo mostra uma lista editável no padrão do `PriceTableEditor` (adicionar/remover/marcar principal), cada linha com `AddressForm` (uma `key` por linha, pois ele só lê `value` na montagem). Estado `addresses` em `ServiceWizardState`, `SERVICE_WIZARD_INITIAL_STATE`, `EMPTY_STATE` e hidratação em `servico-wizard-page.tsx` (carrega de `/api/resources/service_addresses?filter.service_id=`). O `persist` sincroniza por diff (POST/PATCH/DELETE), como `sync-service-subcategories.ts`. O passo só persiste com `resourceId` (mesma guarda do passo `images`). Sai o `addressComplete: true` forçado em edit/review.
8. **Config por categoria** (`kizuna.config.json`, `stepProfiles.location`): `{ "options": [{ "value": "no_estabelecimento", "model": "addresses", "maxAddresses": 5 }, { "value": "remoto", "model": "identifier" }] }`, com `byGroup`/`byCategory` como hoje. Perfil substitui o anterior por inteiro.
9. **Consumo (fase 2, separada):** trocar o filtro de `fn_search_services` por um único `EXISTS` em `service_addresses` (UF e cidade no mesmo endereço), com fallback ao `user_data` para serviços sem endereço e regra para `remoto`; devolver cidade principal + contagem ("Cuiabá +2") no `RETURNS TABLE` (com `DROP FUNCTION` + `GRANT`, e atualizar `fn_swipe_deck` junto). Exige `0002` novo em `search` e `swipe` (o `0001` já foi aplicado). Nunca expor rua/número em RPC pública.
10. **Backfill:** criar 1 endereço por serviço a partir do `user_data` do prestador, para a busca não esvaziar.

## Ordem de entrega

1. Migration `services/0003` + recurso + teste.
2. Wizard: perfil `addresses`, estado, lista editável, persistência e hidratação.
3. Documentação: `interface/wizard.md`, `comecando/configuracao.md`, `plugins/README.md`.
4. (Fase 2) busca/swipe, cards e backfill.

## Riscos / pendências

- Toca o submódulo `kizuna-core` (commit lá primeiro, depois bump no `kizuna.lock`).
- `src/app/busca/page.tsx` é managed e já está divergente do hash.
- Sem detalhe público (`/anuncios/[uid]` não existe), a lista completa de endereços ainda não tem onde aparecer.
- Geocodificação: `address/search` depende de `GOOGLE_MAPS_SERVER_KEY`; sem ela, o CEP (ViaCEP) precisa bastar. Lat/lng podem ficar nulos.
- Presencial + online simultâneos: decidir depois (enum único hoje).
- Não verificado: formato de resposta de `reverse`/`address/search`; se `location_city.id` guarda IBGE (seed fora do repo).
