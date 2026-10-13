# De-para: artigos `content/lugares` → banco Kizuna

Instruções para gravar os artigos de lugares (casas noturnas, estádio, shoppings, casas de festas) como anúncios (`public.services`) no tenant do usuário root. O caminho padrão é gerado: `scripts/lugares-para-servicos.mjs` lê os artigos e escreve `db/extras/lugares_import.sql`, que faz as Fases 1 e 2 abaixo numa transação só. Quem gravar por outro meio (robô) segue as mesmas queries.

```
node scripts/lugares-para-servicos.mjs                 # gera db/extras/lugares_import.sql (status inicial 'pending')
node kizuna-core/cli db run db/extras/lugares_import.sql   # aplica (usa DATABASE_URL ou --db-url)
```

Opções do script: `--status pending|active|paused|archived` (status no INSERT; padrão `pending`), `--only <slug>` (um lugar só), `--out <arquivo.sql>`.

## Regras

- Conecte como dono/superuser. Parâmetros no formato `%(nome)s` (psycopg); no SQL gerado eles já vêm resolvidos como constantes de cada bloco `DO`.
- **Um artigo = um lugar = um anúncio.** Pasta `content/lugares/<slug>/` = um anúncio.
- Chave do anúncio: `services.extras.origem.fonte = 'content/lugares'` + `extras.origem.slug = <slug>`. **Rodar de novo atualiza o anúncio existente**; nada duplica. O anúncio é procurado também entre os inativos (`active = false`): o import não o reativa nem cria outro.
- Sempre informe `tenant_id` e `created_by` (não há JWT; os defaults vêm NULL e o insert falha). Root e tenant vêm da query 1.1.
- **Status:** no INSERT, `pending` (fila de moderação; o dono aprova no painel). No UPDATE o status **não muda** (o que o dono aprovou, pausou ou arquivou fica como está).
- **Edição do dono não é sobrescrita:** `title` e `description` só mudam no UPDATE se continuam iguais ao que o último import gravou (md5 em `extras.origem.titulo_md5` / `descricao_md5`). Isso também protege descrição revisada por IA e aprovada.
- Grupo, categoria e subcategoria são resolvidos **por slug**, nunca por id fixo. Categoria ou subcategoria ausente aborta tudo (exceto a subcategoria nova da 1.3).
- Taxonomia que falta é inserida **sempre com `active = false`**. O import nunca ativa, edita nem apaga taxonomia. Quem ativa é a pessoa responsável, em `/painel/taxonomia/arvore`.
- Uma transação só para o lote inteiro: qualquer erro desfaz tudo.
- Não rode seeds nem migrations junto. Depois do import existem serviços, e o seed de taxonomia (`db/extras/taxonomy_seed_bora_cuiaba.sql`, destrutivo) passa a abortar: isso é esperado.
- Nenhuma das categorias usadas tem `form_key`: **não há `form_results`**. Contato, horário, preço e dicas vão para `services.extras` (ver "Sem destino"). Se uma categoria ganhar formulário, o SQL só avisa (NOTICE) e continua gravando em `extras`.

## Contrato de entrada (o artigo)

Arquivo `content/lugares/<slug>/index.md`: frontmatter YAML (subconjunto: `chave: valor` com aspas opcionais, listas com hífen, comentários com `#`) + corpo Markdown. Fotos em `public/lugares/<slug>/` (arquivos de imagem, ordenados pelo nome; o primeiro é a capa). A validação de referência é `src/lib/lugares.ts`.

