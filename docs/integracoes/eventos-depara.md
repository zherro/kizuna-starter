# De-para: payload `eventos` (assistente) → banco Kizuna

Instruções para o robô que lê o payload do evento montado no assistente de publicação (`contracts/eventos.v1.json` do repositório crawler; o robô é o `manager`, em `core/publicar/eventos/`) e grava o anúncio direto no Postgres, no tenant do usuário root. Exemplo completo do payload: [eventos-exemplo.json](eventos-exemplo.json).

## Regras

- Conecte como dono/superuser. Parâmetros no formato `%(nome)s` (psycopg).
- **Um payload = um evento = um anúncio.** Evento com vários dias: um item por dia em `detalhes.sessoes[]`, no mesmo payload.
- Chave do anúncio: `origem.fonte` + `origem.id_evento`. **Publicar de novo atualiza o anúncio existente** (pode rodar inserção/atualização quantas vezes quiser; nada duplica). O assistente garante que `id_evento` é único por edição (ex.: `celebration-flashback-2026-10-10`), para que a edição do ano seguinte não sobrescreva a anterior.
- Execute a **Fase 1** uma vez antes de tudo e a **Fase 2** para cada arquivo, na ordem.
- Rode cada arquivo da Fase 2 numa transação (o passo 6 apaga e recria o endereço).
- Sempre informe `tenant_id` e `created_by`/`submitted_by` (não há JWT).
- Não use colunas fora deste documento. Não rode seeds nem migrations.
- **Categoria** (`taxonomia.categoria`) tem que existir, estar ativa e ter `form_key = 'eventos'`. O robô nunca cria categoria: arquivo com categoria inválida é pulado e reportado.
- **Subcategoria** (`taxonomia.subcategorias[]`) que faltar é inserida **sempre com `active = false`**. O robô **nunca** ativa, edita ou apaga taxonomia; quem ativa é a pessoa responsável, pela UI. **Nenhum anúncio é gravado enquanto houver subcategoria usada pelos arquivos que não esteja `active = true`.**
- **Opções de formulário** (`ingressos.tipo`): o robô **acrescenta ao `forms.schema`** a opção que faltar (passo 1.5) e segue. Nunca remova nem renomeie opção existente. `classificacao_indicativa` tem opções fixas: valor fora delas é omitido e reportado.
- **Validade:** só por `services.expires_at` (a plataforma já a vigia: expirou, está inativo). O assistente não emite `encerrado` nem `esgotado`.
- **Sem campo no formulário:** meia-entrada, acessibilidade, formas de pagamento, canais de venda e observações. O assistente as resume na descrição do anúncio ("Informações úteis"), então `description` já as traz.
- **Descrição revisada por IA não é sobrescrita:** no UPDATE, `description` só muda se o serviço **não** tiver linha em `public.service_text_revisions` com `field = 'description'` e `status = 'approved'`.
- Grave em `public.form_results` direto; não use `fn_form_result_upsert`.

## Contrato do payload

Só os caminhos abaixo têm destino; qualquer outro vai em `campos_nao_mapeados`. (`local.numero`, `local.complemento`, `taxonomia.*`, `origem.url` e `origem.coletado_em` entram no contrato do assistente junto com a publicação.)

| Caminho | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `categoria` | text | sim | `eventos` |
| `titulo` | text | sim | nome do evento |
| `descricao` | text | sim | texto do divulgador (original) |
| `descricao_revisada` | text | não | descrição resumida pela IA, com "Informações úteis"; tem prioridade sobre `descricao` |
| `moeda` | text | sim | `BRL` |
| `status` | text | sim | `ativo`, `pausado` ou `cancelado` (`encerrado` também é aceito) |
| `preco` | number | não | menor valor de ingresso; `null` = robô calcula |
| `publicado_em` | ISO 8601 | não | `null` = agora, só no insert |
| `expira_em` | ISO 8601 | não | `null` = robô calcula pelo fim da última sessão |
| `taxonomia.categoria` | slug | sim | categoria com `form_key = 'eventos'` (ver 1.3); escolhida pelo usuário |
| `taxonomia.subcategorias[].slug`, `.nome` | slug, text | não | subcategorias da categoria acima |
| `local.nome`, `local.endereco`, `local.numero`, `local.complemento`, `local.bairro` | text | não | |
| `local.cidade`, `local.uf` | text | sim | resolvem o IBGE |
| `local.cep`, `local.latitude`, `local.longitude` | text, number | não | |
| `contato.telefone`, `contato.whatsapp`, `contato.email` | text | não | |
| `contato.site`, `contato.link_ingresso` | URL | não | `site` vira `answers.link` |
| `midia.capa`, `midia.imagens_locais[]` | caminho | não | arquivos do assistente (`/media/<arquivo>`); a capa é a primeira |
| `detalhes.organizador` | text | não | vira `realizador` |
| `detalhes.classificacao_indicativa` | text | não | `livre`, `10`, `12`, `14`, `16` ou `18` (aceita `18+`, `18 anos`) |
| `detalhes.gratuito` | boolean | não | `true` = entrada franca |
| `detalhes.artistas[]` | text | não | um texto livre por artista |
| `detalhes.sessoes[].data` | `AAAA-MM-DD` | sim (≥ 1) | |
| `detalhes.sessoes[].hora`, `.fim`, `.abertura_portas` | `HH:MM` | não | `fim` menor ou igual a `hora` = termina no dia seguinte; horário é opcional |
| `detalhes.ingressos[].setor`, `.tipo`, `.lote`, `.comprar` | text | não | `tipo`: Inteira, Meia, Social…; `comprar`: texto livre (como/onde comprar) |
| `detalhes.ingressos[].pessoas` | number | não | pessoas por ingresso (mesa, bistrô, camarote); é também a quantidade de pulseiras. `1` para individual |
| `detalhes.ingressos[].valor` | number | não | em reais |
| `detalhes.pontos_de_venda[]` | text | não | um texto livre por ponto de venda |
| `detalhes.pontos_de_venda[].link` | url | não | link de compra do ingresso NAQUELE ponto, se a fonte trouxer (ver "Código do lugar") |
| `origem.fonte`, `origem.id_evento` | text | sim | chave do anúncio |
| `origem.url`, `origem.coletado_em` | text | não | |
| `tags[]` | text | não | tags de agrupamento do anúncio (ver "Tags"); ausente = nenhuma |

