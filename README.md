# Novo projeto com kizuna-core

Esta pasta é o **esqueleto de um projeto novo**. Copie o conteúdo dela para um
repo vazio, adicione o `kizuna-core` como submódulo, e rode o `install`.

```bash
mkdir meu-app && cd meu-app && git init
cp -r /caminho/do/kizuna-core/starter/. .
git submodule add https://github.com/zherro/kizuna-core.git kizuna-core
```

> Se você mantém um repo `kizuna-starter` pronto, é só
> `git clone --recurse-submodules <ele> meu-app` (veja "Clonar" abaixo).

---

## ⚠️ O `kizuna-core` é um submódulo

Um `git clone` normal traz `kizuna-core/` **vazio**. Sempre:

```bash
git clone --recurse-submodules <repo> meu-app
# esqueceu? →
git submodule update --init --recursive
```

Confira: `ls meu-app/kizuna-core` deve listar `cli/  template/  src/  plugins/`.

---

## 1. Instalar (primeira vez)

```bash
cd meu-app

# 1.1  escolher plugins — editar kizuna.plugins.json (lista + descrição: kizuna-core/docs/PLUGINS.md)

# 1.2  materializar a casca (cria src/app, src/proxy.ts, src/lib, package.json, configs…)
node kizuna-core/cli install
#      → pergunta se roda `npm install`

# 1.3  ambiente
cp .env.example .env
#      preencher PGRST_JWT_SECRET (o MESMO secret que o PostgREST verifica) e POSTGREST_URL

# 1.4  schema (core + plugins do kizuna.plugins.json)
node kizuna-core/cli db install --db-url "postgresql://user:pass@host:5432/meu_db"
#      Windows sem psql no PATH:
#        --psql "C:\Program Files\PostgreSQL\17\bin\psql.exe"
#      Postgres em Docker:
#        --psql "docker exec -i <container> psql"
#      (ou export KIZUNA_PSQL=... uma vez)

# 1.5  subir
npm run dev
#      abrir /registre-se → o PRIMEIRO usuário cadastrado vira root automaticamente

# 1.6  re-rodar o schema — agora os seeds que dependem de um tenant/root pegam
node kizuna-core/cli db install --db-url "postgresql://user:pass@host:5432/meu_db"
```

### O que commitar no seu repo depois do install

```
src/  package.json  package-lock.json
tsconfig.json  tsconfig.kizuna.json  postcss.config.mjs  next.config.ts  next-env.d.ts
kizuna.lock
```

O `.gitignore` já ignora `node_modules/`, `.next/`, `.env`.

---

## 2. Atualizar

O `predev` roda `node kizuna-core/cli check` antes de todo `npm run dev` — ele
**avisa** (nunca bloqueia) se o `kizuna-core` do submódulo divergiu do que você
instalou:

```
┌─ kizuna-core divergiu do lock deste projeto
│  versão:   0.5.0 → 0.6.0
│  template: 0.5.0 → 0.6.0
│  plugins:  agenda 2 → 3
│  rode  kizuna -- update  para aplicar
└─
```

### 2.1  Puxar a versão nova do kizuna-core

```bash
cd kizuna-core && git pull && cd ..     # ou: git submodule update --remote kizuna-core
node kizuna-core/cli update              # aplica migrations novas + arquivos "managed" da casca
node kizuna-core/cli db migrate --db-url "$DATABASE_URL"   # aplica só as migrations pendentes
git add kizuna-core kizuna.lock src/ && git commit -m "chore: bump kizuna-core"
```

`update` faz **fast-forward** dos arquivos `managed` que você não editou; nos que
você editou, mostra o diff e pergunta. Arquivos `seed` (marcados
`// EXEMPLO`) nunca são tocados — são seus.

### 2.2  Ativar um plugin novo (depois do projeto já rodando)

```bash
node kizuna-core/cli plugin add reviews
#   → adiciona "reviews" ao kizuna.plugins.json
#   → aplica plugins/reviews/*.sql
#   → materializa o fragmento de casca do plugin (rotas /api/reviews/*), se tiver
node kizuna-core/cli db migrate --db-url "$DATABASE_URL"
git add kizuna.plugins.json kizuna.lock src/ && git commit -m "chore: + plugin reviews"
```

`node kizuna-core/cli plugin list` mostra os ativos e os disponíveis.

### 2.3  Um plugin que você já usa ganhou migrations novas

Cai no fluxo **2.1** — `git pull` no submódulo, `cli update`, `cli db migrate`.
O `kizuna.lock` guarda quantas migrations de cada plugin já foram aplicadas;
`db migrate` roda só o que falta.

### 2.4  Você melhorou a casca e quer mandar de volta pro kizuna-core

```bash
cd kizuna-core && git checkout -b minha-melhoria && cd ..
node kizuna-core/cli sync        # mostra o diff dos arquivos "managed" e pergunta o que empurrar
cd kizuna-core && git add -A && git commit -m "feat: melhoria X" && git push
```

### 2.5  A mudança do kizuna-core não te afeta

```bash
node kizuna-core/cli lock        # marca a versão atual como "vista", sem aplicar nada
```

---

## Referência

- Comandos e formato do `kizuna.lock`: `kizuna-core/docs/CLI.md`
- Plugins disponíveis: `kizuna-core/docs/PLUGINS.md`
- `taxonomy` fica **fora** do `kizuna.plugins.json` de propósito (faz `ALTER` em
  tabelas que só existem depois de uma migration do seu app) — veja o comentário
  no `kizuna.plugins.json`.

## Backlog "Fase A" do kizuna-core

O `kizuna-core/src/` ainda tem imports `@/…` que apontam pro seu projeto. O
`install` já semeia `src/lib/server/resources.ts`. Se você ativar recursos/telas
que puxam `@/i18n/messages`, `@/lib/server/app-preferences-config`,
`@/lib/server/user-data-fields-config`, `@/components/services/service-type` ou
`@/types/chat`, vai precisar criar esses arquivos. A casca base + os plugins
`storage`/`location`/`pages`/`onboarding`/`agenda` (rotas) **não** precisam disso.