| Caminho | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `<slug>` (nome da pasta) | slug | sim | chave do anúncio |
| `titulo` | text | sim | nome do lugar |
| `categoria` | text | sim | rótulo editorial ("Shopping", "Casa noturna"…); **não** decide a taxonomia (ver "Taxonomia") |
| `cidade` | slug | sim | `cuiaba-mt` |
| `resumo` | text | sim | até 155 caracteres |
| `status` | text | sim | `rascunho`, `revisao` ou `aprovado` (status editorial do artigo) |
| `atualizado_em` | `AAAA-MM-DD` | sim | |
| `endereco` | text | não | `Rua, número, [complemento, …] bairro, Cidade - UF` |
| `latitude`, `longitude` | number | não | vêm juntas |
| `horario[]` | text | não | uma linha livre por item |
| `telefone`, `instagram`, `site` | text | não | |
| `preco` | text | não | texto livre (não é número) |
| `dicas_chegada` | text | não | |
| `creditos` | text | não | créditos das fotos (`Fotos: …`) |
| `tags` | lista ou text | não | tags de agrupamento a mais (lista com hífen ou texto separado por vírgula); somam às geradas (ver "Tags") |
| corpo | Markdown | sim | texto do artigo |
| fotos | jpg/png/webp/gif | não | `public/lugares/<slug>/*` |

O arquivo de pauta e apuração (`redacao/artigos/_rascunhos/<slug>.md`, com as pendências do editor) **não** é lido.

## Taxonomia (lugar → grupo / categoria / subcategorias)

O mapeamento fica na constante `TAXONOMIA` do script. Lugar novo sem entrada lá faz o script parar.

| Lugar | Grupo / Categoria / Subcategorias | Por quê |
|---|---|---|
| `lua-morena` | `bares-e-vida-noturna` / `baladas-e-casas-noturnas` / `casas-noturnas`, `sertanejo-e-forro` | casa noturna com bailes de forró e sertanejo, como o artigo descreve |
| `arena-pantanal` | `esportes-e-lazer` / `jogos-e-estadios` / `futebol` (tag de agrupamento: `estadios`) | é o estádio; "Jogos & Estádios" é a categoria de estádios e "Futebol" cita a própria Arena nas tags |
| `goiabeiras-shopping`, `pantanal-shopping`, `shopping-estacao-cuiaba`, `shopping-tres-americas` | `compras-e-feiras` / `shoppings-e-lojas` / `shoppings` | a subcategoria Shoppings já existe |
| `buffet-infantil-mundo-magico` | `familia-e-criancas` / `programacao-infantil` / `festas-e-buffets-infantis` | buffet infantil; a subcategoria existente é exatamente essa |
| `espaco-art-festas-e-eventos` | `familia-e-criancas` / `passeios-em-familia` / `casas-de-festas` (**nova**) | locação para aniversários, casamentos e encontros de família, não só festa infantil; o grupo Eventos foi evitado porque as categorias dele usam o formulário e o card de evento (com data) |

### Subcategoria nova

| Categoria | Nome | Slug | `active` |
|---|---|---|---|
| `passeios-em-familia` | Casas de festas | `casas-de-festas` | `false` (pendente) |

O anúncio do Espaço Art é vinculado a ela mesmo pendente (o anúncio também nasce `pending`). Enquanto ela não for ativada, a busca não a considera.

## Tags (`extras.tags`)

Cada lugar grava `services.extras.tags` (array de strings; convenção do core em `kizuna-core/docs/plugins/services.md`): minúsculas, sem acento, kebab-case, `:` separando prefixo.

1. **Agrupamento:** o campo `tag` da entrada em `TAXONOMIA`, se houver; senão o slug da 1ª subcategoria (`casas-de-festas`, `shoppings`, `casas-noturnas`, `festas-e-buffets-infantis`; a Arena usa `estadios`).
2. **Local:** `local:<slug>` (ex.: `local:espaco-art-festas-e-eventos`), convenção anterior: a tela de detalhe mostra o carrossel "Neste local" com os anúncios que têm a mesma tag. O vínculo novo é pelo `codigo` (abaixo): eventos citam só `<slug>`.
3. **Frontmatter `tags`** (opcional): cada item normalizado do mesmo jeito, somado aos dois acima, sem repetir.

