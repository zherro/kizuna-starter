# De-para: payload `cinema` v1 → banco Kizuna

Instruções para o robô que lê os JSONs do crawler (ingresso.com) e grava os anúncios de cinema direto no Postgres, no tenant do usuário root.

## Regras

- Conecte como dono/superuser. Parâmetros no formato `%(nome)s` (psycopg).
- Um arquivo JSON = um filme em um cinema = um anúncio.
- Execute a **Fase 1** uma vez antes de tudo e a **Fase 2** para cada arquivo, na ordem.
- Transação por arquivo é opcional: cada passo pode ser repetido sem duplicar.
- Reexecutar um arquivo atualiza o anúncio existente (chave `origem.fonte + id_filme + id_cinema`).
- Sempre informe `tenant_id` e `created_by`/`submitted_by` (não há JWT).
- Não use colunas fora deste documento. Não rode seeds nem migrations. Não crie formulário nem edite `forms.schema`: opção nova de formulário só é reportada.
- Taxonomia (grupo, categoria, subcategoria, tag): o robô **insere o que faltar sempre com `active = false`** (pendente) e **nunca** ativa, edita ou apaga taxonomia. Quem ativa é a pessoa responsável, pela UI.
- **Nenhum anúncio (Fase 2) é gravado enquanto houver item de taxonomia usado pelos arquivos que não esteja `active = true`.**
- Grave em `public.form_results` direto; não use `fn_form_result_upsert`.

## Fase 1: verificação prévia (antes de inserir qualquer arquivo)

**1.1 Contexto** (guarde para a Fase 2)

```sql
-- root e tenant (sem linha: abortar)
SELECT u.uid AS root_uid, t.uid AS tenant_uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;

-- formulário (sem linha: abortar)
SELECT id AS form_id, version AS form_version, schema AS schema_snapshot
FROM public.forms WHERE tenant_id = %(tenant_uid)s AND form_key = 'cinema' AND active;
```

**1.2 Varredura.** Leia todos os JSONs (guarde os arquivos de cada valor) e monte:

| Coletar (sem diferença de caixa e acento) | Destino |
|---|---|
| `detalhes.genero[]`, `detalhes.formatos[]`, `detalhes.sessoes[].tipo[]`, `detalhes.idiomas[]` (exceto `Nacional`) | tag na subcategoria `em-cartaz` |
| `detalhes.idiomas[]` = `Nacional` | tag `Nacional` na subcategoria `cinema-nacional-e-regional` |
| `detalhes.avisos_classificacao[]` | nunca é tag; só formulário |
| `genero`, `idiomas`, `formatos`, `avisos_classificacao`, `sessoes[].tipo` | comparar com as `options` do campo correspondente em `schema_snapshot.fields[]` (`detalhes_genero`, `detalhes_idiomas`, `detalhes_formatos`, `detalhes_avisos_classificacao`; `itemFields[key='tipo']` do campo `sessoes`); o que não casar vai em `opcoes_novas_no_formulario` |

- **`sub_slugs`**: subcategorias que a regra de "Subcategorias" usará nos arquivos, mais as das tags acima (`em-cartaz`, `cinema-nacional-e-regional`).
- **`tags`**: lista `[{"sub": "em-cartaz", "name": "Thriller"}, ...]`, um item por valor distinto, com `name` = valor `trim()` como veio no arquivo.
- **Cidades**: pares (`local.cidade`, `local.uf`) → código IBGE de 7 dígitos em `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios` (comparar sem acento e caixa). Sem correspondência: `cidades_sem_ibge`.
- **Campos não mapeados**: percorra todos os caminhos de cada JSON (objetos com `.`, listas com `[]`, só folhas; ex.: `detalhes.sessoes[].tipo[]`). Todo caminho fora da lista abaixo vai em `campos_nao_mapeados` (caminho, um valor de exemplo, arquivos afetados). Não grave esses campos nem invente destino.

Caminhos mapeados (qualquer caminho sob `origem.` também é aceito):