**Ignorados** (não gravam e não vão para `campos_nao_mapeados`): `detalhes.nome_evento`, `detalhes.tipo_evento`, `detalhes.texto_original`, `detalhes.alertas[]`, `detalhes.ingressos[].evidencia`, `detalhes.ingressos[].taxa`, `origem.chave_dedup`, `revisao.*`, `revisao_descricao.*`.

## Fase 1: verificação prévia (antes de inserir qualquer arquivo)

**1.1 Contexto** (guarde para a Fase 2)

```sql
-- root e tenant (sem linha: abortar)
SELECT u.uid AS root_uid, t.uid AS tenant_uid
FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;

-- formulário (sem linha: abortar). Releia depois do passo 1.5.
SELECT id AS form_id, version AS form_version, schema AS schema_snapshot
FROM public.forms WHERE tenant_id = %(tenant_uid)s AND form_key = 'eventos' AND active;
```

Confira no `schema_snapshot` que existem estes campos (por `key`) e subcampos (`itemFields`). Faltou algum: aborte e reporte "rode `db/extras/pendentes_forms_eventos.sql`".

```
data_inicio data_fim realizador link classificacao_indicativa gratuito
link_ingresso contato_telefone contato_whatsapp contato_email
artistas: nome
sessoes: data abertura_portoes hora_inicio hora_fim
ingressos: titulo setor tipo pessoas lote valor comprar
```

Endereço, local do evento e pontos de venda não são campos do formulário: o endereço vai em `service_addresses` (passo 6), `local_ref` e `pontos_de_venda` em `services.extras` (ver "Código do lugar").

**1.2 Varredura.** Leia os payloads (guarde de qual evento veio cada valor) e monte:

| Coletar (sem diferença de caixa e acento) | Compara com | Se faltar |
|---|---|---|
| `taxonomia.categoria` | categorias com `form_key = 'eventos'` (1.3) | arquivo pulado e reportado |
| `taxonomia.subcategorias[]` | subcategorias da categoria do arquivo (1.4) | 1.4/1.6 (pendente, bloqueia) |
| `detalhes.ingressos[].tipo` | `options` de `itemFields[key='tipo']` do campo `ingressos` | 1.5 (acrescenta, não bloqueia) |
| `detalhes.classificacao_indicativa` | regra do "Formulário" | omitir e reportar em `valores_invalidos` |

- **`categorias`**: lista dos slugs distintos de `taxonomia.categoria`.
- **`subcategorias`**: lista `[{"categoria": "festas-e-baladas", "name": "Festas temáticas", "slug": "festas-tematicas"}, ...]`, um item por par categoria/slug distinto. `slug` ausente: slugify do `nome` (sem acento, minúsculo, tudo que não é letra/número vira `-`). `nome` ausente: o próprio slug com `-` trocado por espaço e a primeira letra maiúscula.
- **`opcoes_novas`**: lista `[{"campo": "ingressos", "item": "tipo", "valor": "Estudante"}, ...]`, com `valor` = valor `trim()` como veio.
- **Cidades**: para cada arquivo, (`local.cidade`, `local.uf`) → código IBGE de 7 dígitos em `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios` (comparar sem acento e caixa). Esse é o `cidade_ibge` do anúncio. Sem correspondência ou cidade/UF `null`: `cidades_sem_ibge` (arquivo pulado).
- **Campos não mapeados**: percorra todos os caminhos de cada JSON (objetos com `.`, listas com `[]`, só folhas; ex.: `detalhes.ingressos[].taxa`). Todo caminho fora da lista abaixo vai em `campos_nao_mapeados` (caminho, um valor de exemplo, arquivos afetados). Não grave esses campos nem invente destino.

