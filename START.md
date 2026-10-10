# START — subir um projeto novo sobre o kizuna-core

Caminho testado de ponta a ponta em 10/10/2026, num diretório vazio no Windows (Git Bash), até o
login: cadastro do 1º usuário → root → `/painel`. Os mesmos comandos valem no Linux e no macOS.

O `kizuna-core` é o **engine** (lógica, telas genéricas, SQL, CLI). O projeto é só a **casca**:
o CLI copia ela do `kizuna-core/template/`, e o projeto fica com configuração e apresentação.

## Pré-requisitos

- Node.js 20 ou mais novo (`node -v`)
- Git
- Docker Desktop **rodando** (para o Postgres + PostgREST locais)

## Os comandos (copie e cole, na ordem)

```bash
# 1. pasta nova + core como submódulo + esqueleto
mkdir meu-app && cd meu-app && git init
git submodule add -b develop https://github.com/zherro/kizuna-core.git kizuna-core
cp kizuna-core/starter/kizuna.plugins.json kizuna-core/starter/kizuna.config.json kizuna-core/starter/.env.example .

# 2. casca do app + npm install (uns 2 minutos)
node kizuna-core/cli install --yes

# 3. .env
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
#    ↑ cole a saída em PGRST_JWT_SECRET= no .env
#    e troque "troque_esta_senha" nos DOIS lugares (POSTGRES_PASSWORD e DATABASE_URL)

# 4. banco local (Postgres na 5432 + PostgREST na 3001) e schema
docker compose -f docker-compose.db.yml up -d --wait
node kizuna-core/cli db install

# 5. subir o app
npm run dev
#    abra http://localhost:3000/registre-se e crie a sua conta → o 1º usuário vira ROOT

# 6. (outro terminal) páginas sobre/termos, que dependem do root existir
node kizuna-core/cli db run kizuna-core/plugins/pages/0002_pages_seed.sql
```

Pronto: login funcionando, `/painel` com o menu de administração.

**Porta ocupada?** Se a 5432 ou a 3001 já estiverem em uso, coloque no `.env`, por exemplo,
`DB_PORT=55432` e `PGRST_PORT=3011`, e ajuste as mesmas portas em `DATABASE_URL` e `POSTGREST_URL`.

## Como saber que deu certo

| Conferência | Esperado |
|---|---|
| Fim do passo 2 | `casca instalada: … 0 conflito(s)` e o npm sem erro |
| Fim do passo 4 | `✓ schema aplicado` |
| `/registre-se` → Criar conta | cai em `/painel` com o selo **ROOT** |
| `http://localhost:3000/api/auth/me` | `"is_root": true` |
| `node kizuna-core/cli check` | sem aviso |
| `npm run build` | termina sem erro |

## Depois de subir

- **Nome, marca, cores:** `kizuna.config.json`. Vem com o nome de exemplo "Foco Total".
- **Plugins:** `kizuna.plugins.json`. Escolha **antes** do `db install`; depois disso, use
  `node kizuna-core/cli plugin add <nome>`.
- **Opcionais no `.env`:** SMTP (e-mail), `GOOGLE_CLIENT_ID`/`SECRET` (login com Google),
  Turnstile (captcha), `GEMINI_API_KEY` (IA), `POSTGREST_SERVICE_TOKEN`
  (`node kizuna-core/cli token service`, que habilita a exclusão de conta).
- **Commitar:** tudo, **menos** o `.env`. O `.gitignore` que vem com a casca já cuida disso.
- **Pegar atualizações do core:** `git -C kizuna-core pull`, depois `node kizuna-core/cli update`,
  depois commit de `kizuna-core` + `kizuna.lock`.
- **Deploy:** o `Dockerfile` e o `docker-compose.yml` (app) vêm na casca. Em produção o Postgres e
  o PostgREST rodam em outro stack. O deste repositório está em `deploy/postgres-postgrest/`.

## Caminho das pedras (o que quebrava, e como está agora)

| Pedra | Sintoma | Situação |
|---|---|---|
| `npm install` dentro do `install` | no Windows: "npm install falhou — rode manualmente" | **corrigido** no CLI |
| `package.json` gerado sem `version` | `npm run build` quebrava no `next.config.ts` | **corrigido** (CLI cria `name`/`version`; template tolera falta) |
| `"logo": null` no config do starter | erro de tipo no `panel-shell.tsx` | **corrigido** no template |
| Nível `identidade` faltando no config do starter | build: "Capacidade sell aponta para o nivel identidade" | **corrigido** no `starter/kizuna.config.json` |
| Sem receita de banco local | cada um montava Postgres/PostgREST na mão | **resolvido**: `docker-compose.db.yml` vem na casca |
| `Dockerfile`/`docker-compose.yml` não vinham | estavam no template, fora do manifesto | **corrigido** (modo `install`) |
| Rodar `db install` de novo (docs antigas) | `relation "users" already exists` | **docs corrigidas**: use `db run` do seed de páginas |
| `--db-url` em todo comando | era obrigatório repetir a URL | **corrigido**: o CLI lê `DATABASE_URL` do `.env` |
| PostgREST "sem dados" depois de reiniciar o PC | carrosséis somem, erros 502 | o `docker-compose.db.yml` usa `restart: unless-stopped` |
| Pasta aberta pelo caminho curto do Windows (`CLEITO~1`) | Turbopack: "leaves the filesystem root" | abra pelo caminho normal da pasta; se já aconteceu, apague `.next/` |

## Prompt para pedir a outra IA (Claude Code) montar um projeto novo

```text
Crie um projeto novo sobre o kizuna-core numa pasta chamada <NOME>, seguindo exatamente o
START.md do kizuna-starter (ou kizuna-core/.claude/skills/setup-projeto-novo/SKILL.md):

1. git init; git submodule add -b develop https://github.com/zherro/kizuna-core.git kizuna-core;
   copie kizuna.plugins.json, kizuna.config.json e .env.example de kizuna-core/starter/.
2. node kizuna-core/cli install --yes
3. cp .env.example .env; gere PGRST_JWT_SECRET com node crypto (36 bytes base64url) e uma senha
   aleatória para POSTGRES_PASSWORD (a mesma dentro de DATABASE_URL). Não me mostre os segredos.
   Se 5432/3001 estiverem ocupadas, use DB_PORT/PGRST_PORT livres e ajuste DATABASE_URL/POSTGREST_URL.
4. docker compose -f docker-compose.db.yml up -d --wait; node kizuna-core/cli db install
5. npm run dev; crie o 1º usuário em /registre-se (vira root) e confirme /api/auth/me → is_root true.
6. node kizuna-core/cli db run kizuna-core/plugins/pages/0002_pages_seed.sql
7. Rode npm run build e node kizuna-core/cli check e me diga o resultado de cada passo.

Regras: o core é o engine e o projeto é só casca de apresentação — lógica genérica vai para o
kizuna-core, não para o projeto. Troque o nome "Foco Total" em kizuna.config.json para <NOME>.
Se algum passo falhar, pare, mostre o erro e proponha a correção no core antes de contornar.
```
