# Métricas: dispositivo, região e IP — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar aparelho, região aproximada e IP (mascarado, chaveado e cifrado) em cada evento de `analytics_events` e mostrar aparelho, região e acessos por IP mascarado no `/painel/metricas`, só para o root.

**Architecture:** Uma rota nova do servidor (`POST /api/analytics/track`) lê o IP dos headers, descobre a região, cifra o IP e chama uma função do banco que só o `service_role` executa. O banco guarda `device`, `region_*`, `ip_masked`, `ip_key` (HMAC) e `ip` (cifrado); a API de leitura nunca devolve `ip`. A agregação continua no cliente.

**Tech Stack:** Next.js (App Router), TypeScript, Vitest, Postgres/PostgREST (plugin `analytics` do kizuna-core), Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-10-26-metricas-dispositivo-ip-regiao-design.md`

## Global Constraints

- Cifra do IP: AES-256-GCM com `APP_ENCRYPTION_KEY` (32 bytes em base64url), via `kizuna-core/src/server/app-crypto.ts`. O banco nunca recebe a chave.
- Config `analytics.collect`: `device` true, `region` true, `ip` true, `encryptIp` true, `ipRetentionDays` 30 (padrões; `0` em retenção = nunca zera).
- `device` ∈ `mobile | tablet | desktop`. UF com 2 letras. `ip_masked`: IPv4 sem o último octeto (`187.12.45.•`), IPv6 só os 3 primeiros grupos (`2804:14d:5c80:•`).
- Nenhuma resposta da API de leitura contém `ip`. O user-agent nunca sai do navegador.
- Uma linha por (entidade, evento, visitante, dia) continua valendo (UNIQUE existente).
- Texto da interface em pt-BR. Tailwind varre `.md`: não escrever classes inválidas em docs.
- Não commitar sem o usuário pedir (regra do projeto). Os passos "Commit" abaixo só rodam sob comando.

## Review Focus

1. IPv4 mapeado em IPv6 (`::ffff:187.12.45.9`) e IPv6 comprimido (`2804:14d::1`): a máscara tem de funcionar e nunca devolver o IP inteiro. (Task 2)
2. `x-forwarded-for` com vários saltos, vazio ou lixo: usa o primeiro salto válido; se nenhum for válido, o evento é gravado sem IP e sem região. (Task 5)
3. `encryptIp` ligado e `APP_ENCRYPTION_KEY`/`PGRST_JWT_SECRET` ausentes: nunca gravar o IP em claro; grava o evento sem `ip`. (Task 5)
4. ip-api fora do ar, lento ou com limite estourado: região nula, evento gravado, resposta em até 1,5 s de espera pela consulta. (Task 5)
5. IP privado/local (dev): evento gravado sem IP e sem região. (Task 5)
6. Cliente antigo ainda posta em `/api/resources/fn_analytics_track`: continua gravando, sem os campos novos. (Task 4)
7. `ip` fora do `select` do resource e do `GRANT SELECT` por coluna. (Tasks 4 e 6)

---

### Task 1: Config `analytics.collect`

**Files:**
- Modify: `kizuna-core/src/shared/analytics/config.ts`
- Test: `kizuna-core/src/shared/analytics/config.test.ts`

**Interfaces:**
- Produces: `type CollectConfig = { device: boolean; region: boolean; ip: boolean; encryptIp: boolean; ipRetentionDays: number }`; `AnalyticsConfig` ganha `collect: CollectConfig`; `parseAnalyticsConfig` o preenche com os padrões.

- [ ] **Step 1: Escrever os testes.** `parseAnalyticsConfig({})` devolve `collect` = `{ device: true, region: true, ip: true, encryptIp: true, ipRetentionDays: 30 }`. `{ collect: { ip: false, encryptIp: false, ipRetentionDays: 7 } }` respeita os valores. `ipRetentionDays` negativo, não inteiro ou string cai em 30; `0` é aceito. Valor não booleano em `device` cai no padrão.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/shared/analytics/config.test.ts` · Expected: FAIL (`collect` indefinido).
- [ ] **Step 3: Implementar** `parseCollect(raw: unknown): CollectConfig` no mesmo arquivo e incluir em `parseAnalyticsConfig`. Atualizar o comentário do cabeçalho com o bloco `collect`.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando · Expected: PASS.
- [ ] **Step 5: Commit** (só sob comando): `feat(analytics): bloco collect na config`.