Caminhos mapeados:

```
categoria titulo descricao descricao_revisada moeda status preco publicado_em expira_em
taxonomia.categoria taxonomia.subcategorias[].slug taxonomia.subcategorias[].nome
local.nome local.endereco local.numero local.complemento local.bairro local.cidade local.uf local.cep
local.latitude local.longitude
contato.telefone contato.whatsapp contato.email contato.site contato.link_ingresso
midia.capa midia.imagens_locais[]
detalhes.organizador detalhes.classificacao_indicativa detalhes.gratuito detalhes.artistas[]
detalhes.sessoes[].data detalhes.sessoes[].hora detalhes.sessoes[].fim detalhes.sessoes[].abertura_portas
detalhes.ingressos[].setor detalhes.ingressos[].tipo detalhes.ingressos[].lote detalhes.ingressos[].pessoas
detalhes.ingressos[].valor detalhes.ingressos[].comprar
detalhes.pontos_de_venda[]
origem.fonte origem.id_evento origem.url origem.coletado_em
tags[]
```

Ignorados (não reportar): `detalhes.nome_evento`, `detalhes.tipo_evento`, `detalhes.texto_original`, `detalhes.alertas[]`, `detalhes.ingressos[].evidencia`, `detalhes.ingressos[].taxa`, `origem.chave_dedup`, `revisao.*`, `revisao_descricao.*`.

**1.3 Categorias.** Retorna as categorias válidas; slug de `categorias` que não voltar é inválido (inexistente, inativo, de outro formulário ou com grupo inativo): os arquivos dele vão para `categorias_invalidas` e são pulados.

```sql
SELECT c.slug, c.id AS category_id, c.category_group_id AS group_id
FROM public.categories c
JOIN public.categories_group g ON g.id = c.category_group_id AND g.active
WHERE c.active AND c.form_key = 'eventos'
  AND c.slug = ANY(%(categorias)s::text[]);
```

**1.4 Subcategorias: comparar e inserir as ausentes como pendentes.** A primeira query retorna só o que falta ou não está ativo (0 linhas = nada pendente); `situacao` = `ausente` ou `pendente`. A segunda cria as ausentes com `active = false` (`ON CONFLICT DO NOTHING`; o `RETURNING` lista o que foi criado agora). Nunca faça `UPDATE` de `active` nem `DELETE`. Parâmetro `subcategorias` = JSON da 1.2, em texto, só com itens de categorias válidas na 1.3.

```sql
SELECT s.categoria, s.name, s.slug,
       CASE WHEN cs.id IS NULL THEN 'ausente' ELSE 'pendente' END AS situacao
FROM jsonb_to_recordset(%(subcategorias)s::jsonb) AS s(categoria text, name text, slug text)
JOIN public.categories c ON c.slug = s.categoria
LEFT JOIN public.categories_sub cs ON cs.slug = s.slug AND cs.category_id = c.id
WHERE cs.active IS NOT TRUE
ORDER BY s.categoria, s.slug;

INSERT INTO public.categories_sub (category_id, name, slug, description, tags, active, tenant_id, created_by)
SELECT c.id, btrim(s.name), s.slug, NULL, lower(btrim(s.name)), false, %(tenant_uid)s, %(root_uid)s
FROM jsonb_to_recordset(%(subcategorias)s::jsonb) AS s(categoria text, name text, slug text)
JOIN public.categories c ON c.slug = s.categoria
ON CONFLICT (slug) DO NOTHING
RETURNING name, slug;
```

Uma subcategoria que continua `ausente` depois do insert tem o slug ocupado sob outra categoria: reporte o conflito em `subcategorias_em_conflito`.

