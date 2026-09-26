# De-para: payload `cinema` v1 → banco Kizuna

Documento de comunicação entre o crawler (ingresso.com) e o banco do Kizuna. Serve para quem lê (pessoa) e para quem implementa (pessoa ou IA).

## Como usar

Sem função no banco: o robô executa as queries da seção "Sequência de queries" **na ordem**, uma vez por arquivo JSON, em uma transação. Parâmetros no formato `%(nome)s` (psycopg). Conecte como dono/superuser do banco (a RLS é ignorada).

**Regras para quem implementa (humano ou IA):**
- Siga a ordem dos passos; cada um usa o resultado do anterior.
- Sempre informe `tenant_id` e `created_by` (os defaults dependem de JWT e vêm NULL).
- Não invente colunas. O que não tem lugar vai em `extras` e está marcado ⛔ na tabela.
- Reexecutar o mesmo arquivo atualiza, não duplica (chave `origem.fonte + id_filme + id_cinema`).
- Pré-requisitos: seed de taxonomia (categoria `cinema`), um usuário root com tenant e as migrations `services/0003`, `services/0004` (coluna `expires_at`), `search/0002` e `swipe/0002` aplicadas (tabela `service_addresses`). `services/0004` vem antes de `search/0002` (a busca lê a coluna); a ordem de `kizuna.plugins.json` já garante.
- As queries foram validadas contra um Postgres 16 real (ver seção "Validação" no fim); mesmo assim, valide com um arquivo antes de rodar em lote.

Legenda: ✅ coluna própria · 🟡 vai em `services.extras` (jsonb, **nenhuma tela lê**) · ⛔ sem lugar / pendente · ➖ descartado.

| Campo do contrato | Destino | Conversão | |
|---|---|---|---|
| `categoria` | `services.category_id` (+ `category_group_id`) | valida `'cinema'`; lookup `categories.slug='cinema'` | ✅ |
| `titulo` | `services.title` | direto | ✅ |
| `descricao` | `services.description` | direto | ✅ |
| `preco` | `services.starting_price` | null → 0 | ✅ |
| (derivado de `preco`) | `services.price_unit` | preço presente → `'unit'`; null → `'quote'` | ✅ |
| `moeda` | — | valida `'BRL'` (o front só formata BRL) | ➖ |
| `status` | `services.status` | `'ativo'` → `'active'` | ✅ |
| `publicado_em` | `services.created_at` | ISO UTC → timestamptz | ✅ |
| `expira_em` | `services.expires_at` | ISO UTC → timestamptz; null = sem validade | ✅ vencido some da busca/swipe (`status` segue `active`) |
| `local.nome` | `service_addresses.label` | direto | ✅ |
| `local.endereco` | `service_addresses.street` + `number` | separar no último `, ` (`"Av. Afonso Pena, 4909"` → rua + número); sem vírgula → tudo em `street` | ✅ |
| `local.bairro` | `service_addresses.neighborhood` | direto | ✅ |
| `local.cep` | `service_addresses.zip_code` | só dígitos (hoje sempre null) | ✅ |
| `local.latitude/longitude` | `service_addresses.latitude/longitude` | `numeric(9,6)` | ✅ |
| `local.cidade` | `service_addresses.city` | direto | ✅ |
| `local.uf` | `service_addresses.state` | 2 letras, maiúsculas | ✅ |
| (derivado) IBGE da cidade | `service_addresses.city_ibge` | casar `cidade`+`uf` (ex.: `/api/location/cities?uf=`) → id IBGE de 7 dígitos; sem match → null | ✅ (sem IBGE a busca por cidade não acha o cinema; por UF acha) |
| (fixo) endereço principal | `service_addresses.is_primary` | `true` (1 endereço por anúncio de cinema) | ✅ |
| `contato.telefone/whatsapp/email/site/link_ingresso` | `extras.contato.*` | direto | ⛔ sem contato por anúncio |
| `midia.capa` (url) | `files` + `extras.coverFileId` | baixar → base64 → `files.content` (`purpose='service_image'`) → id | ✅ |
| `midia.imagens[]` (url) | `files` + `extras.images` | idem, array de `files.id`, capa primeiro | ✅ |
| `midia.trailer_url` | `extras.midia.trailer_url` | direto | 🟡 |
| `midia.capa_local`, `imagens_locais[]` | — | só localizam o arquivo a subir | ➖ |
| `detalhes.titulo_obra/titulo_original/classificacao_indicativa/distribuidora` | `extras.detalhes.*` | direto | 🟡 |
| `detalhes.avisos_classificacao[]/genero[]/idiomas[]/formatos[]` | `extras.detalhes.*` | array de string | 🟡 |
| `detalhes.duracao_min/ano_lancamento` | `extras.detalhes.*` | integer | 🟡 |
| `detalhes.pre_venda/reexibicao` | `extras.detalhes.*` | boolean (`reexibicao` também escolhe a subcategoria) | 🟡 |
| `detalhes.sessoes[]` (`id_origem, data, horario, preco, sala, tipo[], url_compra, lugares_disponiveis`) | `extras.detalhes.sessoes` | array de objeto, ordem original | ⛔ sem tabela de sessões; `agenda_events` é pessoal e não serve |
| `origem.*` (`fonte, id_filme, id_cinema, id_cidade, rede, cnpj_cinema, url_cinema`) | `extras.origem.*` | direto; `fonte+id_filme+id_cinema` é a chave de idempotência | 🟡 |
| (derivado) subcategoria | `service_categories_sub` | `reexibicao` → `sessoes-especiais`; senão `lancamentos` | ⛔ regra provisória |
| (sem campo) slug do anúncio | — | não existe coluna; id público é `services.uid` | ⛔ |

