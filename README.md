# kizuna-starter

Ponto de partida para um projeto novo em cima do [`kizuna-core`](https://github.com/zherro/kizuna-core).

Este repo é **fino de propósito**: só o submódulo `kizuna-core`, a lista de plugins,
o `.env.example` e este README. Toda a casca do app (rotas, layout, `proxy.ts`,
`tsconfig`, `package.json`…) é **materializada** por `node kizuna-core/cli install`
a partir do `kizuna-core/template/` — e daí passa a ser sua, versionada no seu projeto.

## Começar um projeto

```bash
# 1. Clonar com o submódulo
git clone --recurse-submodules <este-repo> meu-projeto && cd meu-projeto
#   (esqueceu --recurse-submodules? → git submodule update --init --recursive)

# 2. Materializar a casca (pergunta se roda `npm install`)
node kizuna-core/cli install

# 3. Configurar o ambiente
cp .env.example .env
#   preencher PGRST_JWT_SECRET (mesmo secret do PostgREST) e POSTGREST_URL

# 4. Aplicar o schema (core + plugins do kizuna.plugins.json)
node kizuna-core/cli db install --db-url "postgresql://user:pass@localhost/meu_db"

# 5. Subir
npm run dev
#   abrir /registre-se → o PRIMEIRO usuário vira root automaticamente

# 6. Re-aplicar o schema — agora os seeds que dependem de um tenant/root pegam
node kizuna-core/cli db install --db-url "$DATABASE_URL"
```

Depois do passo 2, commite no **seu** projeto o que foi materializado
(`app/`, `src/`, `package.json`, `tsconfig*.json`, `postcss.config.mjs`,
`next.config.ts`, `kizuna.lock`).

## Manter em dia

```bash
node kizuna-core/cli check     # roda no `predev` — avisa se o kizuna-core divergiu (nunca bloqueia)
node kizuna-core/cli update    # puxa mudanças do kizuna-core (migrations + arquivos managed)
node kizuna-core/cli lock      # marca a versão atual como "vista" sem aplicar
node kizuna-core/cli sync      # empurra melhorias da SUA casca de volta pro kizuna-core/template
node kizuna-core/cli plugin add <nome>   # ativa um plugin depois do projeto rodando
```

Referência completa dos comandos e do `kizuna.lock`: [`kizuna-core/docs/CLI.md`](kizuna-core/docs/CLI.md).

## Plugins

Edite [`kizuna.plugins.json`](kizuna.plugins.json) **antes** do passo 4. Cada plugin
aplica suas migrations e, quando tem, seu fragmento de casca (`/api/<plugin>/*`).
Lista e descrição: `kizuna-core/docs/PLUGINS.md`.

## O que ainda não vem pronto (backlog Fase A do kizuna-core)

O `kizuna-core/src/` ainda tem referências `@/…` ao espaço do consumidor. O
`install` já semeia `src/lib/server/resources.ts`; se você ativar recursos que puxam
`@/i18n/messages`, `@/lib/server/app-preferences-config`, `@/lib/server/user-data-fields-config`,
`@/components/services/service-type` ou `@/types/chat`, vai precisar criar esses
arquivos no seu projeto. Ver a seção "Fase A" em `kizuna-core/docs/CLI.md`.