### Task 2: Utilitários puros — aparelho e máscara de IP

**Files:**
- Create: `kizuna-core/src/shared/analytics/device.ts`, `kizuna-core/src/shared/analytics/ip.ts`
- Modify: `kizuna-core/src/shared/analytics/index.ts` (reexportar os dois)
- Test: `kizuna-core/src/shared/analytics/device.test.ts`, `kizuna-core/src/shared/analytics/ip.test.ts`

**Interfaces:**
- Produces:
  - `ANALYTICS_DEVICES = ['mobile','tablet','desktop'] as const`; `type AnalyticsDevice`.
  - `classifyDevice(ua: string, width: number): AnalyticsDevice` — iPad/Android sem "Mobile"/tablet → `tablet`; iPhone/Android Mobile → `mobile`; senão pela largura (`< 640` mobile, `< 1024` tablet, resto desktop) quando o UA não decide.
  - `normalizeIp(raw: string): string | null` — pega o primeiro salto de uma lista `a, b, c`, remove `::ffff:` de IPv4 mapeado, valida IPv4 ou IPv6 (sem porta); inválido → `null`.
  - `isPublicIp(ip: string): boolean` — falso para loopback, privados RFC1918, link-local, `fc00::/7`, `::1`.
  - `maskIp(ip: string): string` — formatos da seção Global Constraints.