**Código (`extras.codigo`):** cada lugar grava `extras.codigo = <slug>` (o slug do arquivo, sem prefixo). Outros anúncios (eventos) o citam em `extras.tags`: a página do evento mostra "Organizado por <lugar>" com link, e a página do lugar lista os anúncios vinculados em um carrossel "Vinculados". Opcionalmente o frontmatter `vinculos_titulo` (texto de até 60 caracteres) vira `extras.vinculosTitulo`, o título desse carrossel. A regra é genérica (ver "Código, organizador e vinculados" em `kizuna-core/docs/plugins/services.md`); o link não usa `origem.slug`.

O banco valida o formato dessas chaves (até 10 tags; tag e código com `[a-z0-9][a-z0-9:._-]{0,59}`, código sem dois-pontos; título até 60 caracteres) e o script falha antes de gerar o SQL se algum valor não couber. O import roda sem JWT (superusuário), que é sessão de sistema e dispensa a permissão `services.link`.

**Cada execução do import sobrescreve `tags`, `codigo` e `vinculosTitulo`:** o que foi editado no painel nessas três chaves é perdido na próxima execução (ponha no frontmatter).

`tags`, `codigo` e `vinculosTitulo` são **do import**: o UPDATE remove as três chaves de `extras` e regrava as geradas (`extras - 'tags' - 'codigo' - 'vinculosTitulo'`). Consequência: `vinculosTitulo` posto à mão no banco some no próximo import se o frontmatter não tiver `vinculos_titulo`, e o `codigo` é sempre o slug do arquivo."

## Fase 1: verificação prévia (antes de qualquer lugar)

O SQL gerado repete 1.1 e 1.2 dentro de cada bloco e aborta (`RAISE EXCEPTION`) se faltar algo.

**1.1 Contexto** (sem linha: abortar)

```sql
SELECT u.uid AS root_uid, t.uid AS tenant_uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;
```

**1.2 Categoria do lugar** (uma linha; sem linha: abortar e mandar rodar o seed de taxonomia)

```sql
SELECT g.id AS group_id, c.id AS category_id, NULLIF(c.form_key, '') AS form_key
FROM public.categories c JOIN public.categories_group g ON g.id = c.category_group_id
WHERE g.slug = %(grupo)s AND c.slug = %(categoria)s;
```

Subcategorias: todas as de `subs` precisam existir sob `category_id` (ativas ou não); a que faltar aborta, salvo a da 1.3.

```sql
SELECT s FROM unnest(%(subs)s::text[]) s
WHERE NOT EXISTS (SELECT 1 FROM public.categories_sub cs WHERE cs.slug = s AND cs.category_id = %(category_id)s);
```

**1.3 Subcategoria nova** (pendente; slug ocupado sob outra categoria: abortar e reportar)

```sql
INSERT INTO public.categories_sub (category_id, name, slug, description, tags, active, tenant_id, created_by)
SELECT c.id, 'Casas de festas', 'casas-de-festas',
       'Espaços para alugar: aniversários, casamentos, encontros de família e confraternizações.',
       'casa de festas, salão de festas, locação de espaço, aniversário, casamento, confraternização',
       false, %(tenant_uid)s, %(root_uid)s
FROM public.categories c WHERE c.slug = 'passeios-em-familia'
ON CONFLICT (slug) DO NOTHING;
```

**1.4 Varredura dos artigos** (feita pelo script)

- Campos obrigatórios presentes (`titulo`, `categoria`, `cidade`, `resumo`, `status`, `atualizado_em`); `latitude`/`longitude` juntas; `endereco` terminando em `Cidade - UF`. Falhou: o script para.
- Chave fora do contrato: aviso `campos não mapeados` no console (não grava).
- Lugar sem entrada em `TAXONOMIA`: o script para.