**1.5 Acrescentar opções novas ao formulário.** Para cada item de `opcoes_novas`, rode a query abaixo (`item` = `NULL` para campo do topo, ou a chave do subcampo dentro da lista `ingressos`). Antes de rodar, confira de novo no `schema_snapshot` que a opção não existe (sem diferença de caixa e acento): a query não confere. Depois de todas, releia o formulário (1.1): `form_version` e `schema_snapshot` mudaram.

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
WHERE p.tenant_id = %(tenant_uid)s AND p.form_key = 'eventos' AND p.active
RETURNING p.version;
```

**1.6 Relatório único.** Junte tudo num relatório (JSON ou texto) e entregue à pessoa responsável. **Se houver subcategoria `ausente`/`pendente`, pare**: não execute a Fase 2. Sem isso, siga para a 1.7 (arquivos com categoria inválida ou cidade sem IBGE ficam de fora).

```json
{
  "subcategorias_pendentes": {
    "rota_ui": "/painel/taxonomia/arvore",
    "itens": [{ "categoria": "festas-e-baladas", "nome": "Flashback", "slug": "flashback", "active": false }]
  },
  "subcategorias_em_conflito": [{ "categoria": "festas-e-baladas", "slug": "danca", "arquivos": ["a.json"] }],
  "categorias_invalidas": [{ "slug": "shows", "arquivos": ["a.json"] }],
  "opcoes_incluidas_no_formulario": [
    { "campo": "ingressos", "item": "tipo", "valor": "Estudante" }
  ],
  "valores_invalidos": [{ "caminho": "detalhes.classificacao_indicativa", "valor": "adulto", "arquivos": ["a.json"] }],
  "cidades_sem_ibge": [{ "cidade": "...", "uf": "...", "arquivos": ["a.json"] }],
  "campos_nao_mapeados": [{ "caminho": "detalhes.ingressos[].taxa", "exemplo": 5, "arquivos": ["a.json"] }],
  "arquivos_afetados": { "flashback": ["a.json"], "Estudante": ["a.json"] }
}
```

Mensagem à pessoa responsável, quando houver subcategoria pendente: "Inseri as subcategorias acima como **pendentes** (`active = false`). Abra `/painel/taxonomia/arvore` (ou `/painel/taxonomia/subcategorias`), confira cada uma, ligue o switch **Ativo** e salve. Avise aqui quando terminar."

**1.7 Checagem de pendentes (liberar a Fase 2).** Se a 1.6 parou, só continue depois da confirmação da pessoa **em chat**: refaça a 1.2 e a primeira query da 1.4. **0 linhas = liberado.** Qualquer linha: volte à 1.4/1.6 e pare de novo. O robô nunca ativa por conta própria. Campos não mapeados não bloqueiam. Liberado, carregue os ids das subcategorias ativas das categorias válidas:

```sql
SELECT c.slug AS category_slug, cs.id AS sub_id, cs.slug AS sub_slug
FROM public.categories c
JOIN public.categories_sub cs ON cs.category_id = c.id AND cs.active
WHERE c.slug = ANY(%(categorias)s::text[]) AND c.active AND c.form_key = 'eventos'
ORDER BY c.slug, cs.slug;
```

## Fase 2: inserção (por arquivo)

Só execute depois que a checagem 1.7 liberar.

Valide o payload: `categoria = 'eventos'`, `moeda = 'BRL'`, `status` entre `ativo`, `pausado`, `cancelado` e `encerrado`, `titulo`, `descricao`, `origem.fonte` e `origem.id_evento` presentes, `taxonomia.categoria` válida na 1.3, `cidade_ibge` resolvido na 1.2 e `detalhes.sessoes[]` com ao menos um item com `data` válida. Sessão sem `data` válida é descartada e reportada. Arquivo inválido: pule e reporte.

Calcule:

- `group_id`, `category_id`: da linha da 1.3 com `slug = taxonomia.categoria`.
- `sub_slugs`: os `slug` de `taxonomia.subcategorias[]` (calculados como na 1.2). Sem subcategoria: lista vazia.
- `sessoes`: as sessões válidas, ordenadas por `data` e `hora` (sem hora = antes).
- `fuso`: `-04:00` para UF MT, MS, AM, RO e RR; `-05:00` para AC; `-03:00` para as demais.
- `data_inicio`: data da primeira sessão + `T` + `hora` (sem hora: `00:00`). Formato `AAAA-MM-DDTHH:MM`, hora local, sem fuso.
- `data_fim`: da última sessão. Com `fim`: data (+1 dia se `fim` ≤ `hora`) + `T` + `fim`. Sem `fim` e mais de uma sessão: data da última + `T23:59`. Sem `fim` e uma sessão só: não grave.
- `expira_em`: `expira_em` do topo se presente; senão `data_fim` + `:00` + `fuso`; sem `data_fim`, data da última sessão + `T23:59:59` + `fuso`.
- `preco`: `detalhes.gratuito = true` → `0`; senão `preco` do topo se > 0; senão o menor `detalhes.ingressos[].valor` > 0; nenhum → `0`.
- `price_unit`: `'unit'` se `preco` > 0, senão `'quote'`.
- `status_servico`: `ativo` → `active`; `pausado` → `paused`; `cancelado` e `encerrado` → `archived`.
- `descricao`: `descricao_revisada` se presente, senão `descricao` (`trim()`).
- `answers` (ver "Formulário").
- `tags`: ver "Tags" abaixo.
- `extras` = `{"origem": {"fonte": origem.fonte, "id_evento": origem.id_evento, "url": origem.url, "coletado_em": origem.coletado_em, "cidade_ibge": <cidade_ibge>}}`, omitindo chaves `null`; some `"images": [ids]` e `"coverFileId": id` só se alguma imagem foi gravada ou reaproveitada, `"tags": [...]` só se a lista calculada não for vazia, `"local_ref"` e `"pontos_de_venda"` só se houver (ver "Código do lugar").

### Tags

`services.extras.tags` é um array de strings que agrupa anúncios além da taxonomia (convenção: minúsculas, sem acento, kebab-case, `:` separando prefixo). A busca filtra por elas e a tela de detalhe mostra carrosséis por tag.

- Cada item de `tags[]` do payload: sem acento, minúsculas, o que não for letra/dígito vira `-` (o `:` fica), sem `-` nas pontas; vazio é descartado; sem repetir.
- **Local cadastrado:** se o local do evento for um lugar já cadastrado (anúncio com `extras.codigo`), entra em `tags` o código dele, para a página do evento mostrar "Organizado por <casa>". Para o evento aparecer na página da casa, a tag é opcional: basta `extras.local_ref` (ver "Código do lugar"). Sem linha: nenhuma tag de local.

```sql
SELECT s.extras->>'codigo' AS tag
FROM public.services s
WHERE s.active AND s.status = 'active'
  AND NULLIF(btrim(s.extras->>'codigo'), '') IS NOT NULL
  AND (lower(unaccent(s.title)) = lower(unaccent(%(local_nome)s))
       OR EXISTS (SELECT 1 FROM public.service_addresses a
                  WHERE a.service_id = s.id AND a.active AND a.city_ibge = %(cidade_ibge)s
                    AND lower(unaccent(a.label)) = lower(unaccent(%(local_nome)s))))