```
categoria titulo descricao preco moeda status publicado_em expira_em
local.nome local.endereco local.bairro local.cep local.latitude local.longitude local.cidade local.uf
contato.telefone contato.whatsapp contato.email contato.site contato.link_ingresso
midia.capa midia.imagens[] midia.trailer_url midia.capa_local midia.imagens_locais[]
detalhes.titulo_obra detalhes.titulo_original detalhes.classificacao_indicativa detalhes.distribuidora
detalhes.duracao_min detalhes.ano_lancamento detalhes.avisos_classificacao[] detalhes.genero[]
detalhes.idiomas[] detalhes.formatos[] detalhes.pre_venda detalhes.reexibicao
detalhes.sessoes[].id_origem detalhes.sessoes[].data detalhes.sessoes[].horario detalhes.sessoes[].preco
detalhes.sessoes[].sala detalhes.sessoes[].tipo[] detalhes.sessoes[].url_compra
detalhes.sessoes[].lugares_disponiveis
```

**1.3 Comparar com o banco.** Retorna só o que falta ou não está ativo (0 linhas = nada pendente). `situacao`: `ausente` (não existe) ou `pendente` (existe com `active = false`). Parâmetros: `sub_slugs` (lista de texto) e `tags` (JSON da 1.2, em texto).

```sql
WITH necessarios AS (
  SELECT 'grupo' AS nivel, 'cinema' AS slug, NULL::text AS sub_slug, NULL::text AS nome
  UNION ALL SELECT 'categoria', 'cinema', NULL, NULL
  UNION ALL SELECT 'subcategoria', s, NULL, NULL FROM unnest(%(sub_slugs)s::text[]) AS s
  UNION ALL SELECT 'tag', trim(both '-' from regexp_replace(lower(unaccent(btrim(t.name))), '[^a-z0-9]+', '-', 'g')), t.sub, btrim(t.name)
    FROM jsonb_to_recordset(%(tags)s::jsonb) AS t(sub text, name text)
)
SELECT n.nivel, n.slug, n.sub_slug, n.nome,
       CASE WHEN x.id IS NULL THEN 'ausente' ELSE 'pendente' END AS situacao
FROM necessarios n
LEFT JOIN LATERAL (
  SELECT g.id::text AS id, g.active FROM public.categories_group g WHERE n.nivel = 'grupo' AND g.slug = n.slug
  UNION ALL SELECT c.id::text, c.active FROM public.categories c WHERE n.nivel = 'categoria' AND c.slug = n.slug
  UNION ALL SELECT cs.id::text, cs.active FROM public.categories_sub cs WHERE n.nivel = 'subcategoria' AND cs.slug = n.slug
  UNION ALL SELECT t.id::text, t.active FROM public.categories_sub_tags t
            JOIN public.categories_sub cs ON cs.id = t.category_sub_id
            WHERE n.nivel = 'tag' AND cs.slug = n.sub_slug AND t.slug = n.slug
) x ON true
WHERE x.active IS NOT TRUE
ORDER BY n.nivel, n.sub_slug, n.slug;
```

**1.4 Inserir a taxonomia `ausente`, como pendente.** Rode as inserções em ordem (grupo, categoria, subcategorias, tags). Só criam o que não existe (`ON CONFLICT DO NOTHING`; reexecutar não duplica) e sempre com `active = false`. O `RETURNING` lista o que foi criado agora: guarde para o relatório. Nunca faça `UPDATE` de `active` nem `DELETE`. Se o `slug` de grupo, categoria ou subcategoria já existir sob outro pai, nada é inserido: reporte o conflito.

