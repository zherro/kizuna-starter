# De-para: payload `cinema` v3 → banco Kizuna

Instruções para o robô que lê os JSONs do crawler (ingresso.com) e grava os anúncios de cinema direto no Postgres, no tenant do usuário root.

## Regras

- Conecte como dono/superuser. Parâmetros no formato `%(nome)s` (psycopg).
- **Um arquivo JSON = um filme em uma cidade = um anúncio.** Os itens de `cinemas[]` viram a lista `cinemas` do formulário e um endereço cada em `service_addresses`.
- Chave do anúncio: `origem.fonte` + `origem.id_filme` + código IBGE da cidade dos cinemas. Reexecutar um arquivo atualiza o anúncio existente.
- Execute a **Fase 1** uma vez antes de tudo e a **Fase 2** para cada arquivo, na ordem.
- Rode cada arquivo da Fase 2 numa transação (o passo 6 apaga e recria os endereços).
- O payload não traz preço: todo anúncio é gravado com `starting_price = 0` e `price_unit = 'quote'`.
- Sempre informe `tenant_id` e `created_by`/`submitted_by` (não há JWT).
- Não use colunas fora deste documento. Não rode seeds nem migrations.
- **Gênero** é taxonomia (subcategoria de Cinema): o robô insere o gênero que faltar **sempre com `active = false`** e **nunca** ativa, edita ou apaga taxonomia. Quem ativa é a pessoa responsável, pela UI. **Nenhum anúncio é gravado enquanto houver gênero usado pelos arquivos que não esteja `active = true`.**
- **Opções de formulário** (`tags`, `detalhes_avisos_classificacao`, `cinemas.idiomas`, `cinemas.formatos`): o robô **acrescenta ao `forms.schema`** a opção que faltar (passo 1.4) e segue; a aprovação dessas opções é feita fora do Kizuna. Nunca remova nem renomeie opção existente.
- **Descrição revisada por IA não é sobrescrita:** no UPDATE, `description` só muda se o serviço **não** tiver linha em `public.service_text_revisions` com `field = 'description'` e `status = 'approved'`. Os demais campos seguem atualizando.
- Grave em `public.form_results` direto; não use `fn_form_result_upsert`.

## Fase 1: verificação prévia (antes de inserir qualquer arquivo)

**1.1 Contexto** (guarde para a Fase 2)

```sql
-- root e tenant (sem linha: abortar)
SELECT u.uid AS root_uid, t.uid AS tenant_uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;

-- formulário (sem linha: abortar). Releia depois do passo 1.4.
SELECT id AS form_id, version AS form_version, schema AS schema_snapshot
FROM public.forms WHERE tenant_id = %(tenant_uid)s AND form_key = 'cinema' AND active;
```

Confira no `schema_snapshot` que o campo `cinemas` (tipo `list`) tem em `itemFields` exatamente estes subcampos: `id_cinema`, `nome`, `telefone`, `site`, `link_ingresso`, `idiomas`, `formatos`, `expira_em`, `active`. Faltou algum, ou sobrou outro: aborte e reporte (o seed do formulário está desatualizado).

**1.2 Varredura.** Leia todos os JSONs e todos os itens de `cinemas[]` (guarde os arquivos de cada valor) e monte:

| Coletar (sem diferença de caixa e acento) | Compara com | Se faltar |
|---|---|---|
| `detalhes.genero[]` | subcategorias da categoria `cinema` (slug `cinema-` + slugify do gênero) | 1.3/1.5 (pendente, bloqueia) |
| `detalhes.avisos_classificacao[]` | `options` do campo `detalhes_avisos_classificacao` | 1.4 (acrescenta, não bloqueia) |
| `cinemas[].idiomas[]` | `options` de `itemFields[key='idiomas']` do campo `cinemas` **e** do campo `tags` | 1.4 |
| `cinemas[].formatos[]` | `options` de `itemFields[key='formatos']` do campo `cinemas` **e** do campo `tags` | 1.4 |
| `Pré-venda` (se `detalhes.pre_venda`), `Reexibição` (se `detalhes.reexibicao`) | `options` do campo `tags` | 1.4 |