- [ ] **Step 1: Escrever os testes.** `classifyDevice`: UA de iPhone → `mobile`; UA de iPad → `tablet`; UA de Chrome desktop com largura 1440 → `desktop`; UA vazio com largura 500 → `mobile`. `normalizeIp`: `'187.12.45.9, 10.0.0.1'` → `'187.12.45.9'`; `'::ffff:187.12.45.9'` → `'187.12.45.9'`; `'lixo'`, `''` e `'999.1.1.1'` → `null`. `maskIp('187.12.45.9')` → `'187.12.45.•'`; `maskIp('2804:14d:5c80:1:2:3:4:5')` → `'2804:14d:5c80:•'`; `maskIp('2804:14d::1')` → `'2804:14d:0:•'`. `isPublicIp`: `'192.168.0.2'`, `'127.0.0.1'`, `'::1'` falsos; `'187.12.45.9'` verdadeiro.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/shared/analytics/device.test.ts src/shared/analytics/ip.test.ts` · Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar** as quatro funções acima. Para IPv6 comprimido, expandir `::` antes de pegar os 3 primeiros grupos (sem zeros à esquerda na saída).
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando · Expected: PASS.
- [ ] **Step 5: Commit** (só sob comando): `feat(analytics): classificação de aparelho e máscara de IP`.

### Task 3: Cifra e chave de agrupamento do IP

**Files:**
- Modify: `kizuna-core/src/server/app-crypto.ts`
- Test: `kizuna-core/src/server/app-crypto.test.ts`

**Interfaces:**
- Produces:
  - `encryptValue(purpose: string, plain: string): string` — AES-256-GCM, mesmo formato versionado de `sealToken`, **sem validade**; `purpose` entra como AAD.
  - `decryptValue(purpose: string, token: string): string | null` — `null` se inválido, adulterado ou de outro propósito.
  - `hmacValue(purpose: string, plain: string): string` — HMAC-SHA256 hex (64 caracteres) com subchave derivada da chave do app via HKDF (info `kizuna:hmac:<purpose>`), determinístico.

- [ ] **Step 1: Escrever os testes.** `decryptValue('ip', encryptValue('ip','187.12.45.9'))` devolve o texto; duas cifras do mesmo valor diferem; `decryptValue('outro', token)` → `null`; token adulterado → `null`; `hmacValue('ip','a')` é igual em duas chamadas, tem 64 caracteres hex e difere de `hmacValue('ip','b')` e de `hmacValue('outro','a')`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/server/app-crypto.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** reaproveitando `appKey()` e os helpers do arquivo; não alterar `sealToken`/`openToken`.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando · Expected: PASS.
- [ ] **Step 5: Commit** (só sob comando): `feat(crypto): cifra sem validade e hmac para valores sensíveis`.

### Task 4: Migração do plugin `analytics`

**Files:**
- Create: `kizuna-core/plugins/analytics/0003_analytics_context.sql`
- Modify: o arquivo consolidado do banco do starter, se o fluxo atual exigir (`db/public.sql`; seguir o que `node kizuna-core/cli update` faz com `0001`/`0002`)

**Interfaces:**
- Produces (banco):
  - Colunas em `public.analytics_events`: `device text`, `region_city text`, `region_uf text`, `ip_masked text`, `ip_key text`, `ip text`, todas anuláveis. CHECKs: `device IN ('mobile','tablet','desktop')`; `region_uf ~ '^[A-Z]{2}$'`; `region_city` até 80 caracteres; `ip_masked` até 64; `ip_key ~ '^[0-9a-f]{64}$'`; `ip` até 512.
  - `GRANT SELECT` por coluna a `auth_user`: todas as colunas **exceto `ip`** (revogar o SELECT de tabela inteira antes).
  - `public.fn_analytics_track_ctx(p_entity_type text, p_entity_id uuid, p_event_type text, p_visitor_hash text, p_source text, p_visible_ms integer, p_device text, p_region_city text, p_region_uf text, p_ip_masked text, p_ip_key text, p_ip text, p_viewer_id uuid) RETURNS boolean` — `SECURITY DEFINER`, `search_path = public`, `EXECUTE` só para `service_role` (revogar de PUBLIC, anon, auth_user). Replica as regras da policy: só anúncio ativo (`services.active`) e `created_by IS DISTINCT FROM p_viewer_id`; `INSERT ... ON CONFLICT DO NOTHING`; devolve `ROW_COUNT = 1`.
  - Retenção do IP: com `pg_cron`, job `analytics_ip_retention` diário que roda `UPDATE public.analytics_events SET ip = NULL, ip_masked = NULL, ip_key = NULL WHERE day < CURRENT_DATE - <dias> AND ip_key IS NOT NULL`; o prazo vem de `current_setting('kizuna.analytics_ip_retention_days', true)` com padrão 30. Sem `pg_cron`, `RAISE NOTICE` com a instrução. A CLI/instalação grava o valor de `ipRetentionDays` nessa setting (ver Task 8).
  - `auth.plugin_registry`: `analytics` versão `2.2.0`. Idempotente, from-zero-safe, `NOTIFY pgrst, 'reload schema'`.
- A função antiga `fn_analytics_track` e a policy de INSERT não mudam (cliente antigo segue funcionando).

- [ ] **Step 1: Escrever a migração** conforme a interface. Seguir o estilo de `0001_analytics.sql` (cabeçalho em comentário, `IF NOT EXISTS`, `DO $$` para policies).
- [ ] **Step 2: Aplicar em um banco de teste** pelo fluxo do projeto (`node kizuna-core/cli update` ou o script usado hoje) e rodar a aplicação de novo para provar idempotência. Expected: sem erro nas duas execuções.
- [ ] **Step 3: Verificar no banco** com `psql`: (a) como `anon`, `INSERT` direto com `ip` falha por falta de GRANT; (b) como `auth_user`, `SELECT ip FROM analytics_events` falha e `SELECT ip_masked` funciona; (c) como `service_role`, `fn_analytics_track_ctx(...)` devolve `true` na primeira chamada e `false` na segunda (mesmo visitante/dia); anúncio inativo devolve `false`; `p_viewer_id` igual ao dono devolve `false`; (d) `fn_analytics_track` antigo ainda devolve `true` para anônimo. Expected: todos conforme descrito.
- [ ] **Step 4: Commit** (só sob comando): `feat(analytics): colunas de contexto e função de gravação do servidor`.

### Task 5: Rota de gravação no servidor

**Files:**
- Create: `kizuna-core/src/server/analytics/ip-geo.ts`, `kizuna-core/src/server/analytics/track-handler.ts`, `kizuna-core/src/server/analytics/index.ts`
- Create: `src/app/api/analytics/track/route.ts` (starter)
- Modify: `kizuna-core/src/server/index.ts` (exportar `createAnalyticsTrackHandler`)
- Test: `kizuna-core/src/server/analytics/ip-geo.test.ts`, `kizuna-core/src/server/analytics/track-handler.test.ts`

**Interfaces:**
- Consumes: `normalizeIp`, `isPublicIp`, `maskIp`, `classifyDevice`/`ANALYTICS_DEVICES`, `parseAnalyticsConfig` (Tasks 1–2); `encryptValue`, `hmacValue` (Task 3); `serviceRpc` de `kizuna-core/src/server/service-db.ts`; `fn_analytics_track_ctx` (Task 4).
- Produces:
  - `lookupIpRegion(ip: string, headers: Headers, opts?: { fetchImpl?: typeof fetch; now?: () => number }): Promise<{ city: string; uf: string } | null>` — primeiro tenta headers da plataforma (`x-vercel-ip-city` decodificado e `x-vercel-ip-country-region`; `cf-ipcity`/`cf-region-code`), depois `http://ip-api.com/json/<ip>?fields=status,region,city` com timeout de 1,5 s (`AbortSignal.timeout`), cache em memória por IP (10 min, no máximo 5000 entradas, descarta a mais antiga). Qualquer falha → `null`. Só aceita país BR/UF de 2 letras.
  - `createAnalyticsTrackHandler(opts?: { config?: AnalyticsConfig; getViewerId?: (req: Request) => Promise<string | null> }): (req: Request) => Promise<Response>` — aceita o mesmo corpo JSON do cliente de hoje (`p_entity_type`, `p_entity_id`, `p_event_type`, `p_visitor_hash`, `p_source`, `p_visible_ms`) mais `p_device`. Valida tipos e valores contra os mesmos conjuntos do banco; responde `200 { tracked: boolean }`, `400` para corpo inválido, `204` quando `collect`/`enabled` desligam tudo, e **nunca** `5xx` por falha de geolocalização, cifra ou serviço indisponível (falha → grava sem o dado que falhou; se `serviceRpc` lançar `ServiceUnavailableError`, responde `200 { tracked: false }`).