```sql
INSERT INTO public.categories_group (name, slug, description, tags, icon, sort_order, active, tenant_id, created_by)
VALUES ('Cinema', 'cinema', 'Filmes em cartaz, pré-venda, reexibições, cinema nacional e sessões especiais.',
        'filme, sessão, cinema, ingresso, estreia', 'Clapperboard', 20, false, %(tenant_uid)s, %(root_uid)s)
ON CONFLICT (slug) DO NOTHING
RETURNING 'grupo' AS nivel, slug;

INSERT INTO public.categories (category_group_id, name, slug, description, icon, form_key, active, tenant_id, created_by)
SELECT g.id, 'Cinema', 'cinema', 'Estreias, mostras e sessões especiais nas telas da cidade.', 'Film', 'cinema', false,
       %(tenant_uid)s, %(root_uid)s
FROM public.categories_group g WHERE g.slug = 'cinema'
ON CONFLICT (slug) DO NOTHING
RETURNING 'categoria' AS nivel, slug;

INSERT INTO public.categories_sub (category_id, name, slug, description, tags, active, tenant_id, created_by)
SELECT c.id, v.name, v.slug, v.description, v.tags, false, %(tenant_uid)s, %(root_uid)s
FROM public.categories c
JOIN (VALUES
  ('Em cartaz', 'em-cartaz', 'Filmes em cartaz nesta semana nos cinemas da região (padrão de todo filme com sessão).', 'em cartaz, sessão, dublado, legendado, 3d, imax'),
  ('Pré-venda & estreias', 'pre-venda-e-estreias', 'Filmes com ingresso em pré-venda e estreias que ainda vão chegar às telas.', 'pré-venda, estreia, pré-estreia, em breve'),
  ('Reexibições', 'reexibicoes', 'Clássicos e sucessos que voltaram ao cinema.', 'reexibição, clássico, relançamento, volta às telas'),
  ('Cinema nacional & regional', 'cinema-nacional-e-regional', 'Filmes nacionais em cartaz e produções mato-grossenses.', 'nacional, cinema brasileiro, documentário, produção mato-grossense, curta-metragem')
) AS v(name, slug, description, tags) ON v.slug = ANY(%(sub_slugs)s::text[])
WHERE c.slug = 'cinema'
ON CONFLICT (slug) DO NOTHING
RETURNING 'subcategoria' AS nivel, slug;

INSERT INTO public.categories_sub_tags (category_id, category_sub_id, name, slug, active, tenant_id, created_by)
SELECT cs.category_id, cs.id, btrim(t.name),
       trim(both '-' from regexp_replace(lower(unaccent(btrim(t.name))), '[^a-z0-9]+', '-', 'g')),
       false, %(tenant_uid)s, %(root_uid)s
FROM jsonb_to_recordset(%(tags)s::jsonb) AS t(sub text, name text)
JOIN public.categories_sub cs ON cs.slug = t.sub
ON CONFLICT (category_sub_id, slug) DO NOTHING
RETURNING 'tag' AS nivel, name, slug, category_sub_id;
```

`slug` da tag = `name` sem acento, minúsculo, com tudo que não é letra/número trocado por `-` (a query já faz). Tags de `pre-venda-e-estreias` e `reexibicoes` não são derivadas do payload.

**1.5 Relatório único, e PARAR.** Junte tudo em um relatório (JSON ou texto), entregue à pessoa responsável e **interrompa o robô**: não execute a Fase 2 nem grave nenhum anúncio.

```json
{
  "campos_nao_mapeados": [
    { "caminho": "bilheteria.total", "exemplo": 1234, "arquivos": ["a.json", "b.json"] }
  ],
  "taxonomia_inserida_pendente": {
    "rota_ui": "/painel/taxonomia/arvore",
    "itens": [
      { "nivel": "tag", "subcategoria": "em-cartaz", "nome": "Thriller", "slug": "thriller", "active": false }
    ]
  },
  "opcoes_novas_no_formulario": { "detalhes_genero": ["Thriller"], "detalhes_formatos": ["Dolby Atmos"], "sessoes.tipo": [] },
  "cidades_sem_ibge": [{ "cidade": "...", "uf": "..." }],
  "arquivos_afetados": { "Thriller": ["a.json"], "Dolby Atmos": ["a.json"], "bilheteria.total": ["a.json", "b.json"] }
}
```

Mensagem à pessoa responsável: "Inseri os itens acima como **pendentes** (`active = false`). Abra `/painel/taxonomia/arvore`, confira cada item (os inativos aparecem com o selo 'Inativa' ou esmaecidos), clique nele, ligue o switch **Ativo** e salve. Avise aqui quando terminar." Categorias e subcategorias também podem ser ativadas em `/painel/taxonomia/categorias` e `/painel/taxonomia/subcategorias`. Opções novas de formulário só são reportadas: quem edita o formulário é a pessoa responsável.

