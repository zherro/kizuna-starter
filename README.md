# kizuna-starter

Template para começar um projeto novo em cima do
[`kizuna-core`](https://github.com/zherro/kizuna-core).

Este repo é **fino de propósito**: só o submódulo `kizuna-core`, a lista de plugins,
o `.env.example` e este README. Toda a casca do app (rotas, `layout`, `proxy.ts`,
`tsconfig`, `package.json`, configs…) é **materializada** por
`node kizuna-core/cli install` a partir do `kizuna-core/template/` — e a partir daí
é **sua**, versionada no repo do seu projeto.

> **Você não desenvolve dentro deste repo.** Ele é o molde. Você **clona** ele para
> cada projeto novo, e o clone vira o seu app.

---

## ⚠️ Este repo tem um submódulo

`kizuna-core/` é um **git submodule**. Um `git clone` normal traz a pasta **vazia**.
Use sempre `--recurse-submodules`:

```bash
git clone --recurse-submodules https://github.com/zherro/kizuna-starter meu-app
```

Esqueceu? Dentro do clone:

```bash
git submodule update --init --recursive
```

Para conferir que veio: `ls meu-app/kizuna-core` deve listar `cli/  template/  src/  plugins/  …`.

### Enquanto o kizuna-core não estiver mergeado na `main`

O `.gitmodules` aponta para `https://github.com/zherro/kizuna-core.git` na branch
**default**. Se a parte do CLI + `template/` ainda estiver numa branch
(`feat/kizuna-reusable-module`), depois do clone faça:

```bash
cd meu-app/kizuna-core
git fetch origin feat/kizuna-reusable-module
git checkout feat/kizuna-reusable-module
cd ..
git add kizuna-core && git commit -m "chore: pin kizuna-core na branch do CLI"
```

Quando o kizuna-core mergear na `main`, volte o submódulo para `main` e remova esse passo.

---

## Começar um projeto

```bash
# 1. Clonar COM o submódulo
git clone --recurse-submodules https://github.com/zherro/kizuna-starter meu-app
cd meu-app

# 2. Escolher os plugins  →  editar kizuna.plugins.json

# 3. Materializar a casca (pergunta se roda `npm install`)
node kizuna-core/cli install

# 4. Ambiente
cp .env.example .env
#    preencher PGRST_JWT_SECRET (mesmo secret do PostgREST) e POSTGREST_URL

# 5. Schema (core + plugins do kizuna.plugins.json)
node kizuna-core/cli db install --db-url "postgresql://user:pass@localhost/meu_db"

# 6. Subir
npm run dev
#    abrir /registre-se → o PRIMEIRO usuário vira root automaticamente

# 7. Re-aplicar o schema — agora os seeds que dependem de tenant/root pegam
node kizuna-core/cli db install --db-url "postgresql://user:pass@localhost/meu_db"
```

### O que commitar no seu projeto

Depois do passo 3, o `install` criou arquivos que agora são **seus**. Commite-os no
repo do `meu-app`:

```
app/  src/  package.json  package-lock.json
tsconfig.json  tsconfig.kizuna.json  postcss.config.mjs  next.config.ts
kizuna.lock  env.example
```

(`.gitignore` do seu projeto já ignora `node_modules/`, `.next/`, `.env`.)

---

## Manter em dia com o kizuna-core

O submódulo é um repo próprio. Você atualiza quando quiser:

```bash
node kizuna-core/cli check     # roda no `predev` — avisa se o kizuna-core divergiu (nunca bloqueia o dev)
node kizuna-core/cli update    # puxa mudanças (migrations novas + arquivos "managed" da casca)
node kizuna-core/cli lock      # marca a versão atual como "vista" sem aplicar
node kizuna-core/cli sync      # empurra melhorias da SUA casca de volta pro kizuna-core/template
node kizuna-core/cli plugin add <nome>   # ativa um plugin depois do projeto já rodando
```

Depois de um `update` que mexeu no submódulo, commite o novo ponteiro:
`git add kizuna-core && git commit -m "chore: bump kizuna-core"`.

Referência completa dos comandos e do formato do `kizuna.lock`:
[`kizuna-core/docs/CLI.md`](https://github.com/zherro/kizuna-core/blob/main/docs/CLI.md).

---

## Plugins

Edite [`kizuna.plugins.json`](kizuna.plugins.json) **antes** do passo 5. Cada plugin
aplica suas migrations e, quando tem, seu fragmento de casca (rotas `/api/<plugin>/*`).
Lista e descrição de cada um: `kizuna-core/docs/PLUGINS.md`.

`taxonomy` fica **fora** da lista de propósito (faz `ALTER` em tabelas que só existem
depois de uma migration do app) — veja o comentário no `kizuna.plugins.json`.

---

## O que ainda não vem pronto (backlog "Fase A" do kizuna-core)

O `kizuna-core/src/` ainda tem imports `@/…` que apontam para o espaço do seu
projeto. O `install` já semeia `src/lib/server/resources.ts`. Se você ativar
recursos/telas que puxam `@/i18n/messages`, `@/lib/server/app-preferences-config`,
`@/lib/server/user-data-fields-config`, `@/components/services/service-type` ou
`@/types/chat`, vai precisar criar esses arquivos no seu projeto. A casca base + os
plugins `storage`, `location`, `pages`, `onboarding` e `agenda` (rotas) **não**
precisam disso. Detalhe na seção "Fase A" de `kizuna-core/docs/CLI.md`.