ORDER BY s.created_at, s.id
LIMIT 1;
```

- No UPDATE (passo 5), `"tags"` presente substitui a lista inteira; ausente (lista calculada vazia) mantém a que já estava no anúncio.
- **Organizado por a casa:** basta o evento ter, em `tags[]`, o código da casa (o slug dela, por exemplo `"espaco-art-festas-e-eventos"`); nada mais é necessário. A casa é o anúncio ativo cujo `extras.codigo` é esse código (os lugares importados já o gravam, ver [lugares-depara.md](lugares-depara.md)). A página do evento mostra "Organizado por <casa>" com link. A página da casa lista o evento em "Vinculados" (ou no título de `extras.vinculosTitulo`, se a casa o definir) tanto pela tag quanto pelo `extras.local_ref`. Sem casa para nenhuma das tags, a página segue mostrando `detalhes.organizador` como texto. Detalhes em [services.md](../../kizuna-core/docs/plugins/services.md).
- **Formato e permissão de `tags[]` (obrigatório):** o robô DEVE mandar no máximo 10 tags, cada uma minúscula e no padrão `[a-z0-9][a-z0-9:._-]{0,59}` (sem acento, até 60 caracteres), descartando ou truncando as que não couberem ANTES do insert; senão o INSERT/UPDATE falha com erro `22023` e aborta. O robô conecta sem JWT (sessão de sistema), então não precisa da permissão `services.link`. Usuários comuns só editam `tags` se tiverem essa permissão.

### Código do lugar (`local_ref` e `pontos_de_venda`)

O **código** de um lugar é o `extras.codigo` do anúncio-lugar, igual ao slug da pasta `content/lugares/<slug>/` (ex.: `espaco-art-festas-e-eventos`). O robô grava códigos, nunca uids nem nomes, quando o lugar está cadastrado. Os dois vínculos ficam em `services.extras` (o wizard os edita no passo de endereço); não vão para `answers`. Consulta (uma por nome; `NULL` = lugar não cadastrado):

```sql
SELECT s.extras->>'codigo' AS codigo
FROM public.services s
JOIN public.categories_group g ON g.id = s.category_group_id
WHERE s.active AND s.status = 'active'
  AND NULLIF(btrim(s.extras->>'codigo'), '') IS NOT NULL
  AND g.slug = 'lugares'
  AND (lower(unaccent(s.title)) = lower(unaccent(%(nome)s))
       OR s.extras->>'codigo' = %(nome_slug)s
       OR EXISTS (SELECT 1 FROM public.service_addresses a
                  WHERE a.service_id = s.id AND a.active AND a.city_ibge = %(cidade_ibge)s
                    AND lower(unaccent(a.label)) = lower(unaccent(%(nome)s))))
