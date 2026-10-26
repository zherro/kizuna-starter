# Notícias: arquivos em `content/noticias` → banco

Cada notícia é uma pasta `content/noticias/<slug>/` com:

- `index.html`: frontmatter (entre `---`) + o texto da matéria em **HTML puro**;
- a foto de capa (`capa.jpg`, `.png` ou `.webp`).

O script `scripts/importar-noticias.mjs` grava as notícias **aprovadas** como anúncios do grupo `noticias` (página na variant `noticia` do core). Ele conecta direto no banco do `DATABASE_URL`.

## Frontmatter

```yaml
---
titulo: "Título da matéria, sem ponto final"
categoria: cidade                  # slug de categoria do grupo noticias
subcategoria: noticias-de-cuiaba   # opcional; slug de subcategoria ATIVA da categoria
status: revisao                    # rascunho | revisao | aprovado (só aprovado é importado)
data_publicacao: 2026-10-25T08:00  # hora de Cuiabá, sem fuso
expira_em: 2026-10-26T20:00        # opcional; hora de Cuiabá em que a notícia sai do site (evento, sorteio, previsão)
autor: "Redação Bora Cuiabá"
cidade: "Cuiabá"                   # nome em location_city + uf (põe a notícia no filtro de cidade)
uf: MT
fontes:                            # "Nome | URL" (URL opcional, só http/https); a 1ª é a principal
  - "Prefeitura de Cuiabá | https://cuiaba.mt.gov.br/noticias/..."
  - "Febraban | https://portal.febraban.org.br/noticia/4413"
foto_arquivo: capa.jpg             # opcional; sem ele vale a 1ª imagem da pasta
foto_autor: "Autor / Origem"
foto_licenca: "CC BY-SA 4.0"
foto_licenca_url: "https://creativecommons.org/licenses/by-sa/4.0/"
foto_origem: "https://commons.wikimedia.org/wiki/File:..."
foto_alt: "Descrição objetiva da foto"
foto_legenda: "Legenda curta. Imagem ilustrativa"
a_confirmar:                       # não é gravado: pendências para quem revisa
  - "dado que ficou fora do texto"
---
<p>Lide...</p><h2>...</h2>
```

O texto aceita só `p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `a` e `br`, sem `class`/`style` e sem Markdown; precisa começar com `<p>`. Fonte e crédito da foto **não** vão no texto: a página os mostra a partir do frontmatter.

## Destino

| Frontmatter | Banco |
|---|---|
| `titulo`, texto | `services.title`, `services.description` |
| `categoria`, `subcategoria` | `services.category_group_id`/`category_id`, `service_categories_sub` |
| `data_publicacao` | `services.created_at` (no insert) e `form_results.answers.data_publicacao` |
| `expira_em` | `services.expires_at`: o site deixa de listar a notícia nessa hora |
| `autor`, 1ª fonte | `answers.autor`, `answers.fonte`, `answers.link` (formulário `noticias`) |
| `fontes` | `services.extras.fontes` (`[{nome, url}]`) |
| `foto_*` | `files` (otimizada: até 1600 px + miniatura de 480 px), `extras.coverFileId`/`images`, `extras.imagem_credito` |
| `cidade`, `uf` | `service_addresses` (cidade + IBGE) |
| slug da pasta | `extras.origem.id_evento` (com `extras.origem.fonte = 'bora-redacao'`): a identidade da notícia |

Pré-requisitos no banco: migrações do core aplicadas, taxonomia do grupo `noticias` (`db/extras/taxonomy_seed_bora_cuiaba.sql`) e o formulário `noticias` (`db/extras/forms_seed_noticias.sql`).

## Uso

```bash
DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod --dry        # mostra o que faria
DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod              # publica as novas
DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod --atualizar  # regrava as que mudaram no arquivo
DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod --only <slug>
```

`--alvo` é o nome do banco no índice (`local`, `prod`...).

### `DATABASE_URL`

Formato: `postgres://USUARIO:SENHA@HOST:PORTA/BANCO`. Exemplo com o Postgres local (usuário `myuser`, banco `bora`, porta 5432):

```bash
# Git Bash / Linux / macOS
DATABASE_URL="postgres://myuser:minhasenha@localhost:5432/bora" node scripts/importar-noticias.mjs --alvo local --dry
```

```powershell
# PowerShell
$env:DATABASE_URL = "postgres://myuser:minhasenha@localhost:5432/bora"
node scripts/importar-noticias.mjs --alvo local --dry
```

Para prod, troque usuário, senha, host e banco pelos do servidor e use `--alvo prod`. Se o banco não é acessível de fora, abra um túnel SSH antes e aponte para ele (ex.: `ssh -L 15432:localhost:5432 usuario@servidor` e `postgres://USUARIO:SENHA@localhost:15432/BANCO`). Senha com caracteres especiais (`@`, `:`, `/`, `#`) precisa ir codificada na URL (`@` vira `%40`). Não commite a URL com senha: defina-a só no terminal.

## Índice e proteção contra sobrescrita

`content/noticias/_indice/<alvo>.json` guarda, por slug, o anúncio criado, quando foi publicado e o hash do arquivo (texto + foto). O índice guarda também uma impressão do banco: usar `--alvo prod` com o `DATABASE_URL` de outro banco aborta.

Em cada execução o script faz **uma** consulta com tudo o que a fonte `bora-redacao` já gravou no banco e decide:

| Situação | O que acontece |
|---|---|
| `status` diferente de `aprovado` | fora |
| `expira_em` já passou | vencida (não entra) |
| não está no banco nem no índice | **inserida** |
| no banco, arquivo igual ao do índice | pulada (sem ler foto) |
| no banco, fora do índice | pulada e registrada no índice |
| no banco, arquivo mudou, sem `--atualizar` | pulada (avisa) |
| `--atualizar`, mas pausada/arquivada/inativa no banco | **protegida** (não mexe) |
| `--atualizar`, mas título, texto, categoria ou capa mudaram no banco desde a importação (edição no painel) | **protegida** (não mexe) |
| `--atualizar` e o banco está como foi importado | atualizada |
| no índice, mas não no banco (apagada) | reportada; para recriar, tire o slug do índice |
| no índice, mas sem pasta | reportada |

Nada é apagado pelo script. A comparação com o painel usa `extras.origem.hash_importado`, gravado a cada importação: notícia gravada sem ele (importação antiga) fica protegida no `--atualizar`.

Commite o índice de prod junto com as notícias: é ele que diz o que já está publicado lá. O `local.json` fica fora do git (cada máquina tem o seu banco). A impressão do banco considera host, porta e nome: `localhost` e `127.0.0.1` contam como bancos diferentes, então use sempre a mesma `DATABASE_URL` para o mesmo alvo.