- Regras do handler: `ip` só é considerado se `collect.ip` e o IP for válido e público; com `encryptIp` o campo `p_ip` é `encryptValue('analytics-ip', ip)` e, se a chave faltar (exceção), omite `p_ip` (nunca grava em claro); com `encryptIp` desligado grava o IP normalizado. `p_ip_key = hmacValue('analytics-ip', ip)` e `p_ip_masked = maskIp(ip)` sempre que houver IP válido e público e `collect.ip` ligado (se `hmacValue` lançar, omite os três). Região só com `collect.region`; aparelho só com `collect.device`. `p_viewer_id` vem de `getViewerId` (sessão opcional; falha → `null`). Descobrir como a sessão é lida em `kizuna-core/src/server/auth.ts` e usar o mesmo mecanismo no `route.ts`.

- [ ] **Step 1: Escrever os testes de `ip-geo`.** Headers da Vercel (`x-vercel-ip-city: Cuiab%C3%A1`, `x-vercel-ip-country-region: MT`) → `{ city: 'Cuiabá', uf: 'MT' }` sem chamar `fetch`; sem headers, `fetchImpl` mockado devolvendo `{status:'success',region:'MT',city:'Cuiabá'}` → mesmo resultado, e a segunda chamada do mesmo IP não chama `fetch` (cache); `status:'fail'`, erro de rede e timeout → `null`; região fora do Brasil → `null`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/server/analytics/ip-geo.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar `lookupIpRegion`.**
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando · Expected: PASS.
- [ ] **Step 5: Escrever os testes do handler** (mockando `serviceRpc` e `lookupIpRegion`): caminho feliz envia ao RPC `fn_analytics_track_ctx` os parâmetros `p_device`, `p_region_city`, `p_region_uf`, `p_ip_masked`, `p_ip_key` e `p_ip` cifrado (`decryptValue` recupera o IP original); `encryptIp: false` envia o IP em claro; `x-forwarded-for: 'lixo, 187.12.45.9'` usa o salto válido; só lixo → RPC sem campos de IP e região; IP privado → idem; `APP_ENCRYPTION_KEY` e segredos ausentes com `encryptIp: true` → RPC sem `p_ip` (e sem `p_ip_key`), status 200; `collect.ip: false` → nenhum campo de IP; `collect.device: false` ignora `p_device`; `p_device: 'tv'` → `400`; `p_event_type` desconhecido → `400`; `serviceRpc` lançando `ServiceUnavailableError` → `200 { tracked: false }`; `lookupIpRegion` lançando → evento gravado sem região.
- [ ] **Step 6: Rodar e ver falhar.** `npm --prefix kizuna-core test -- src/server/analytics/track-handler.test.ts` · Expected: FAIL.
- [ ] **Step 7: Implementar `createAnalyticsTrackHandler`**, `index.ts` do módulo, a exportação em `src/server/index.ts` e `src/app/api/analytics/track/route.ts` no estilo de `src/app/api/contact/route.ts` (`runtime = 'nodejs'`, `export const POST = createAnalyticsTrackHandler({ config: analyticsConfig, getViewerId })`; `analyticsConfig` vem de `@/lib/analytics`).
- [ ] **Step 8: Rodar e ver passar** os dois arquivos de teste. Expected: PASS.
- [ ] **Step 9: Commit** (só sob comando): `feat(analytics): rota de gravação com aparelho, região e IP`.