ORDER BY s.created_at, s.id
LIMIT 1;
```

`nome_slug` = `nome` sem acento, minúsculo, o que não for letra/dígito vira `-`, sem `-` nas pontas.

- **`extras.local_ref`**: o código de UM lugar, o local do evento (consulta com `nome` = `local.nome`). Liga os dois sentidos sozinho: a página do evento mostra "Onde acontece" com link para o lugar, e a página do lugar lista o evento no carrossel de vinculados (eventos futuros primeiro). A tag com o código do lugar é opcional. Sem código: omita a chave.
- **`extras.pontos_de_venda[]`**: um item `{ "nome": string, "link"?: string }` por ponto de venda. `nome` = o código do lugar (consulta com `nome` = o texto do ponto) ou, sem código (não é um lugar cadastrado, ex.: "Disk ingresso"), o texto, `trim()`. `link` = URL http(s) de compra do ingresso deste evento naquele ponto; omita se a fonte não trouxer (não copie o `link_ingresso` geral para cá). Nunca junte dois pontos num item nem use vírgula para separar: dois lugares = dois itens. Sem pontos de venda: omita a chave.
- **Exibição de "Onde comprar"** (página do evento): um card por ponto, com foto, título e cidade do lugar (link para a página dele quando o código resolve para um lugar; só o texto quando não). Se o item tem `link` http(s) válido, o card ganha o botão "Bora comprar ingresso" (nova aba, `rel="noopener noreferrer"`, com o rastreio de links de contato da página). O botão só aparece com o `link` do próprio ponto: o `link_ingresso` geral do evento continua só em "Ingressos" ("Comprar ingresso").
- **Cidade no "Onde acontece"**: com `local_ref` resolvido, o cartão mostra a cidade do lugar; se o lugar não tiver cidade, usa a do endereço do anúncio (`service_addresses`, passo 6).
- **No UPDATE (passo 5)**: `local_ref`/`pontos_de_venda` presentes substituem os do anúncio; ausentes mantêm o que já estava (vínculo feito à mão no painel não se perde).

### De-para

| Campo do payload | Destino | Conversão |
|---|---|---|
| `categoria` (= `eventos`) | | só validar |
| `taxonomia.categoria` | `services.category_group_id`, `category_id` | ids da 1.3 |
| `taxonomia.subcategorias[]` | `categories_sub` + `service_categories_sub` | 1.4 e passo 8 |
| `titulo` | `services.title` | `trim()` |
| `descricao_revisada` / `descricao` | `services.description` | ver cálculo acima |
| `preco`, `detalhes.gratuito`, `ingressos[].valor` | `services.starting_price`, `price_unit` | ver cálculo acima |
| `moeda` | | só validar (`BRL`) |
| `status` | `services.status` | ver cálculo acima e passo 5 |
| `publicado_em` | `services.created_at` | ISO → timestamptz; `null` → `now()`; só no insert |
| `expira_em` / sessões | `services.expires_at` | ver cálculo acima |
| `midia.capa`, `midia.imagens_locais[]` | `files` + `extras.coverFileId` / `extras.images` | ler o arquivo e gravar em `files` (passos 2 e 3); capa primeiro, cada imagem uma vez |
| `local.nome` | `service_addresses.label` | direto |
| `local.endereco` | `service_addresses.street` | sem `local.numero`: separar `numero` no último `, ` (sem vírgula → tudo em `street`) |
| `local.numero` | `service_addresses.number` | direto |
| `local.complemento` | `service_addresses.complement` | direto |
| `local.bairro` | `service_addresses.neighborhood` | direto |
| `local.cidade` | `service_addresses.city` | direto |
| `local.uf` | `service_addresses.state` | 2 letras maiúsculas |
| (IBGE da cidade) | `service_addresses.city_ibge` | `cidade_ibge` da 1.2 |
| `local.cep` | `service_addresses.zip_code` | só dígitos; `null` → `NULL` |
| `local.latitude`, `longitude` | `service_addresses.latitude`, `longitude` | number com 6 casas; `null` ou os dois iguais a `0` → `NULL` nos dois |
| `contato.telefone` | `answers.contato_telefone` | direto |
| `contato.whatsapp` | `answers.contato_whatsapp` | direto |
| `contato.email` | `answers.contato_email` | minúsculo |
| `contato.site` | `answers.link` | direto |
| `contato.link_ingresso` | `answers.link_ingresso` | direto |
| `detalhes.organizador` | `answers.realizador` | direto |
| `detalhes.classificacao_indicativa` | `answers.classificacao_indicativa` | ver "Formulário" |
| `detalhes.gratuito` | `answers.gratuito` | `true` só quando `true` |
| `detalhes.artistas[]` | `answers.artistas[].nome` | um item por texto |
| `detalhes.sessoes[]` | `answers.sessoes[]`, `answers.data_inicio`, `answers.data_fim` | `hora`→`hora_inicio`, `fim`→`hora_fim`, `abertura_portas`→`abertura_portoes`; ver cálculo acima |
| `detalhes.ingressos[]` | `answers.ingressos[]` | ver "Formulário" |
| `detalhes.pontos_de_venda[]` | `extras.pontos_de_venda[].nome` | um item por ponto: código do lugar, ou o texto; ver "Código do lugar" |
| `detalhes.pontos_de_venda[].link` | `extras.pontos_de_venda[].link` | URL http(s) de compra naquele ponto; omitir se ausente |
| `origem.*` | `extras.origem` | ver cálculo acima |
| `tags[]` + local cadastrado | `extras.tags` | ver "Tags" |
| `local.nome` + lugar cadastrado | `extras.local_ref` | código do lugar; ver "Código do lugar" |
| campos ignorados (ver "Contrato do payload") | | não grava |
| campo fora da lista da 1.2 | | não grava; reportar em `campos_nao_mapeados` |

### Formulário (`answers`)

Objeto JSON com chaves planas, montado inteiro a cada execução; o upsert substitui o anterior.

```json
{
  "data_inicio": "2026-10-10T00:00",
  "realizador": "Casa de Festas",
  "link": "https://exemplo.com.br/eventos/celebration-flashback",
  "classificacao_indicativa": "18 anos",
  "sessoes": [
    { "data": "2026-10-10" }
  ],
  "ingressos": [
    { "titulo": "Camarote (15 pessoas)", "setor": "Camarote", "pessoas": 15, "valor": 1600, "comprar": "Comprar ❯" },
    { "titulo": "Pista em pé — Meia", "setor": "Pista em pé", "tipo": "Meia", "pessoas": 1, "valor": 70 }
  ],
  "link_ingresso": "https://exemplo.com.br/eventos/celebration-flashback/ingressos",
  "contato_telefone": "(65) 9.9953-1935",
  "contato_whatsapp": "(65) 9.9953-1935"
}
```

- Omita chaves `null`, string vazia e array vazio, também dentro dos itens das listas. Aplique `trim()` nas strings.
- Números como JSON number, nunca string (`valor`, `pessoas`).
- Datas: `data` `AAAA-MM-DD`; horas `HH:MM`; `data_inicio`/`data_fim` `AAAA-MM-DDTHH:MM` (hora local, sem fuso).
- `classificacao_indicativa`: `livre`/`L` → `Livre`; um número 10, 12, 14, 16 ou 18 no texto (`18`, `18+`, `18 anos`) → `"<n> anos"`; qualquer outro valor → omitir e reportar.
- `sessoes`: um item por sessão válida, na ordem calculada, com `data`, `abertura_portoes`, `hora_inicio`, `hora_fim`.
- `ingressos`: um item por ingresso com `setor` ou `valor` (os outros são descartados), na ordem do payload.
  - `titulo` = `setor` (sem `setor`: `tipo`; sem os dois: `Ingresso`) + ` — <tipo>` se houver `tipo` + ` (<pessoas> pessoas)` se `pessoas` > 1 + ` — <lote>` se houver `lote`.
  - `setor`, `lote`, `comprar` direto; `pessoas` number ≥ 1; `valor` number ≥ 0.
  - `tipo` normalizado contra as opções (sem caixa e acento) e gravado com o valor da opção.
- `artistas`: `[{"nome": "..."}]`, um por texto não vazio, sem duplicados.
- `gratuito`: grave `true` só quando `detalhes.gratuito = true`.

### Queries

**1. Serviço existente?** (0 ou 1 linha; decide entre os passos 4 e 5)
```sql
SELECT id, status, extras FROM public.services
WHERE tenant_id = %(tenant_uid)s AND active
  AND extras->'origem'->>'fonte' = %(fonte)s
  AND extras->'origem'->>'id_evento' = %(id_evento)s