**1.6 Checagem de pendentes (liberar a Fase 2).** Só depois da confirmação da pessoa **em chat**: refaça a 1.2 (os arquivos podem ter mudado) e rode a query da 1.3 de novo. **0 linhas = liberado.** Qualquer linha (`ausente` ou `pendente`): volte à 1.4/1.5 e pare de novo. O robô nunca ativa por conta própria. Cidades sem IBGE, opções novas de formulário e campos não mapeados só deixam de bloquear se a pessoa decidir descartá-los explicitamente. Liberado, carregue os ids para a Fase 2:

```sql
SELECT g.id AS group_id, c.id AS category_id, cs.id AS sub_id, cs.slug AS sub_slug
FROM public.categories_group g
JOIN public.categories c ON c.category_group_id = g.id AND c.slug = 'cinema' AND c.active
LEFT JOIN public.categories_sub cs ON cs.category_id = c.id AND cs.active
WHERE g.slug = 'cinema' AND g.active
ORDER BY cs.slug;
```

Sem linha (ou sem a subcategoria esperada): abortar e reportar.

## Fase 2: inserção (por arquivo)

Só execute depois que a checagem 1.6 retornar 0 linhas e a pessoa confirmar em chat.

Antes de gravar, valide: `categoria = 'cinema'`, `moeda = 'BRL'`, `origem.fonte`, `origem.id_filme` e `origem.id_cinema` presentes. Arquivo inválido: pule e reporte.

Calcule:

- `preco_unit` = `'unit'` se `preco` existe, senão `'quote'`.
- `sub_slugs` (ver "Subcategorias").
- `answers` (ver "Formulário").
- `extras` = `{"origem": {...}}` copiado do payload; some `"images": [ids]` e `"coverFileId": id` só se alguma imagem foi gravada ou reaproveitada.

### De-para