### Task 6: Cliente — enviar aparelho e usar a rota nova

**Files:**
- Modify: `kizuna-core/src/client/analytics/analytics-api.ts`
- Test: `kizuna-core/src/client/analytics/analytics-api.test.ts`

**Interfaces:**
- Consumes: `classifyDevice` (Task 2).
- Produces: `sendTrack` posta em `/api/analytics/track` (constante `TRACK_URL`) com `p_device: classifyDevice(navigator.userAgent, window.innerWidth)` além dos campos atuais. O user-agent não vai no corpo.

- [ ] **Step 1: Escrever os testes.** O corpo enviado contém `p_device` ∈ `mobile|tablet|desktop`, o `fetch`/`sendBeacon` aponta para `/api/analytics/track`, e o corpo não contém o user-agent (`JSON.stringify(body)` não inclui o `navigator.userAgent` do teste). Robôs (`isAutomated`) continuam sem enviar nada.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/client/analytics/analytics-api.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** a mudança em `sendTrack`.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando · Expected: PASS.
- [ ] **Step 5: Commit** (só sob comando): `feat(analytics): cliente envia o aparelho para a rota do servidor`.

### Task 7: Resource de leitura e agregação

**Files:**
- Modify: `kizuna-core/src/client/components/screen-engine/resources/analytics.ts` (`select` ganha `device,region_city,region_uf,ip_masked,ip_key`; **sem `ip`**)
- Modify: `kizuna-core/src/shared/analytics/aggregate.ts`
- Test: `kizuna-core/src/shared/analytics/aggregate.test.ts`