- **`generos`**: lista `[{"name": "Comédia", "slug": "cinema-comedia"}, ...]`, um item por gênero distinto, `name` = valor `trim()` como veio.
- **`opcoes_novas`**: lista `[{"campo": "tags", "item": null, "valor": "Laser"}, {"campo": "cinemas", "item": "formatos", "valor": "Laser"}, ...]`, com `valor` = valor `trim()` como veio.
- **Cidades**: para cada arquivo, os pares (`cinemas[].local.cidade`, `cinemas[].local.uf`) → código IBGE de 7 dígitos em `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios` (comparar sem acento e caixa). Todos os cinemas do arquivo devem dar o mesmo código; esse é o `cidade_ibge` do anúncio. Sem correspondência, cidade/UF `null` ou códigos diferentes no mesmo arquivo: `cidades_sem_ibge` (bloqueia o arquivo).
- **Campos não mapeados**: percorra todos os caminhos de cada JSON (objetos com `.`, listas com `[]`, só folhas; ex.: `cinemas[].origem.campos_ajustados[]`). Todo caminho fora da lista abaixo vai em `campos_nao_mapeados` (caminho, um valor de exemplo, arquivos afetados). Não grave esses campos nem invente destino.

Caminhos mapeados:

```
categoria titulo descricao moeda status publicado_em expira_em
midia.capa midia.imagens[] midia.trailer_url midia.capa_local midia.imagens_locais[]
detalhes.titulo_obra detalhes.titulo_original detalhes.classificacao_indicativa detalhes.distribuidora
detalhes.duracao_min detalhes.ano_lancamento detalhes.avisos_classificacao[] detalhes.genero[]
detalhes.pre_venda detalhes.reexibicao
origem.fonte origem.id_filme
cinemas[].local.nome cinemas[].local.endereco cinemas[].local.bairro cinemas[].local.cidade
cinemas[].local.uf cinemas[].local.cep cinemas[].local.latitude cinemas[].local.longitude
cinemas[].contato.telefone cinemas[].contato.whatsapp cinemas[].contato.email
cinemas[].contato.site cinemas[].contato.link_ingresso
cinemas[].idiomas[] cinemas[].formatos[] cinemas[].expira_em
cinemas[].origem.fonte cinemas[].origem.id_filme cinemas[].origem.id_cinema cinemas[].origem.id_cidade
cinemas[].origem.rede cinemas[].origem.cnpj_cinema cinemas[].origem.url_cinema
cinemas[].origem.campos_ajustados[]
```

**1.3 Gêneros: comparar e inserir os ausentes como pendentes.** A primeira query retorna só o que falta ou não está ativo (0 linhas = nada pendente); `situacao` = `ausente` ou `pendente`. A segunda cria os ausentes com `active = false` (`ON CONFLICT DO NOTHING`; o `RETURNING` lista o que foi criado agora). Nunca faça `UPDATE` de `active` nem `DELETE`. Parâmetro `generos` = JSON da 1.2, em texto.

```sql
SELECT g.name, g.slug,
       CASE WHEN cs.id IS NULL THEN 'ausente' ELSE 'pendente' END AS situacao
FROM jsonb_to_recordset(%(generos)s::jsonb) AS g(name text, slug text)
LEFT JOIN public.categories c ON c.slug = 'cinema'
LEFT JOIN public.categories_sub cs ON cs.slug = g.slug AND cs.category_id = c.id
WHERE cs.active IS NOT TRUE
ORDER BY g.slug;

INSERT INTO public.categories_sub (category_id, name, slug, description, tags, active, tenant_id, created_by)
SELECT c.id, btrim(g.name), g.slug, 'Filmes de ' || lower(btrim(g.name)) || ' em cartaz nos cinemas da região.',
       lower(btrim(g.name)), false, %(tenant_uid)s, %(root_uid)s
FROM jsonb_to_recordset(%(generos)s::jsonb) AS g(name text, slug text)
JOIN public.categories c ON c.slug = 'cinema'
ON CONFLICT (slug) DO NOTHING
RETURNING name, slug;
```

`slug` = `'cinema-'` + nome sem acento, minúsculo, com tudo que não é letra/número trocado por `-` (ex.: `Ficção científica` → `cinema-ficcao-cientifica`). Se o grupo `cinema` ou a categoria `cinema` não existirem, aborte e reporte: eles vêm do seed de taxonomia. Um gênero que continua `ausente` depois do insert tem o slug ocupado sob outro pai: reporte o conflito.