**1.5 Relatório.** O SQL emite um `NOTICE` por lugar (`inserido`/`atualizado`, id do serviço), e avisa cidade sem código IBGE e categoria com `form_key`. Depois de aplicar, avise a pessoa responsável: "Inseri a subcategoria **Casas de festas** como pendente (`active = false`) em Família & Crianças › Passeios em Família. Abra `/painel/taxonomia/arvore`, confira, ligue o switch **Ativo** e salve. Os 8 anúncios estão `pending` na moderação."

## Fase 2: inserção (por lugar)

Calcule:

- `descricao` = corpo Markdown (`trim()`) + linha em branco + `creditos` (se não começar com `Fotos:`, prefixar `Fotos: `). Sem `creditos`: só o corpo.
- `endereco` (de `endereco`, separado por vírgulas): o último trecho é `Cidade - UF`; o primeiro é a rua; o segundo, se for número ou `s/n`, é o número; o último que sobrar é o bairro; o que ficar no meio é o complemento (ex.: `Quadra 90`).
- `cidade_ibge`: `location_city.id` com o nome da cidade e a UF (`location_state.code`); sem linha: `NULL` e aviso.
- Fotos: para cada arquivo, `sha256` dos bytes e `file_id` = UUID determinístico de `content/lugares|<slug>|<arquivo>|<sha256>` (mesma foto, mesmo id; foto trocada, id novo). `original_name` = `<slug>-<arquivo>`; `storage_path` = `service_image/AAAA/MM/<file_id>-<original_name>` (AAAA/MM de `atualizado_em`); `mime`, `width` e `height` lidos do cabeçalho da imagem.
- `extras` (chaves vazias omitidas):

```json
{
  "origem": {
    "fonte": "content/lugares", "slug": "goiabeiras-shopping",
    "arquivo": "content/lugares/goiabeiras-shopping/index.md",
    "atualizado_em": "2026-10-11", "status_artigo": "revisao", "categoria_artigo": "Shopping",
    "cidade": "cuiaba-mt", "titulo_md5": "…", "descricao_md5": "…",
    "fotos": [{ "arquivo": "public/lugares/goiabeiras-shopping/01.jpg", "sha256": "…", "fileId": "…" }]
  },
  "resumo": "…", "endereco_texto": "Av. José Monteiro de Figueiredo, 500, Duque de Caxias, Cuiabá - MT",
  "contato": { "telefone": "(65) 3315-2300", "instagram": "@goiabeirasshopping", "site": "https://…" },
  "horario": ["Lojas: seg a sáb, 10h às 22h; dom, 14h às 20h", "…"],
  "preco": "…", "dicas_chegada": "…", "creditos": "Fotos: …",
  "tags": ["shoppings", "local:goiabeiras-shopping"],
  "codigo": "goiabeiras-shopping",
  "images": ["<file_id>", "…"], "coverFileId": "<file_id>"
}
```

### De-para

