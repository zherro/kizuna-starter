# Projeto sobre kizuna-core

Esqueleto mínimo. A casca do app (rotas, layout, `package.json`…) é **materializada**
por `node kizuna-core/cli install` a partir do `kizuna-core/template/` — e daí é sua.

`kizuna-core/` é um **submódulo** — `git clone` normal traz vazio.

## Começar

```bash
git clone --recurse-submodules <este-repo> meu-app && cd meu-app
#   esqueceu --recurse-submodules? → git submodule update --init --recursive

# editar kizuna.plugins.json (ver kizuna-core/docs/plugins/README.md)

node kizuna-core/cli install                    # materializa a casca + npm install
cp .env.example .env                            # preencher PGRST_JWT_SECRET + POSTGREST_URL
node kizuna-core/cli db install --db-url "postgresql://user:pass@host:5432/db"
#   conecta direto com o driver pg do CLI (JS puro, sem psql) — igual no Windows e no Linux.
#   o banco precisa estar acessível na porta da URL (num container: publique a 5432 ou use túnel ssh).

npm run dev                                     # /registre-se → 1º usuário vira root
node kizuna-core/cli db run db/reseed.sql --db-url "postgresql://user:pass@host:5432/db"
#   seeds do projeto que dependem do root: páginas, cidades, taxonomia, forms (cinema/eventos/noticias)
#   aborta se não houver root, ou se já existir anúncio/demanda/resposta de formulário
```

`db/auth.sql`, `db/public.sql` e `db/reseed.sql` são gerados por `node db/build.mjs` (regenere quando
o core, `kizuna.plugins.json` ou `db/extras/` mudarem). `auth.sql` + `public.sql` = o mesmo que o
`db install` aplica, para quem prefere rodar o SQL na mão.

Commitar depois do install: `src/ package.json package-lock.json tsconfig*.json postcss.config.mjs next.config.ts next-env.d.ts kizuna.lock`.

## Atualizar (pegar updates do core)

O `predev` roda `kizuna check` e **avisa** (não bloqueia) quando o core diverge.

```bash
cd kizuna-core && git pull && cd ..
node kizuna-core/cli update                              # fast-forward dos managed + migrations
node kizuna-core/cli update --reseed "src/app/layout.tsx"  # seeds que mudaram (ele lista quais)
node kizuna-core/cli db migrate --db-url "..."           # só as migrations pendentes
git add kizuna-core kizuna.lock src/ && git commit -m "chore: bump kizuna-core"
```

- **managed** (proxy, rotas de API, login/cidades/anúncio/painel/IA — a casca genérica): `update` faz fast-forward se você não editou; senão mostra diff.
- **seed** (layout, componentes da home, painel, `globals.css`): se você **não mexeu**, o `update` aplica a versão nova sozinho (hash em `kizuna.lock`); se **customizou**, não toca e lista no fim da saída. `--reseed "<paths>"` sobrescreve esses; `--reseed all` não atropela customizados.
- **install** (imagens/ícones, artes de login/cadastro, páginas de conteúdo como sobre/termos/privacidade e a home `app/page.tsx`): copiados só quando faltam (`install` ou `update`); nem `--reseed all` nem `install --force` sobrescrevem. Para pegar a versão do core, apague o arquivo e rode `update`.
- **nuke total** (se só editou `.env`): `rm -rf src package.json … kizuna.lock && cli install --force`.

## Outros comandos

```bash
node kizuna-core/cli plugin add <nome>     # ativa plugin depois (+ db migrate)
node kizuna-core/cli plugin list           # ativos + disponíveis
node kizuna-core/cli sync                  # empurra melhorias da SUA casca pro template (dev)
node kizuna-core/cli lock                  # marca versão como "vista" sem aplicar
```

## Referência

Documentação completa: `kizuna-core/docs/README.md` (índice; publicada no GitBook).

- `kizuna-core/docs/comecando/cli.md` — comandos + formato do `kizuna.lock`
- `kizuna-core/docs/plugins/README.md` — plugins (o `kizuna.plugins.json` lista os 24, em ordem de dependência)
- `kizuna-core/docs/manutencao/hardening.md` — performance/segurança + backlog