**Interfaces:**
- Produces: `AnalyticsRow` ganha `device?: string | null; region_city?: string | null; region_uf?: string | null; ip_masked?: string | null; ip_key?: string | null`. `OwnerStats` ganha:
  - `byDevice: { device: string; views: number; share: number }[]` — views do período por aparelho (`'unknown'` quando nulo), `share` em % inteiro, ordenado por views desc.
  - `byRegion: { key: string; label: string; uf: string; city: string | null; views: number; share: number }[]` — agrupa por cidade+UF; linhas sem cidade mas com UF viram `label = UF`; sem nada → `key = '_none'`, `label = 'Não informado'`; ordenado por views desc.
  - `byIp: { ipKey: string; ipMasked: string; views: number; visitorDays: number }[]` — só linhas com `ip_key`; `views` = eventos `view`; `visitorDays` = `visitor_hash` distintos; ordenado por views desc; no máximo 50.
- O recorte é o período atual (como `bySource`).

- [ ] **Step 1: Escrever os testes.** Linhas com `view` de 3 aparelhos (2 mobile, 1 desktop, 1 sem aparelho) → `byDevice` com shares 50/25/25 e `unknown` presente; `byRegion` junta `Cuiabá/MT` de visitantes diferentes e coloca linha só com UF como `MT`; `byIp` conta 3 views de um mesmo `ip_key` com 2 `visitor_hash` → `views: 3, visitorDays: 2`, mostra `ipMasked`, e ignora linhas sem `ip_key`; eventos que não são `view` não contam em `views`; evento do período anterior não entra; teto de 50 linhas. Nenhum objeto de `OwnerStats` contém a chave `ip`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/shared/analytics/aggregate.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** os três agregados em `buildOwnerStats` e os tipos; atualizar o `select` do resource.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando, mais `npm --prefix kizuna-core test -- src/client/analytics` · Expected: PASS (inclui `analytics-api.test.ts` e `use-owner-stats.test.tsx` sem regressão).
- [ ] **Step 5: Commit** (só sob comando): `feat(analytics): agregação por aparelho, região e IP mascarado`.

### Task 8: Painel — três blocos novos (feature de UI)

Seguir o fluxo de feature de UI do projeto: subagentes, skill `frontend-design`, depois `ui-review`; blocos reutilizáveis no core, a página só monta.

**Files:**
- Create: `kizuna-core/src/client/components/analytics/device-breakdown.tsx`, `region-breakdown.tsx`, `ip-breakdown.tsx`
- Modify: `kizuna-core/src/client/components/analytics/painel-metricas.tsx` (montar os blocos depois do bloco de origens)
- Modify: `kizuna-core/src/shared/analytics/metrics.ts` (rótulos: `DEVICE_LABELS = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computador', unknown: 'Não informado' }`)
- Test: um teste por bloco (`*.test.tsx`) com Testing Library, no padrão de `use-owner-stats.test.tsx`

**Interfaces:**
- Consumes: `OwnerStats['byDevice' | 'byRegion' | 'byIp']` (Task 7), `DEVICE_LABELS`.
- Produces: `DeviceBreakdown({ items }: { items: OwnerStats['byDevice'] })`, `RegionBreakdown({ items }: { items: OwnerStats['byRegion'] })`, `IpBreakdown({ items }: { items: OwnerStats['byIp'] })`. Títulos: "Dispositivos", "Onde estão seus visitantes", "Acessos por IP". Estado vazio com texto explicando que o dado só existe para acessos novos. `IpBreakdown` mostra o IP mascarado, o número de acessos e os visitantes-dia, e uma nota "IP parcialmente oculto". Acessível (tabela ou lista semântica, sem depender só de cor) e legível em 375 px sem rolagem horizontal. Cores e espaçamentos pelos tokens do tema existentes.