**1.4 Acrescentar opções novas ao formulário.** Para cada item de `opcoes_novas`, rode a query abaixo (`item` = `NULL` para campo do topo, ou a chave do campo dentro da lista `cinemas`). Antes de rodar, confira de novo no `schema_snapshot` que a opção não existe (sem diferença de caixa e acento): a query não confere. Depois de todas, releia o formulário (1.1): `form_version` e `schema_snapshot` mudaram.

```sql
UPDATE public.forms p SET schema = jsonb_set(p.schema, '{fields}', (
  SELECT jsonb_agg(
    CASE
      WHEN fld->>'key' <> %(campo)s THEN fld
      WHEN %(item)s::text IS NULL
        THEN jsonb_set(fld, '{options}', COALESCE(fld->'options', '[]'::jsonb)
                       || jsonb_build_array(jsonb_build_object('label', btrim(%(valor)s), 'value', btrim(%(valor)s))))
      ELSE jsonb_set(fld, '{itemFields}', (
        SELECT jsonb_agg(
          CASE WHEN it->>'key' = %(item)s
            THEN jsonb_set(it, '{options}', COALESCE(it->'options', '[]'::jsonb)
                           || jsonb_build_array(jsonb_build_object('label', btrim(%(valor)s), 'value', btrim(%(valor)s))))
            ELSE it END ORDER BY io)
        FROM jsonb_array_elements(fld->'itemFields') WITH ORDINALITY AS i(it, io)))
    END ORDER BY fo)
  FROM jsonb_array_elements(p.schema->'fields') WITH ORDINALITY AS e(fld, fo)))
WHERE p.tenant_id = %(tenant_uid)s AND p.form_key = 'cinema' AND p.active
RETURNING p.version;
```

**1.5 Relatório único.** Junte tudo num relatório (JSON ou texto) e entregue à pessoa responsável. **Se houver gênero `ausente`/`pendente` ou cidade sem IBGE, pare**: não execute a Fase 2. Sem isso, siga para a 1.6.

```json
{
  "generos_pendentes": {
    "rota_ui": "/painel/taxonomia/arvore",
    "itens": [{ "nome": "Thriller", "slug": "cinema-thriller", "active": false }]
  },
  "opcoes_incluidas_no_formulario": [
    { "campo": "tags", "item": null, "valor": "Laser" },
    { "campo": "cinemas", "item": "formatos", "valor": "Laser" },
    { "campo": "detalhes_avisos_classificacao", "item": null, "valor": "Drogas Lícitas" }
  ],
  "cidades_sem_ibge": [{ "cidade": "...", "uf": "...", "arquivos": ["a.json"] }],
  "campos_nao_mapeados": [{ "caminho": "cinemas[].bilheteria", "exemplo": 1234, "arquivos": ["a.json"] }],
  "arquivos_afetados": { "Thriller": ["a.json"], "Laser": ["a.json"] }
}
```

Mensagem à pessoa responsável, quando houver gênero pendente: "Inseri os gêneros acima como subcategorias **pendentes** (`active = false`) de Cinema. Abra `/painel/taxonomia/arvore` (ou `/painel/taxonomia/subcategorias`), confira cada um, ligue o switch **Ativo** e salve. Avise aqui quando terminar."

**1.6 Checagem de pendentes (liberar a Fase 2).** Se a 1.5 parou, só continue depois da confirmação da pessoa **em chat**: refaça a 1.2 e a primeira query da 1.3. **0 linhas = liberado.** Qualquer linha: volte à 1.3/1.5 e pare de novo. O robô nunca ativa por conta própria. Campos não mapeados não bloqueiam. Liberado, carregue os ids para a Fase 2:

```sql
SELECT g.id AS group_id, c.id AS category_id, cs.id AS sub_id, cs.slug AS sub_slug
FROM public.categories_group g
JOIN public.categories c ON c.category_group_id = g.id AND c.slug = 'cinema' AND c.active
LEFT JOIN public.categories_sub cs ON cs.category_id = c.id AND cs.active
WHERE g.slug = 'cinema' AND g.active
ORDER BY cs.slug;
```

Sem linha: abortar e reportar.

## Fase 2: inserção (por arquivo)

Só execute depois que a checagem 1.6 liberar.

