# Projeto sobre kizuna-core

Esqueleto mínimo. A casca do app (rotas, layout, `package.json`…) é **materializada**
por `node kizuna-core/cli install` a partir do `kizuna-core/template/` — e daí é sua.

`kizuna-core/` é um **submódulo** — `git clone` normal traz vazio.

## Começar

```bash
git clone --recurse-submodules <este-repo> meu-app && cd meu-app
#   esqueceu --recurse-submodules? → git submodule update --init --recursive

# editar kizuna.plugins.json (ver kizuna-core/docs/PLUGINS.md)

node kizuna-core/cli install                    # materializa a casca + npm install
cp .env.example .env                            # preencher PGRST_JWT_SECRET + POSTGREST_URL
node kizuna-core/cli db install --db-url "postgresql://user:pass@host:5432/db"
#   Windows:  --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe"
#   Docker:   --psql "docker exec -i <container> psql"

npm run dev                                     # /registre-se → 1º usuário vira root
node kizuna-core/cli db install --db-url "..."  # re-rodar: seeds que dependem de tenant
```

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

- **managed** (proxy, rotas de API, catch-all): `update` faz fast-forward se você não editou; senão mostra diff.
- **seed** (`// EXEMPLO` — layout, home, painel, globals.css): nunca tocados. `update` **lista** os que mudaram no core; `--reseed "<paths>"` (ou `--reseed all`) sobrescreve.
- **nuke total** (se só editou `.env`): `rm -rf src package.json … kizuna.lock && cli install --force`.

## Outros comandos

```bash
node kizuna-core/cli plugin add <nome>     # ativa plugin depois (+ db migrate)
node kizuna-core/cli plugin list           # ativos + disponíveis
node kizuna-core/cli sync                  # empurra melhorias da SUA casca pro template (dev)
node kizuna-core/cli lock                  # marca versão como "vista" sem aplicar
```

## Referência

- `kizuna-core/docs/CLI.md` — comandos + formato do `kizuna.lock`
- `kizuna-core/docs/PLUGINS.md` — plugins (`taxonomy` fica fora da lista de propósito)
- `kizuna-core/docs/HARDENING.md` — performance/segurança + backlog