- [ ] **Step 1: Escrever os testes dos blocos.** Cada bloco: renderiza linhas e percentuais corretos; estado vazio; `IpBreakdown` exibe `187.12.45.•` e nunca um IP completo (teste com `ipMasked` apenas); rótulos em pt-BR.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npm --prefix kizuna-core test -- src/client/components/analytics` · Expected: FAIL.
- [ ] **Step 3: Implementar os três componentes** (subagentes + `frontend-design`) e montá-los em `painel-metricas.tsx` reaproveitando o padrão visual do bloco de origens.
- [ ] **Step 4: Rodar e ver passar** o mesmo comando · Expected: PASS.
- [ ] **Step 5: Revisão visual.** Subir o app (`.claude/launch.json`/`npm run dev`), abrir `/painel/metricas` como root em 375, 768 e 1280 px e rodar a skill `ui-review` na rota. Expected: sem overflow, sem texto cortado, sem erro de console.
- [ ] **Step 6: Commit** (só sob comando): `feat(painel): blocos de dispositivos, região e acessos por IP`.

### Task 9: Config de exemplo, retenção, decifração e documentação

**Files:**
- Modify: `kizuna.config.json` (starter) e `kizuna-core/starter/kizuna.config.json`: bloco `analytics.collect` com os padrões e um `_comment` explicando cada campo
- Modify: o ponto da CLI/instalação que aplica migrações, para gravar `ipRetentionDays` na setting `kizuna.analytics_ip_retention_days` (achar onde `kizuna install|update` roda os `.sql` dos plugins e seguir o padrão; se não houver gancho, documentar o `ALTER DATABASE ... SET` manual)
- Create: `kizuna-core/src/server/analytics/reveal-ip.ts` com `revealAnalyticsIp(token: string): string | null` (usa `decryptValue('analytics-ip', token)`), e um script `scripts/analytics-reveal-ip.mjs` que lê o token do argumento e imprime o IP, para uso por quem tem a chave
- Modify: `kizuna-core/docs/plugins/analytics.md` (seções "Dispositivo, região e IP", "Configuração `collect`", "Dado sensível e LGPD", "Como decifrar", limites do ip-api e de `x-forwarded-for`; trocar a frase "sem dado pessoal" do cabeçalho, que deixa de ser verdade quando `ip` está ligado)
- Test: `kizuna-core/src/server/analytics/reveal-ip.test.ts`

**Interfaces:**
- Consumes: `decryptValue` (Task 3).
- Produces: `revealAnalyticsIp`.

- [ ] **Step 1: Escrever o teste** de `revealAnalyticsIp`: ida e volta com `encryptValue('analytics-ip', ip)`; token de outro propósito → `null`.
- [ ] **Step 2: Rodar e ver falhar**, implementar, rodar e ver passar. Run: `npm --prefix kizuna-core test -- src/server/analytics/reveal-ip.test.ts` · Expected: FAIL e depois PASS.
- [ ] **Step 3: Atualizar as configs e a documentação** conforme a lista de arquivos. Não usar classes Tailwind inválidas nem exemplos de classe nos `.md`.
- [ ] **Step 4: Rodar a suíte inteira do core e o build do starter.** Run: `npm --prefix kizuna-core test` e `npm run build` · Expected: tudo verde.
- [ ] **Step 5: Verificação ponta a ponta.** Com o app no ar, abrir um anúncio, conferir no banco que a linha nova tem `device`, `ip_masked`, `ip_key` e `ip` cifrado (não legível), que `fn_analytics_track` antigo ainda grava, e que o painel mostra os três blocos. Expected: conforme descrito; em dev sem proxy o IP é local, então testar também enviando `X-Forwarded-For: 187.12.45.9` manualmente com `curl`.
- [ ] **Step 6: Commit** (só sob comando): `docs(analytics): coleta de dispositivo, região e IP; config de exemplo`.