Valide o arquivo: `categoria = 'cinema'`, `moeda = 'BRL'`, `titulo`, `detalhes.titulo_obra`, `origem.fonte` e `origem.id_filme` presentes, `cidade_ibge` resolvido na 1.2, e `cinemas[]` com ao menos um item válido. Item válido: `origem.id_cinema` presente e `origem.id_filme` igual ao do topo; item inválido é descartado e reportado. Arquivo inválido: pule e reporte.

Calcule:

- `sub_slugs`: um por gênero de `detalhes.genero[]` (`'cinema-'` + slugify). Sem gênero: lista vazia.
- `expira_em`: o maior `cinemas[].expira_em` dos itens válidos; se nenhum item tiver, use o `expira_em` do topo; `null` = sem validade.
- `answers` (ver "Formulário").
- `extras` = `{"origem": {"fonte": origem.fonte, "id_filme": origem.id_filme, "cidade_ibge": <cidade_ibge>, "id_cidade": <primeiro cinemas[].origem.id_cidade não nulo>, "cinemas": [<cinemas[].origem de cada item válido, inteiro>]}}`; some `"images": [ids]` e `"coverFileId": id` só se alguma imagem foi gravada ou reaproveitada.
- `enderecos`: um por item válido de `cinemas[]`, na ordem do arquivo; o primeiro é o principal.

### De-para

| Campo do contrato | Destino | Conversão |
|---|---|---|
| `categoria` (= `cinema`) | `services.category_group_id`, `category_id` | ids do passo 1.6 |
| `detalhes.genero[]` | `categories_sub` (gênero) + `service_categories_sub` | 1.3 e passo 8 |
| `titulo` | `services.title` | direto |
| `descricao` | `services.description` | direto; `null` → `NULL` |
| (sem preço) | `services.starting_price`, `price_unit` | `0`, `'quote'` |
| `moeda` | | só validar (`BRL`) |
| `status` | `services.status` | `'active'` na criação (ver passo 5 na atualização) |
| `publicado_em` | `services.created_at` | ISO UTC → timestamptz; só no insert |
| `cinemas[].expira_em` (maior) / `expira_em` | `services.expires_at` | ver cálculo acima |
| `midia.capa` | `files` + `extras.coverFileId` | baixar a URL e gravar em `files` (passos 2 e 3) |
| `midia.imagens[]` | `files` + `extras.images` | idem, na ordem; a capa entra uma vez só |
| `midia.trailer_url` | `answers.detalhes_trailer_url` | direto |
| `midia.capa_local`, `midia.imagens_locais[]` | | ignorar |
| `detalhes.titulo_obra` | `answers.detalhes_titulo_obra` | direto (obrigatório) |
| `detalhes.titulo_original` | `answers.detalhes_titulo_original` | direto |
| `detalhes.classificacao_indicativa` | `answers.detalhes_classificacao_indicativa` | direto |
| `detalhes.distribuidora` | `answers.detalhes_distribuidora` | direto |
| `detalhes.duracao_min` | `answers.detalhes_duracao_min` | number ≥ 1 |
| `detalhes.ano_lancamento` | `answers.detalhes_ano_lancamento` | number |
| `detalhes.avisos_classificacao[]` | `answers.detalhes_avisos_classificacao` | array normalizado |
| `detalhes.pre_venda` | `answers.tags` | `Pré-venda` se `true` |
| `detalhes.reexibicao` | `answers.tags` | `Reexibição` se `true` |
| `origem.fonte`, `origem.id_filme` | `extras.origem` | direto |
| `cinemas[].origem.*` | `extras.origem.cinemas[]` | objeto copiado inteiro |
| `cinemas[].origem.id_cinema` | `answers.cinemas[].id_cinema` | direto |
| `cinemas[].local.nome` | `answers.cinemas[].nome` e `service_addresses.label` | direto |
| `cinemas[].local.endereco` | `service_addresses.street` e `number` | separar no último `, ` (sem vírgula → tudo em `street`) |
| `cinemas[].local.bairro` | `service_addresses.neighborhood` | direto |
| `cinemas[].local.cidade` | `service_addresses.city` | direto |
| `cinemas[].local.uf` | `service_addresses.state` | 2 letras maiúsculas |
| (IBGE da cidade) | `service_addresses.city_ibge` | `cidade_ibge` da 1.2 |
| `cinemas[].local.cep` | `service_addresses.zip_code` | só dígitos; `null` → `NULL` |
| `cinemas[].local.latitude`, `longitude` | `service_addresses.latitude`, `longitude` | number com 6 casas; `null` ou os dois iguais a `0` → `NULL` nos dois |
| `cinemas[].contato.telefone` | `answers.cinemas[].telefone` | direto |
| `cinemas[].contato.site` | `answers.cinemas[].site` | direto |
| `cinemas[].contato.link_ingresso` | `answers.cinemas[].link_ingresso` | direto |
| `cinemas[].contato.whatsapp`, `email` | | sem destino (a fonte sempre manda `null`) |
| `cinemas[].idiomas[]` | `answers.cinemas[].idiomas` e `answers.tags` | array normalizado |
| `cinemas[].formatos[]` | `answers.cinemas[].formatos` e `answers.tags` | array normalizado |
| `cinemas[].expira_em` | `answers.cinemas[].expira_em` | ISO UTC, como veio |
| (derivado) | `answers.cinemas[].active` | `true` se `expira_em` ausente ou no futuro no momento da importação; senão `false`. Sempre gravado, inclusive `false` |
| campo fora da lista da 1.2 | | não grava; reportar em `campos_nao_mapeados` |