## O que não tem lugar (a resolver)

1. ~~Localização por anúncio~~: resolvida com `service_addresses`. Resta a qualidade do `city_ibge` (casar cidade+UF; sem IBGE só a busca por UF encontra o cinema).
2. ~~Expiração~~: resolvida com `services.expires_at` (`services/0004`); `fn_search_services` (e o swipe, que herda) ignora anúncio vencido. Vencido segue com `status='active'` e `/curtidos` ainda o mostra (histórico).
3. **Sessões** (`detalhes.sessoes[]`): precisa de tabela própria ou do form dinâmico com array de objetos.
4. **Contato por anúncio** (`contato.*`).
5. **Exibição de `detalhes.*`**: nenhuma tela lê `extras`; depende de UI ou do form dinâmico (objeto/array).
6. **Slug e rota pública de detalhe** do anúncio.
7. **Regra final de subcategoria** e o comportamento no reprocessamento (hoje: não reativa `paused/archived`).

## Sequência de queries (uma vez por arquivo)

Antes: valide `categoria='cinema'`, `moeda='BRL'` e `origem.fonte/id_filme/id_cinema` presentes. Calcule no robô: `preco_unit = 'unit' se preco senão 'quote'`, `sub_slug = 'sessoes-especiais' se detalhes.reexibicao senão 'lancamentos'`.

**1. Root e tenant** (uma vez por execução; guarde `root_uid`, `tenant_uid`)
```sql
SELECT u.uid AS root_uid, t.uid AS tenant_uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;
```

**2. Categoria e subcategoria** (uma vez por execução; guarde `category_id`, `group_id`, `sub_id`)
```sql
SELECT c.id AS category_id, c.category_group_id AS group_id, cs.id AS sub_id
FROM public.categories c
JOIN public.categories_sub cs ON cs.category_id = c.id AND cs.slug = %(sub_slug)s
WHERE c.slug = 'cinema' AND c.active;
```

**3. Serviço já existente?** (retorna 0 ou 1 linha; decide entre passo 6 e 7)
```sql
SELECT id, status, extras FROM public.services
WHERE tenant_id = %(tenant_uid)s AND active
  AND extras->'origem'->>'fonte' = %(fonte)s
  AND extras->'origem'->>'id_filme' = %(id_filme)s
  AND extras->'origem'->>'id_cinema' = %(id_cinema)s
ORDER BY id LIMIT 1;
```

**4. Imagens, para cada uma (capa primeiro): já existe?**
```sql
SELECT id FROM public.files
WHERE tenant_id = %(tenant_uid)s AND purpose = 'service_image' AND active
  AND original_name = %(nome)s AND size_bytes = %(tamanho)s LIMIT 1;
```

**5. Imagem nova: inserir** (`content` = bytes baixados; `file_id` = uuid gerado no robô; `storage_path` = `service_image/AAAA/MM/<file_id>-<nome>`). Guarde os ids em ordem em `images` e o da capa em `coverFileId`. Download falhou: pule a imagem.
```sql
INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, purpose, content, active)
VALUES (%(file_id)s, %(root_uid)s, %(tenant_uid)s, %(nome)s, %(storage_path)s, %(mime)s, %(tamanho)s, 'service_image', %(content)s, true);
```

**Monte `extras`** (JSON no robô): `{"contato","midia" (sem capa_local/imagens_locais),"detalhes","origem"}` copiados do payload; some `"images": [ids]` e `"coverFileId": id` **apenas se subiu/reaproveitou alguma imagem**.

**6. Passo 3 sem linha: inserir serviço** (retorna `service_id`)
```sql
INSERT INTO public.services
  (title, category_group_id, category_id, description, starting_price, price_unit, status,
   service_location, extras, expires_at, tenant_id, created_by, created_at, active)
VALUES (%(titulo)s, %(group_id)s, %(category_id)s, %(descricao)s, COALESCE(%(preco)s, 0), %(preco_unit)s::public.price_unit,
        'active', 'no_estabelecimento', %(extras)s::jsonb, %(expira_em)s::timestamptz, %(tenant_uid)s, %(root_uid)s, %(publicado_em)s, true)
RETURNING id;
```