ORDER BY id LIMIT 1;
```

No máximo **4 imagens** por anúncio (capa + 3), o limite do painel: use as 4 primeiras na ordem acima e reporte as que ficaram de fora.

**2. Imagem já existe?** (para cada imagem, capa primeiro)
```sql
SELECT id FROM public.files
WHERE tenant_id = %(tenant_uid)s AND purpose = 'service_image' AND active
  AND original_name = %(nome)s AND size_bytes = %(tamanho)s LIMIT 1;
```

**3. Imagem nova** (`file_id` = uuid gerado; `nome` = último trecho da URL ou do caminho; `storage_path` = `service_image/AAAA/MM/<file_id>-<nome>`; `content` = bytes; `mime` pelo conteúdo, só `image/*`). Guarde os ids em ordem em `images` e o da capa em `coverFileId` (sem capa: o primeiro de `images`). Download ou leitura falhou: pule a imagem e reporte.
```sql
INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, purpose, content, active)
VALUES (%(file_id)s, %(root_uid)s, %(tenant_uid)s, %(nome)s, %(storage_path)s, %(mime)s, %(tamanho)s, 'service_image', %(content)s, true);
```

**4. Passo 1 sem linha: inserir serviço** (guarde `service_id`)
```sql
INSERT INTO public.services
  (title, category_group_id, category_id, description, starting_price, price_unit, status,
   service_location, extras, expires_at, tenant_id, created_by, created_at, active)
VALUES (%(titulo)s, %(group_id)s, %(category_id)s, %(descricao)s, %(preco)s, %(price_unit)s::public.price_unit,
        %(status_servico)s::public.service_status, 'no_estabelecimento', %(extras)s::jsonb, %(expira_em)s::timestamptz,
        %(tenant_uid)s, %(root_uid)s, COALESCE(%(publicado_em)s::timestamptz, now()), true)
RETURNING id;
```

**5. Passo 1 com linha: atualizar serviço** (`cancelado`/`encerrado` arquivam; senão mantém o status se estiver `paused` ou `archived`; `created_at` não muda; `description` fica intacta quando existe revisão `approved`)
```sql
UPDATE public.services SET
  title = %(titulo)s,
  category_group_id = %(group_id)s, category_id = %(category_id)s,
  description = CASE WHEN EXISTS (
      SELECT 1 FROM public.service_text_revisions r
      WHERE r.service_id = services.id AND r.field = 'description' AND r.status = 'approved')
    THEN description ELSE %(descricao)s END,
  starting_price = %(preco)s, price_unit = %(price_unit)s::public.price_unit,
  status = CASE
    WHEN %(status_servico)s = 'archived' THEN 'archived'::public.service_status
    WHEN status IN ('paused','archived') THEN status
    ELSE %(status_servico)s::public.service_status END,
  extras = (extras - 'origem' - 'images' - 'coverFileId') || %(extras)s::jsonb,
  expires_at = %(expira_em)s::timestamptz, updated_at = now()
WHERE id = %(service_id)s;
```

**6. Endereço do local** (apaga os do anúncio e insere um, principal)
```sql
DELETE FROM public.service_addresses WHERE service_id = %(service_id)s;

INSERT INTO public.service_addresses
  (service_id, label, zip_code, street, number, complement, neighborhood, city, state, city_ibge,
   latitude, longitude, is_primary, tenant_id, created_by, active)
VALUES (%(service_id)s, %(label)s, %(zip_code)s, %(street)s, %(number)s, %(complement)s, %(neighborhood)s,
        %(city)s, %(state)s, %(city_ibge)s, %(latitude)s, %(longitude)s, true, %(tenant_uid)s, %(root_uid)s, true);
```

**7. Respostas do formulário** (insere ou atualiza; `form_id`, `form_version`, `schema_snapshot` relidos após a 1.5)
```sql
INSERT INTO public.form_results
  (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
VALUES (%(form_id)s, 'eventos', %(service_id)s::text, 'service', %(form_version)s,
        %(schema_snapshot)s::jsonb, %(answers)s::jsonb, %(root_uid)s, %(tenant_uid)s)
ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
  answers = EXCLUDED.answers, version = EXCLUDED.version, schema_snapshot = EXCLUDED.schema_snapshot,
  form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now();
```

**8. Subcategorias** (remova todas as que deixaram de valer, inclusive de outra categoria se a categoria do evento mudou, e insira uma linha por `sub_id` de `sub_slugs` da 1.7)
```sql
DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
WHERE scs.service_id = %(service_id)s AND cs.id = scs.category_sub_id
  AND (cs.category_id <> %(category_id)s OR cs.slug <> ALL(%(sub_slugs)s::text[]));

INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
VALUES (%(service_id)s, %(group_id)s, %(category_id)s, %(sub_id)s, %(tenant_uid)s, %(root_uid)s)
ON CONFLICT (service_id, category_sub_id) DO NOTHING;
```

**Uma vez, antes do lote (opcional)** — índice de idempotência; só aplique se não houver anúncios duplicados:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS services_origem_eventos_uq ON public.services
  ((extras->'origem'->>'fonte'), (extras->'origem'->>'id_evento'))
  WHERE extras->'origem' ? 'id_evento';
```

## Sem destino

- Slug do anúncio: não existe; o identificador público é `services.uid`.
- `detalhes.tipo_evento`, `detalhes.nome_evento`: não são gravados.
- Meia-entrada, acessibilidade, formas de pagamento, canais de venda, observações e Instagram: sem campo; vão resumidos na descrição.
- `detalhes.texto_original`, `detalhes.alertas[]`, `*.evidencia`, `revisao.evidencias[]`, `revisao.descartados[]`: rastreio da extração por IA, não gravado.
- O assistente **não preenche** `contato.instagram`, `ingressos[].situacao`, `ingressos[].link_compra`, `canais_venda`, `formas_pagamento`, `pagamento_observacao`, `meia_entrada`, `acessibilidade` e `observacoes`: essas informações vão resumidas na descrição do anúncio (`descricao_revisada`). Os campos do formulário continuam existindo para outras fontes.
- `origem.chave_dedup`, `revisao_descricao.modelo`, `revisao_descricao.revisado_em`: controle interno do assistente (deduplicação e reescrita da descrição), não gravado e **não** reportado como campo não mapeado.
- Evento gratuito: `starting_price = 0` aparece no site como "Sob consulta" (não há rótulo "Gratuito" no preço); o formulário guarda `gratuito = true`.
- `price_unit = 'unit'` aparece como "por unidade": não há unidade "por ingresso" nem "a partir de".
- Artistas são texto livre (`answers.artistas[].nome`). Pontos de venda são código de lugar ou texto (`extras.pontos_de_venda[].nome`); nenhum dos dois grava endereço. `service_addresses` guarda só o local do evento.
- Chaves antigas do formulário (`endereco`, `local_ref`, `pontos_de_venda`, `secao_compra`): não grave mais em `answers`. Respostas já gravadas com elas continuam no banco e a página as lê como reserva, mas o formulário atual não as mostra.