| Campo do contrato | Destino | Conversão |
|---|---|---|
| `categoria` (= `cinema`) | `services.category_id` e `category_group_id` | ids do passo 1.6 (grupo `cinema` + categoria `cinema`) |
| `categoria` (taxonomia) | `categories_group` `cinema` (Cinema, ícone `Clapperboard`) e `categories` `cinema` (Cinema, ícone `Film`, `form_key = 'cinema'`) | 1.4, `active = false` se ausentes |
| (regra "Subcategorias") | `categories_sub`: `em-cartaz` (Em cartaz), `pre-venda-e-estreias` (Pré-venda & estreias), `reexibicoes` (Reexibições), `cinema-nacional-e-regional` (Cinema nacional & regional) | 1.4, só as usadas, `active = false` se ausentes |
| `detalhes.genero[]` | `categories_sub_tags` da sub `em-cartaz` | 1.4: `name` = valor, `slug` = slugify, `active = false` se ausente |
| `detalhes.formatos[]` | `categories_sub_tags` da sub `em-cartaz` | idem |
| `detalhes.idiomas[]` | `categories_sub_tags` da sub `em-cartaz`; `Nacional` na sub `cinema-nacional-e-regional` | idem |
| `detalhes.sessoes[].tipo[]` | `categories_sub_tags` da sub `em-cartaz` | idem |
| `detalhes.avisos_classificacao[]` | | não vira tag (só formulário) |
| campo fora da lista da 1.2 | | não grava; reportar em `campos_nao_mapeados` |
| `titulo` | `services.title` | direto |
| `descricao` | `services.description` | direto |
| `preco` | `services.starting_price` | null → 0 |
| `preco` (derivado) | `services.price_unit` | `preco_unit` |
| `moeda` | | só validar |
| `status` | `services.status` | `'active'` |
| `publicado_em` | `services.created_at` | ISO UTC → timestamptz |
| `expira_em` | `services.expires_at` | ISO UTC → timestamptz; null = sem validade |
| `local.nome` | `service_addresses.label` | direto |
| `local.endereco` | `service_addresses.street` e `number` | separar no último `, `; sem vírgula → tudo em `street` |
| `local.bairro` | `service_addresses.neighborhood` | direto |
| `local.cep` | `service_addresses.zip_code` | só dígitos |
| `local.latitude`, `local.longitude` | `service_addresses.latitude`, `longitude` | number |
| `local.cidade` | `service_addresses.city` | direto |
| `local.uf` | `service_addresses.state` | 2 letras maiúsculas |
| (IBGE da cidade) | `service_addresses.city_ibge` | resolvido na Fase 1.2 |
| `contato.*` | `answers.contato_telefone`, `contato_whatsapp`, `contato_email`, `contato_site`, `contato_link_ingresso` | direto |
| `midia.capa`, `midia.imagens[]` | `files` + `extras.coverFileId`, `extras.images` | baixar a URL e gravar em `files` (passo 3) |
| `midia.trailer_url` | `answers.detalhes_trailer_url` | direto |
| `midia.capa_local`, `midia.imagens_locais[]` | | ignorar |
| `detalhes.titulo_obra` | `answers.detalhes_titulo_obra` | direto (obrigatório) |
| `detalhes.titulo_original` | `answers.detalhes_titulo_original` | direto |
| `detalhes.classificacao_indicativa` | `answers.detalhes_classificacao_indicativa` | direto |
| `detalhes.distribuidora` | `answers.detalhes_distribuidora` | direto |
| `detalhes.duracao_min` | `answers.detalhes_duracao_min` | number ≥ 1 |
| `detalhes.ano_lancamento` | `answers.detalhes_ano_lancamento` | number |
| `detalhes.avisos_classificacao[]` | `answers.detalhes_avisos_classificacao` | array normalizado |
| `detalhes.genero[]` | `answers.detalhes_genero` | array normalizado |
| `detalhes.idiomas[]` | `answers.detalhes_idiomas` | array normalizado |
| `detalhes.formatos[]` | `answers.detalhes_formatos` | array normalizado |
| `detalhes.pre_venda` | `answers.detalhes_pre_venda` | gravar só se `true` |
| `detalhes.reexibicao` | `answers.detalhes_reexibicao` | gravar só se `true` |
| `detalhes.sessoes[]` | `answers.sessoes` | ver "Sessões" |
| `origem.*` | `extras.origem.*` | direto |

### Formulário (`answers`)

Objeto JSON com chaves planas (as da tabela acima), montado inteiro a cada execução; o upsert substitui o anterior.

- Omita chaves `null`, string vazia e array vazio. Aplique `trim()` nas strings.
- Números como JSON number, nunca string.
- Booleanos: só a chave com `true`.
- Arrays normalizados: para cada valor, ache a opção equivalente (sem diferença de caixa e acento) em `schema_snapshot` e grave o valor da opção; remova duplicados. Após a Fase 1, todo valor deve casar; se algum não casar, descarte-o e registre no log.

### Sessões (`answers.sessoes`)

Cada item, omitindo o que não tem valor: `id_origem` (string), `data` (`AAAA-MM-DD`), `horario` (`HH:MM`, sem segundos), `preco` (number, 2 casas), `sala`, `tipo` (array normalizado), `url_compra`, `lugares_disponiveis` (number).

- Descarte a sessão sem `data` ou sem `horario`.
- Ordene por `data`, `horario`, `sala`, `id_origem`.
- Sem sessões válidas: omita a chave `sessoes` (o anúncio é gravado mesmo assim).

### Subcategorias

`service_categories_sub` recebe uma linha por subcategoria. Regra aditiva:

```
sub_slugs = ['pre-venda-e-estreias' se detalhes.pre_venda senão 'em-cartaz']
          + ['reexibicoes']                se detalhes.reexibicao
          + ['cinema-nacional-e-regional'] se 'Nacional' em detalhes.idiomas (já normalizado)
```

`mostras-e-cineclubes` e `sessoes-especiais` são manuais: o robô não as usa. Tags não são ligadas ao anúncio (só existem na taxonomia, ver 1.4).

### Queries