**7. Passo 3 com linha: atualizar** (não reativa anúncio pausado/arquivado; `||` preserva `images`/`coverFileId` antigos se não vieram novos)
```sql
UPDATE public.services SET
  title = %(titulo)s, description = %(descricao)s,
  starting_price = COALESCE(%(preco)s, 0), price_unit = %(preco_unit)s::public.price_unit,
  status = CASE WHEN status IN ('paused','archived') THEN status ELSE 'active' END,
  extras = extras || %(extras)s::jsonb, expires_at = %(expira_em)s::timestamptz, updated_at = now()
WHERE id = %(service_id)s;
```

**7b. Endereço do cinema** (rodar após o passo 6/7, com `service_id`). Um cinema = 1 endereço principal. Se o passo 3 achou o serviço, reaproveite a linha (atualize); senão insira. Monte no robô: `street`/`number` a partir de `local.endereco` (separar no último `, `), `zip_code` só dígitos, `state` maiúsculo, `city_ibge` casado por cidade+UF (ou null).
```sql
-- existe endereço principal?
SELECT id FROM public.service_addresses WHERE service_id = %(service_id)s AND is_primary AND active LIMIT 1;

-- não existe: inserir
INSERT INTO public.service_addresses
  (service_id, label, zip_code, street, number, neighborhood, city, state, city_ibge,
   latitude, longitude, is_primary, tenant_id, created_by, active)
VALUES (%(service_id)s, %(label)s, %(zip_code)s, %(street)s, %(number)s, %(neighborhood)s, %(city)s, %(state)s,
        %(city_ibge)s, %(latitude)s, %(longitude)s, true, %(tenant_uid)s, %(root_uid)s, true);

-- existe: atualizar
UPDATE public.service_addresses SET label=%(label)s, zip_code=%(zip_code)s, street=%(street)s, number=%(number)s,
  neighborhood=%(neighborhood)s, city=%(city)s, state=%(state)s, city_ibge=%(city_ibge)s,
  latitude=%(latitude)s, longitude=%(longitude)s, updated_at=now()
WHERE id = %(address_id)s;
```
A busca por cidade/UF casa contra este endereço (não mais contra o `user_data` do prestador). Índice único: no máximo 1 principal ativo por serviço.

**8. Vincular subcategoria**
```sql
INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
VALUES (%(service_id)s, %(group_id)s, %(category_id)s, %(sub_id)s, %(tenant_uid)s, %(root_uid)s)
ON CONFLICT (service_id, category_sub_id) DO NOTHING;
```

**9. (Opcional) Índice de idempotência**, aplicar uma vez, só se não houver duplicatas:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS services_origem_uq ON public.services
  ((extras->'origem'->>'fonte'), (extras->'origem'->>'id_filme'), (extras->'origem'->>'id_cinema'))
  WHERE extras ? 'origem';
```

## Validação

Data: 2026-09-26. Postgres 16 descartável (Docker, `--rm`, já removido).

**Executado**
- Schema: `kizuna-core/sql/*.sql` + migrations de cada plugin na ordem de `kizuna.plugins.json` (inclui `services/0003`, `services/0004`, `search/0002`, `swipe/0002`), roles `anon`/`auth_user`/`authenticator` criadas antes. Sem erros. Registry: services 1.3.0, search 1.1.0, swipe 1.1.0.
- Seed: `auth.fun_auth__signup_bootstrap('root', ...)` + `db/extras/taxonomy_seed_bora_cuiaba.sql`.
- `services/0004` aplicada duas vezes: sem erro (só NOTICE de "already exists").
- Cenário Resident Evil (Cinemark Campo Grande, `expira_em = 2026-09-30T23:10:00Z`, MS, IBGE 5002704): passos 1, 2, 6 (com `expires_at`), 7b e 8 via psql. Com validade futura, `fn_search_services('MS', ..., 'cinema-e-teatro', ..., '5002704')` retorna o anúncio (Campo Grande/MS). Passo 7 (UPDATE) com `expires_at` no passado (2026-09-20): a busca retorna 0 linhas e o deck do swipe também; `status` continua `active`. `expires_at = NULL`: volta a aparecer.
- Sem validade e com validade futura aparecem; passada não aparece (testado também com serviços genéricos).
- Carga: ~30 mil serviços (1/3 vencidos, 1/3 sem validade, 1/3 futuros): `fn_search_services` ~210 ms (warm) com o filtro; sem o filtro ~1,1 a 1,5 s, porque processa 30 mil em vez de 20 mil linhas (o filtro reduz o trabalho, sem regressão). `EXPLAIN` do WHERE com filtro: Seq Scan, 6,7 ms para 30 mil linhas; o índice parcial `services_expires_at` só entra quando o filtro é seletivo (`expires_at > now()`, confirmado com seqscan desligado).

**Não testado**
- RLS/roles (conexão como superuser), PostgREST/HTTP, download de imagens, casamento cidade+UF com IBGE, reprocessamento `paused/archived`, `preco` nulo, `reexibicao=true`, endereço sem vírgula.
- Anúncio que expira entre duas consultas dentro da mesma transação do robô (o filtro usa `now()`).