| Campo do artigo | Destino | Conversão |
|---|---|---|
| `<slug>` | `extras.origem.slug` | chave do anúncio |
| `<slug>` | `extras.codigo` | o próprio slug; os eventos o citam em `tags` |
| `vinculos_titulo` | `extras.vinculosTitulo` | opcional; `trim()`, 1 a 60 caracteres, senão não grava |
| `titulo` | `services.title`, `service_addresses.label` | `trim()`; no UPDATE só se não foi editado |
| corpo + `creditos` | `services.description` | ver cálculo; no UPDATE só se não foi editada |
| `categoria` | `extras.origem.categoria_artigo` | só rastreio; a taxonomia vem da tabela "Taxonomia" |
| (taxonomia) | `services.category_group_id`, `category_id`, `service_categories_sub` | por slug (1.2) |
| `cidade` | `extras.origem.cidade` | direto |
| `resumo` | `extras.resumo` | direto |
| `status` | `extras.origem.status_artigo` | só rastreio; `services.status` = `pending` no INSERT |
| `atualizado_em` | `extras.origem.atualizado_em` | texto `AAAA-MM-DD` |
| `endereco` | `service_addresses.street`, `number`, `complement`, `neighborhood`, `city`, `state`; texto original em `extras.endereco_texto` | ver cálculo |
| (cidade + UF) | `service_addresses.city_ibge` | `location_city` |
| `latitude`, `longitude` | `service_addresses.latitude`, `longitude` | 6 casas; ausentes ou os dois `0` → `NULL` |
| `telefone`, `instagram`, `site` | `extras.contato.telefone`, `.instagram`, `.site` | direto |
| `horario[]` | `extras.horario` | lista de textos |
| `preco` | `extras.preco` | texto; `starting_price = 0`, `price_unit = 'quote'` |
| `dicas_chegada` | `extras.dicas_chegada` | direto |
| `creditos` | `extras.creditos` e fim da `description` | direto |
| (taxonomia) + `<slug>` + `tags` | `extras.tags` | ver "Tags" |
| fotos | `public.files` + `extras.images` / `extras.coverFileId` / `extras.origem.fotos` | passos 2 e 3 |
| (fixo) | `services.service_location` | `'no_estabelecimento'` |
| chave fora do contrato | | não grava; aviso no console |

### Queries

**1. Serviço existente?** (0 ou 1 linha; inclui inativos)
```sql
SELECT id, extras, title, description FROM public.services
WHERE tenant_id = %(tenant_uid)s
  AND extras->'origem'->>'fonte' = 'content/lugares'
  AND extras->'origem'->>'slug' = %(slug)s
ORDER BY id LIMIT 1;
```

**2. Fotos** (uma por arquivo, capa primeiro; `content` = bytes, no SQL gerado `decode('<hex>', 'hex')`)
```sql
INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, width, height,
                          purpose, content, active)
VALUES (%(file_id)s, %(root_uid)s, %(tenant_uid)s, %(original_name)s, %(storage_path)s, %(mime)s, %(tamanho)s,
        %(width)s, %(height)s, 'service_image', %(content)s, true)
ON CONFLICT (id) DO UPDATE SET active = true, updated_at = now();
```

**3. Lista de imagens.** `images` = ids das fotos do artigo, na ordem, seguidos dos ids que já estavam em `extras.images` e **não** vieram de um import anterior (`extras.origem.fotos[].fileId`), ou seja, fotos subidas pelo painel. `coverFileId` = a capa atual se ela não veio do import e continua na lista; senão o primeiro de `images`. Sem imagem nenhuma: omitir as duas chaves. Fotos de import anterior que saíram do artigo são desativadas:
```sql
UPDATE public.files SET active = false, updated_at = now()
WHERE id::text = ANY(%(file_ids_import_anterior)s::text[]) AND id::text <> ALL(%(file_ids_atuais)s::text[]) AND active;
```

**4. Passo 1 sem linha: inserir serviço** (guarde `service_id`)
```sql
INSERT INTO public.services
  (title, category_group_id, category_id, description, starting_price, price_unit, status,
   service_location, extras, tenant_id, created_by, active)
VALUES (%(titulo)s, %(group_id)s, %(category_id)s, %(descricao)s, 0, 'quote', %(status)s::public.service_status,
        'no_estabelecimento', %(extras)s::jsonb, %(tenant_uid)s, %(root_uid)s, true)
RETURNING id;
```

**5. Passo 1 com linha: atualizar serviço** (status, `active` e `created_at` não mudam; título/descrição só se iguais ao último import; chaves de `extras` que não são deste de-para são preservadas)
```sql
UPDATE public.services SET
  title = CASE WHEN %(old_titulo_md5)s IS NULL OR md5(title) = %(old_titulo_md5)s THEN %(titulo)s ELSE title END,
  description = CASE WHEN %(old_descricao_md5)s IS NULL OR md5(coalesce(description, '')) = %(old_descricao_md5)s
                     THEN %(descricao)s ELSE description END,
  category_group_id = %(group_id)s, category_id = %(category_id)s,
  extras = (extras - 'origem' - 'resumo' - 'endereco_texto' - 'contato' - 'horario' - 'preco' - 'dicas_chegada'
                   - 'creditos' - 'tags' - 'images' - 'coverFileId') || %(extras)s::jsonb,
  updated_at = now()
WHERE id = %(service_id)s;
```