### Formulário (`answers`)

Objeto JSON com chaves planas, montado inteiro a cada execução; o upsert substitui o anterior.

```json
{
  "detalhes_titulo_obra": "Minha Melhor Amiga",
  "detalhes_classificacao_indicativa": "12 anos",
  "detalhes_duracao_min": 118,
  "detalhes_avisos_classificacao": ["Conteúdo sexual", "Drogas Lícitas", "Linguagem imprópria"],
  "cinemas": [
    { "id_cinema": "416", "nome": "Cine Araújo Multiplex Pantanal", "telefone": "(65) 30914-122",
      "site": "https://...", "link_ingresso": "https://...", "idiomas": ["Nacional"], "formatos": ["Laser"],
      "expira_em": "2026-10-08T02:00:00Z", "active": true }
  ],
  "tags": ["Nacional", "Laser", "Normal", "VIP"]
}
```

- Omita chaves `null`, string vazia e array vazio, também dentro de cada item de `cinemas` (exceto `active`, sempre presente). Aplique `trim()` nas strings.
- Cada item de `cinemas` tem só os subcampos `id_cinema`, `nome`, `telefone`, `site`, `link_ingresso`, `idiomas`, `formatos`, `expira_em` e `active`. Endereço do cinema vai só para `service_addresses`.
- Números como JSON number, nunca string.
- Arrays normalizados: para cada valor, ache a opção equivalente (sem diferença de caixa e acento) no `schema_snapshot` relido após a 1.4 e grave o valor da opção (ex.: `Vip` → `VIP`, `Conteúdo Sexual` → `Conteúdo sexual`); remova duplicados.
- `tags` = `Pré-venda` (se `detalhes.pre_venda`) + `Reexibição` (se `detalhes.reexibicao`) + união de `idiomas` e `formatos` de todos os itens, normalizada e sem duplicados, nessa ordem.
- `cinemas`: um item por cinema válido, na ordem do arquivo.

### Queries

**1. Serviço existente?** (0 ou 1 linha; decide entre os passos 4 e 5)
```sql
SELECT id, status, extras FROM public.services
WHERE tenant_id = %(tenant_uid)s AND active
  AND extras->'origem'->>'fonte' = %(fonte)s
  AND extras->'origem'->>'id_filme' = %(id_filme)s
  AND extras->'origem'->>'cidade_ibge' = %(cidade_ibge)s
ORDER BY id LIMIT 1;
```

**2. Imagem já existe?** (para cada imagem, capa primeiro)
```sql
SELECT id FROM public.files
WHERE tenant_id = %(tenant_uid)s AND purpose = 'service_image' AND active
  AND original_name = %(nome)s AND size_bytes = %(tamanho)s LIMIT 1;
```