**1. Serviço existente?** (0 ou 1 linha; decide entre os passos 4 e 5)
```sql
SELECT id, status, extras FROM public.services
WHERE tenant_id = %(tenant_uid)s AND active
  AND extras->'origem'->>'fonte' = %(fonte)s
  AND extras->'origem'->>'id_filme' = %(id_filme)s
  AND extras->'origem'->>'id_cinema' = %(id_cinema)s
ORDER BY id LIMIT 1;
```

**2. Imagem já existe?** (para cada imagem, capa primeiro)
```sql
SELECT id FROM public.files
WHERE tenant_id = %(tenant_uid)s AND purpose = 'service_image' AND active
  AND original_name = %(nome)s AND size_bytes = %(tamanho)s LIMIT 1;
```

**3. Imagem nova** (`file_id` = uuid gerado; `storage_path` = `service_image/AAAA/MM/<file_id>-<nome>`; `content` = bytes). Guarde os ids em ordem em `images` e o da capa em `coverFileId`. Download falhou: pule a imagem.
```sql
INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, purpose, content, active)
VALUES (%(file_id)s, %(root_uid)s, %(tenant_uid)s, %(nome)s, %(storage_path)s, %(mime)s, %(tamanho)s, 'service_image', %(content)s, true);
```

**4. Passo 1 sem linha: inserir serviço** (guarde `service_id`)
```sql
INSERT INTO public.services
  (title, category_group_id, category_id, description, starting_price, price_unit, status,
   service_location, extras, expires_at, tenant_id, created_by, created_at, active)
VALUES (%(titulo)s, %(group_id)s, %(category_id)s, %(descricao)s, COALESCE(%(preco)s, 0), %(preco_unit)s::public.price_unit,
        'active', 'no_estabelecimento', %(extras)s::jsonb, %(expira_em)s::timestamptz, %(tenant_uid)s, %(root_uid)s, %(publicado_em)s, true)
RETURNING id;
```

**5. Passo 1 com linha: atualizar serviço** (mantém o status se estiver `paused` ou `archived`)
```sql
UPDATE public.services SET
  title = %(titulo)s, description = %(descricao)s,
  starting_price = COALESCE(%(preco)s, 0), price_unit = %(preco_unit)s::public.price_unit,
  status = CASE WHEN status IN ('paused','archived') THEN status ELSE 'active' END,
  extras = (extras - 'contato' - 'detalhes' - 'midia') || %(extras)s::jsonb,
  expires_at = %(expira_em)s::timestamptz, updated_at = now()
WHERE id = %(service_id)s;
```

**6. Endereço do cinema** (um endereço principal por anúncio)
```sql
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

**7. Respostas do formulário** (insere ou atualiza; `form_id`, `form_version`, `schema_snapshot` da Fase 1.1)
```sql
INSERT INTO public.form_results
  (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
VALUES (%(form_id)s, 'cinema', %(service_id)s::text, 'service', %(form_version)s,
        %(schema_snapshot)s::jsonb, %(answers)s::jsonb, %(root_uid)s, %(tenant_uid)s)
ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
  answers = EXCLUDED.answers, version = EXCLUDED.version, schema_snapshot = EXCLUDED.schema_snapshot,
  form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now();
```

**8. Subcategorias** (remova as que deixaram de valer e insira uma linha por `sub_id` de `sub_slugs`)
```sql
DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
WHERE scs.service_id = %(service_id)s AND cs.id = scs.category_sub_id AND cs.category_id = %(category_id)s
  AND cs.slug <> ALL(%(sub_slugs)s);

INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
VALUES (%(service_id)s, %(group_id)s, %(category_id)s, %(sub_id)s, %(tenant_uid)s, %(root_uid)s)
ON CONFLICT (service_id, category_sub_id) DO NOTHING;
```

**Uma vez, antes do lote (opcional)** — índice de idempotência; só aplique se não houver anúncios duplicados:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS services_origem_uq ON public.services
  ((extras->'origem'->>'fonte'), (extras->'origem'->>'id_filme'), (extras->'origem'->>'id_cinema'))
  WHERE extras ? 'origem';
```

## Sem destino

- Slug do anúncio: não existe; o identificador público é `services.uid`.