Em `%(extras)s` do UPDATE, `origem.titulo_md5`/`descricao_md5` continuam os antigos quando o campo foi editado (assim a proteção vale nas próximas execuções).

**6. Endereço** (apaga os do anúncio e grava um, principal)
```sql
DELETE FROM public.service_addresses WHERE service_id = %(service_id)s;

INSERT INTO public.service_addresses
  (service_id, label, street, number, complement, neighborhood, city, state, city_ibge,
   latitude, longitude, is_primary, tenant_id, created_by, active)
VALUES (%(service_id)s, %(titulo)s, %(street)s, %(number)s, %(complement)s, %(neighborhood)s, %(city)s, %(state)s,
        %(city_ibge)s, %(latitude)s, %(longitude)s, true, %(tenant_uid)s, %(root_uid)s, true);
```

**7. Subcategorias** (remove as que deixaram de valer, inclusive de outra categoria; insere as de `subs`)
```sql
DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
WHERE scs.service_id = %(service_id)s AND cs.id = scs.category_sub_id
  AND (cs.category_id <> %(category_id)s OR cs.slug <> ALL(%(subs)s::text[]));

INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
SELECT %(service_id)s, %(group_id)s, %(category_id)s, cs.id, %(tenant_uid)s, %(root_uid)s
FROM public.categories_sub cs WHERE cs.category_id = %(category_id)s AND cs.slug = ANY(%(subs)s::text[])
ON CONFLICT (service_id, category_sub_id) DO NOTHING;
```

## Sem destino

- **Contato, horário, preço, dicas de chegada, resumo e créditos** não têm coluna em `services` e as categorias não têm formulário: ficam em `services.extras` (`contato`, `horario`, `preco`, `dicas_chegada`, `resumo`, `creditos`). A tela de detalhe do anúncio hoje **não** mostra essas chaves; só a descrição (que traz os créditos no fim e, em vários artigos, a seção de contato no corpo). Para exibi-las é preciso um formulário de categoria (ex.: `forms_seed_lugares.sql` com `contato_telefone`, `contato_instagram`, `link`, `horario`, `preco`) ou suporte no app; fora deste de-para.
- **Preço:** `preco` é texto livre ("Visita guiada gratuita, com agendamento"); `starting_price = 0` e `price_unit = 'quote'` (aparece como "Sob consulta").
- **Status editorial** (`rascunho`/`revisao`/`aprovado`) e **pendências do editor** (`redacao/artigos/_rascunhos/`) não viram status do anúncio; o anúncio nasce `pending` e o dono decide. O status do artigo fica em `extras.origem.status_artigo`.
- **Rótulo `categoria` do artigo:** só rastreio; não existe coluna para rótulo editorial.
- **Slug do anúncio:** não existe; o identificador público é `services.uid`.
- **CEP:** o artigo não traz; `zip_code` fica `NULL`.
- **Miniatura das fotos** (`files.thumb_content`): não é gerada no import direto; a rota de conteúdo devolve a foto grande até a imagem ser reotimizada.
- **Créditos por foto:** `files` não tem coluna de crédito/licença; o crédito é um texto único por lugar (`extras.creditos` e fim da descrição).
- **Lugares sem fotos** (`lua-morena`, `espaco-art-festas-e-eventos`, `buffet-infantil-mundo-magico`): anúncio sem `images`/`coverFileId`.
- **Lugares sem coordenadas** (`espaco-art-festas-e-eventos`, `buffet-infantil-mundo-magico`): `latitude`/`longitude` `NULL`.