**3. Imagem nova** (`file_id` = uuid gerado; `nome` = último trecho da URL; `storage_path` = `service_image/AAAA/MM/<file_id>-<nome>`; `content` = bytes). Guarde os ids em ordem em `images` e o da capa em `coverFileId`. Download falhou: pule a imagem.
```sql
INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, purpose, content, active)
VALUES (%(file_id)s, %(root_uid)s, %(tenant_uid)s, %(nome)s, %(storage_path)s, %(mime)s, %(tamanho)s, 'service_image', %(content)s, true);
```

**4. Passo 1 sem linha: inserir serviço** (guarde `service_id`)
```sql
INSERT INTO public.services
  (title, category_group_id, category_id, description, starting_price, price_unit, status,
   service_location, extras, expires_at, tenant_id, created_by, created_at, active)
VALUES (%(titulo)s, %(group_id)s, %(category_id)s, %(descricao)s, 0, 'quote',
        'active', 'no_estabelecimento', %(extras)s::jsonb, %(expira_em)s::timestamptz,
        %(tenant_uid)s, %(root_uid)s, %(publicado_em)s::timestamptz, true)
RETURNING id;
```

**5. Passo 1 com linha: atualizar serviço** (mantém o status se estiver `paused` ou `archived`; `created_at` não muda; `description` fica intacta quando existe revisão `approved`)
```sql
UPDATE public.services SET
  title = %(titulo)s,
  description = CASE WHEN EXISTS (
      SELECT 1 FROM public.service_text_revisions r
      WHERE r.service_id = services.id AND r.field = 'description' AND r.status = 'approved')
    THEN description ELSE %(descricao)s END,
  starting_price = 0, price_unit = 'quote',
  status = CASE WHEN status IN ('paused','archived') THEN status ELSE 'active' END,
  extras = (extras - 'origem' - 'images' - 'coverFileId') || %(extras)s::jsonb,
  expires_at = %(expira_em)s::timestamptz, updated_at = now()
WHERE id = %(service_id)s;
```

**6. Endereços dos cinemas** (apaga os do anúncio e insere um por item de `enderecos`; `is_primary` = `true` só no primeiro)
```sql
DELETE FROM public.service_addresses WHERE service_id = %(service_id)s;

INSERT INTO public.service_addresses
  (service_id, label, zip_code, street, number, neighborhood, city, state, city_ibge,
   latitude, longitude, is_primary, tenant_id, created_by, active)
VALUES (%(service_id)s, %(label)s, %(zip_code)s, %(street)s, %(number)s, %(neighborhood)s, %(city)s, %(state)s,
        %(city_ibge)s, %(latitude)s, %(longitude)s, %(is_primary)s, %(tenant_uid)s, %(root_uid)s, true);
```

**7. Respostas do formulário** (insere ou atualiza; `form_id`, `form_version`, `schema_snapshot` relidos após a 1.4)
```sql
INSERT INTO public.form_results
  (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
VALUES (%(form_id)s, 'cinema', %(service_id)s::text, 'service', %(form_version)s,
        %(schema_snapshot)s::jsonb, %(answers)s::jsonb, %(root_uid)s, %(tenant_uid)s)
ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
  answers = EXCLUDED.answers, version = EXCLUDED.version, schema_snapshot = EXCLUDED.schema_snapshot,
  form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now();
```

**8. Subcategorias (gêneros)** (remova as que deixaram de valer e insira uma linha por `sub_id` de `sub_slugs`)
```sql
DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
WHERE scs.service_id = %(service_id)s AND cs.id = scs.category_sub_id AND cs.category_id = %(category_id)s
  AND cs.slug <> ALL(%(sub_slugs)s::text[]);

INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
VALUES (%(service_id)s, %(group_id)s, %(category_id)s, %(sub_id)s, %(tenant_uid)s, %(root_uid)s)
ON CONFLICT (service_id, category_sub_id) DO NOTHING;
```

**Uma vez, antes do lote (opcional)** — índice de idempotência; só aplique se não houver anúncios duplicados:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS services_origem_cinema_uq ON public.services
  ((extras->'origem'->>'fonte'), (extras->'origem'->>'id_filme'), (extras->'origem'->>'cidade_ibge'))
  WHERE extras->'origem' ? 'cidade_ibge';
```

## Sem destino

- Slug do anúncio: não existe; o identificador público é `services.uid`.
- `cinemas[].contato.whatsapp` e `cinemas[].contato.email`: a fonte sempre manda `null`; não há campo no formulário.
- Sessões, horários e preço: não vêm no payload.
