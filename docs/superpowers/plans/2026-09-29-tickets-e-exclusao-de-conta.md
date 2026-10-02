# Tickets + exclusão/recriação de conta — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usuário exclui a própria conta e pode recriá-la com o mesmo e-mail; a recriação abre um ticket para o root; plugin `tickets` genérico (usuário abre chamados/comenta, staff trabalha a fila).

**Architecture:** Banco só com tabelas/colunas/índices/RLS/GRANTs (nenhuma função/view nova). Operações privilegiadas em TypeScript no servidor do core com um token de serviço (`service_role`, BYPASSRLS). Cada regra num módulo pequeno com dependências injetadas (testável sem banco). Telas via `/api/resources` + screen-engine; componentes sob medida só para thread de comentários, formulário de chamado e exclusão de conta.

**Tech Stack:** PostgreSQL + PostgREST, Next.js 16 (App Router, `proxy.ts`), TypeScript, vitest + @testing-library/react, kizuna CLI (Node ESM).

**Spec:** `docs/superpowers/specs/2026-09-29-tickets-e-exclusao-de-conta-design.md`

## Global Constraints

- Nenhuma `CREATE FUNCTION`/`CREATE VIEW` nova. Pode *usar* `auth.fun_auth_has_perm`, `auth.fun_auth_user_id`, `auth.fun_notify`.
- SQL idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), termina com `NOTIFY pgrst, 'reload schema';`.
- Token de serviço só no servidor (`POSTGREST_SERVICE_TOKEN`), nunca `NEXT_PUBLIC_*`.
- Falha em detectar recriação/abrir ticket **nunca** falha o cadastro.
- Sem token de serviço: exclusão de conta responde 503; revogação no proxy é pulada (aviso único no log).
- Estilo: aspas simples, 100 colunas, trailing comma es5 (`npx prettier --single-quote --print-width 100 --trailing-comma es5`).
- Commits: **só quando o usuário pedir** (regra do projeto). Os passos "Checkpoint" abaixo substituem commit.
- Core = `kizuna-core/` (submódulo, branch `develop`); starter = raiz. Testes do core: `cd kizuna-core && npx vitest run <path>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `kizuna-core/sql/0117_service_role_and_account_deletion.sql` | role `service_role`, GRANTs, `auth.users.deleted_login` + índice |
| `kizuna-core/cli/commands/token.mjs` (+ test) | `kizuna token service` → imprime o JWT de serviço |
| `kizuna-core/src/server/service-db.ts` (+ test) | `serviceTable()` / `serviceRpc()`: PostgREST com token de serviço; `ServiceUnavailableError` |
| `kizuna-core/src/server/account/delete-account.ts` (+ test) | regra de exclusão (passos em ordem) |
| `kizuna-core/src/server/account/delete-account-handler.ts` (+ test) | rota `POST /api/account/delete` (validações HTTP) |
| `kizuna-core/src/server/account/session-revocation.ts` (+ test) | checker com cache 60 s |
| `kizuna-core/src/server/proxy.ts` | usa o checker |
| `kizuna-core/src/server/account/report-recreation.ts` (+ test) | detecta recriação, abre ticket, notifica roots |
| `kizuna-core/src/server/auth-handlers.ts`, `oauth-handlers.ts` | chamam `reportAccountRecreation` |
| `kizuna-core/plugins/tickets/0001_tickets.sql` (+ `rls-check.sql`) | tabelas, RLS, permissão |
| `kizuna-core/src/client/components/screen-engine/resources/tickets.ts` (+ test) | `ResourceConfig` de `tickets` e `ticket_comments` |
| `kizuna-core/src/client/components/tickets/*` (+ tests) | `comment-rules.ts`, `ticket-create-form.tsx`, `ticket-detail.tsx`, `ticket-thread.tsx`, `open-tickets-badge.tsx` |
| `kizuna-core/src/client/components/screen-engine/screens/chamados.ts` | lista (page-header + list) |
| `kizuna-core/src/client/components/account/delete-account-section.tsx` (+ test) | bloco `delete-account` |
| `kizuna-core/plugins/tickets/shell/**` | páginas `/painel/chamados`, `/novo`, `/[id]` + manifest |
| starter: `kizuna.plugins.json`, `src/lib/server/resources.ts`, `src/components/panel-shell.tsx`, `src/app/api/account/delete/route.ts`, `.env.example` | ativação e fiação |

---

### Task 1: Banco do core — service_role e `deleted_login`

**Files:**
- Create: `kizuna-core/sql/0117_service_role_and_account_deletion.sql`

**Interfaces:**
- Produces: role `service_role`; coluna `auth.users.deleted_login text`; índice `users_deleted_login_idx`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0117_service_role_and_account_deletion.sql
-- 1) `service_role`: papel do servidor para operações privilegiadas feitas em TypeScript (excluir
--    conta, abrir ticket do sistema, checar revogação de sessão). BYPASSRLS + GRANTs mínimos —
--    nenhuma função nova. O JWT `{ "role": "service_role" }` (kizuna token service) fica só no
--    servidor, em POSTGREST_SERVICE_TOKEN.
-- 2) `auth.users.deleted_login`: e-mail original de uma conta excluída. O `login` vira
--    `deleted:<uid>:<email>` (libera o UNIQUE para recriar a conta); o cadastro acha a conta
--    antiga por igualdade exata neste campo.
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT service_role TO authenticator;
GRANT USAGE ON SCHEMA auth, public TO service_role;

GRANT SELECT, UPDATE ON TABLE auth.users TO service_role;
GRANT SELECT, DELETE ON TABLE auth.user_identities TO service_role;
GRANT SELECT ON TABLE auth.tenants TO service_role;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_login text;

CREATE INDEX IF NOT EXISTS users_deleted_login_idx
  ON auth.users (deleted_login)
  WHERE deleted_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

Os GRANTs de `public.services`, `public.notifications` e `auth.fun_notify` ficam nos plugins donos (Tasks 6 e 7), porque o core não pode assumir que esses plugins existem.

- [ ] **Step 2: Regenerar os consolidados**

Run: `node db/build.mjs` (raiz) e `node kizuna-core/bundle/build.mjs`
Expected: `db/auth.sql` e `kizuna-core/bundle/core-schema.sql` contêm `0117_service_role_and_account_deletion.sql` (`Select-String -Path db/auth.sql -Pattern 'users_deleted_login_idx'` acha 1 linha).

- [ ] **Step 3: Checkpoint** — revisar diff; não commitar.

---

### Task 2: CLI — `kizuna token service`

**Files:**
- Create: `kizuna-core/cli/commands/token.mjs`
- Create: `kizuna-core/cli/commands/token.test.mjs`
- Modify: `kizuna-core/cli/index.mjs` (lista `COMMANDS` e `USAGE`)

**Interfaces:**
- Produces: `run(ctx)` imprime o JWT; `signServiceToken(secret: string): string` exportado.

- [ ] **Step 1: Teste que falha**

```js
// kizuna-core/cli/commands/token.test.mjs
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signServiceToken } from './token.mjs';

describe('signServiceToken', () => {
  it('assina { role: service_role } com o segredo, sem expiração', () => {
    const token = signServiceToken('segredo-de-teste-com-32-caracteres!!');
    const payload = jwt.verify(token, 'segredo-de-teste-com-32-caracteres!!');
    expect(payload.role).toBe('service_role');
    expect(payload.exp).toBeUndefined();
  });

  it('recusa segredo vazio', () => {
    expect(() => signServiceToken('')).toThrow(/PGRST_JWT_SECRET/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run cli/commands/token.test.mjs`
Expected: FAIL (`Cannot find module './token.mjs'`).

- [ ] **Step 3: Implementar**

```js
// kizuna-core/cli/commands/token.mjs
// `kizuna token service` — imprime o JWT do papel `service_role` (sql/0117) assinado com
// PGRST_JWT_SECRET (env ou .env do projeto). Cole em POSTGREST_SERVICE_TOKEN. Só servidor.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';

export function signServiceToken(secret) {
  if (!secret) throw new Error('PGRST_JWT_SECRET ausente (env ou .env do projeto).');
  return jwt.sign({ role: 'service_role' }, secret, { algorithm: 'HS256' });
}

function secretFromDotEnv(projectDir) {
  const file = join(projectDir, '.env');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('PGRST_JWT_SECRET='));
  return line ? line.slice('PGRST_JWT_SECRET='.length).trim() : '';
}

export async function run(ctx) {
  if (ctx.args[0] !== 'service') {
    console.error('uso: kizuna token service');
    return 1;
  }
  const secret = process.env.PGRST_JWT_SECRET || secretFromDotEnv(ctx.paths.projectDir);
  console.log(signServiceToken(secret));
  return 0;
}
```

Em `cli/index.mjs`: acrescentar `'token'` ao array `COMMANDS` e a linha `  token service      imprime o JWT de serviço (POSTGREST_SERVICE_TOKEN)` no `USAGE`. Se `jsonwebtoken` não estiver nas dependências do `cli/package.json`, importar do `node_modules` do core (já é dependência do core — conferir com `node -e "import('jsonwebtoken')"` dentro de `kizuna-core`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run cli/commands/token.test.mjs` → PASS (2).
Run: `node kizuna-core/cli token service` (raiz) → imprime um JWT.

- [ ] **Step 5: Checkpoint.**

---

### Task 3: `service-db` — acesso ao PostgREST com o token de serviço

**Files:**
- Create: `kizuna-core/src/server/service-db.ts`
- Create: `kizuna-core/src/server/service-db.test.ts`
- Modify: `kizuna-core/src/server/index.ts` (exports)

**Interfaces:**
- Consumes: `pgrstTable(path, init, { auth })`, `pgrstRpc(name, body, { auth, schema })` de `./postrest/conn`; `getServiceAuthHeader()` de `./auth`.
- Produces:
  - `class ServiceUnavailableError extends Error`
  - `hasServiceAccess(): boolean`
  - `serviceTable(path: string, init?: RequestInit & { schema?: 'auth' | 'public' }): Promise<Response>` — lança `ServiceUnavailableError` sem token; seta `Accept-Profile`/`Content-Profile`.
  - `serviceRpc(name: string, body: unknown, schema?: 'auth' | 'public'): Promise<Response>`
  - `type ServiceDb = { table: typeof serviceTable; rpc: typeof serviceRpc }` e `const serviceDb: ServiceDb`

- [ ] **Step 1: Teste que falha**

```ts
// kizuna-core/src/server/service-db.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasServiceAccess, serviceTable, ServiceUnavailableError } from './service-db';

const ORIGINAL = process.env.POSTGREST_SERVICE_TOKEN;

beforeEach(() => {
  process.env.POSTGREST_SERVICE_TOKEN = 'tok';
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
});

afterEach(() => {
  process.env.POSTGREST_SERVICE_TOKEN = ORIGINAL;
  vi.unstubAllGlobals();
});

describe('service-db', () => {
  it('sem token: hasServiceAccess false e serviceTable lança ServiceUnavailableError', async () => {
    delete process.env.POSTGREST_SERVICE_TOKEN;
    expect(hasServiceAccess()).toBe(false);
    await expect(serviceTable('/users')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('envia o token de serviço e o schema pedido', async () => {
    await serviceTable('/users?select=uid', { schema: 'auth' });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('Accept-Profile')).toBe('auth');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/server/service-db.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// kizuna-core/src/server/service-db.ts
import { getServiceAuthHeader } from './auth';
import { pgrstRpc, pgrstTable } from './postrest/conn';

/**
 * Acesso ao PostgREST como `service_role` (sql/0117: BYPASSRLS + GRANTs mínimos). Só para
 * operações do servidor que a sessão do usuário não pode fazer (excluir conta, abrir ticket do
 * sistema, checar revogação). Sem POSTGREST_SERVICE_TOKEN, lança `ServiceUnavailableError`:
 * quem chama decide se isso é 503 ou no-op.
 */
export class ServiceUnavailableError extends Error {
  constructor() {
    super('POSTGREST_SERVICE_TOKEN não configurado (rode: kizuna token service).');
  }
}

type Schema = 'auth' | 'public';

function requireServiceAuth(): string {
  const auth = getServiceAuthHeader();
  if (!auth) throw new ServiceUnavailableError();
  return auth;
}

export function hasServiceAccess(): boolean {
  return getServiceAuthHeader() !== null;
}

export async function serviceTable(
  path: string,
  init: RequestInit & { schema?: Schema } = {}
): Promise<Response> {
  const auth = requireServiceAuth();
  const { schema = 'public', headers, ...rest } = init;
  const merged = new Headers(headers);
  merged.set('Accept-Profile', schema);
  merged.set('Content-Profile', schema);
  return pgrstTable(path, { ...rest, headers: merged }, { auth });
}

export async function serviceRpc(name: string, body: unknown, schema: Schema = 'public') {
  return pgrstRpc(name, body, { auth: requireServiceAuth(), schema });
}

export type ServiceDb = { table: typeof serviceTable; rpc: typeof serviceRpc };
export const serviceDb: ServiceDb = { table: serviceTable, rpc: serviceRpc };
```

Em `src/server/index.ts` exportar: `hasServiceAccess, serviceTable, serviceRpc, serviceDb, ServiceUnavailableError, type ServiceDb`.

- [ ] **Step 4: Rodar e ver passar** → PASS (2).
- [ ] **Step 5: Checkpoint.**

---

### Task 4: Excluir conta — regra + rota

**Files:**
- Create: `kizuna-core/src/server/account/delete-account.ts`, `delete-account.test.ts`
- Create: `kizuna-core/src/server/account/delete-account-handler.ts`, `delete-account-handler.test.ts`
- Modify: `kizuna-core/src/server/auth.ts` (`SessionPayload.iat?: number`)
- Modify: `kizuna-core/src/server/index.ts` (exports)
- Create (starter): `src/app/api/account/delete/route.ts`; e o mesmo arquivo em `kizuna-core/template/src/app/api/account/delete/route.ts` + entrada `"managed"` no manifest do template (mesmo formato das outras rotas `src/app/api/account/*` já listadas lá).

**Interfaces:**
- Consumes: `ServiceDb` (Task 3).
- Produces:
  - `deleteAccount(db: ServiceDb, input: { userId: string; login: string }, now?: Date): Promise<void>`
  - `RECENT_LOGIN_MAX_AGE_SEC = 900`
  - `createDeleteAccountHandler(deps?: { db?: ServiceDb; getSession?: () => Promise<SessionPayload | null>; now?: () => Date }): (request: Request) => Promise<Response>`
  - Respostas: 200 `{ ok: true }` + cookie `session` expirado; 401 `{ code: 'unauthenticated' }`; 401 `{ code: 'reauth_required' }`; 400 `{ code: 'email_mismatch' }`; 403 `{ code: 'root_forbidden' }`; 503 `{ code: 'service_unavailable' }`.

- [ ] **Step 1: Testes que falham (regra)**

```ts
// kizuna-core/src/server/account/delete-account.test.ts
import { describe, expect, it, vi } from 'vitest';
import { deleteAccount } from './delete-account';
import type { ServiceDb } from '../service-db';

function fakeDb(tenants: string[] = ['t1']) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const table = vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && path.startsWith('/tenants')) {
      return new Response(JSON.stringify(tenants.map((uid) => ({ uid }))), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
  return { db: { table, rpc: vi.fn() } as unknown as ServiceDb, calls };
}

const NOW = new Date('2026-09-29T12:00:00Z');

describe('deleteAccount', () => {
  it('desativa anúncios, remove login social e por último marca a conta (tombstone)', async () => {
    const { db, calls } = fakeDb(['t1', 't2']);
    await deleteAccount(db, { userId: 'u1', login: 'a@b.com' }, NOW);

    expect(calls.map((c) => `${c.method} ${c.path.split('?')[0]}`)).toEqual([
      'GET /tenants',
      'PATCH /services',
      'DELETE /user_identities',
      'PATCH /users',
    ]);
    expect(calls[1].path).toContain('tenant_id=in.(t1,t2)');
    expect(calls[3].body).toEqual({
      deleted_login: 'a@b.com',
      login: 'deleted:u1:a@b.com',
      is_active: false,
      deleted_at: NOW.toISOString(),
      phone: null,
      sessions_revoked_at: NOW.toISOString(),
    });
  });

  it('sem tenant: pula a desativação de anúncios', async () => {
    const { db, calls } = fakeDb([]);
    await deleteAccount(db, { userId: 'u1', login: 'a@b.com' }, NOW);
    expect(calls.some((c) => c.path.startsWith('/services'))).toBe(false);
  });

  it('falha num passo: lança e não marca a conta', async () => {
    const { db, calls } = fakeDb();
    (db.table as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => new Response('[]', { status: 500 })
    );
    await expect(deleteAccount(db, { userId: 'u1', login: 'a@b.com' }, NOW)).rejects.toThrow();
    expect(calls.some((c) => c.path.startsWith('/users'))).toBe(false);
  });
});
```

(O `services` é tabela do plugin `services`; se ele não estiver instalado o PATCH devolve 404 — tratar 404 como "nada a desativar", coberto no Step 3.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/server/account/delete-account.test.ts` → FAIL.

- [ ] **Step 3: Implementar a regra**

```ts
// kizuna-core/src/server/account/delete-account.ts
import type { ServiceDb } from '../service-db';

/**
 * Exclui a conta do usuário (lógico) liberando o e-mail para um novo cadastro. Passos em ordem e
 * idempotentes; o tombstone do login é o ÚLTIMO — se algo antes falhar, a conta segue intacta e a
 * operação pode ser repetida. Os dados da conta (perfil, avaliações...) ficam guardados.
 */
export async function deleteAccount(
  db: ServiceDb,
  input: { userId: string; login: string },
  now: Date = new Date()
): Promise<void> {
  const { userId, login } = input;
  const at = now.toISOString();

  const tenants = await expectJson<{ uid: string }[]>(
    await db.table(`/tenants?select=uid&owner_uid=eq.${userId}`, { schema: 'auth' }),
    'tenants'
  );

  if (tenants.length > 0) {
    const ids = tenants.map((t) => t.uid).join(',');
    await expectOk(
      await db.table(`/services?tenant_id=in.(${ids})`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      }),
      'services',
      { allowNotFound: true } // plugin services ausente
    );
  }

  await expectOk(
    await db.table(`/user_identities?user_uid=eq.${userId}`, { method: 'DELETE', schema: 'auth' }),
    'user_identities'
  );

  await expectOk(
    await db.table(`/users?uid=eq.${userId}`, {
      method: 'PATCH',
      schema: 'auth',
      body: JSON.stringify({
        deleted_login: login,
        login: `deleted:${userId}:${login}`,
        is_active: false,
        deleted_at: at,
        phone: null,
        sessions_revoked_at: at,
      }),
    }),
    'users'
  );
}

async function expectOk(res: Response, step: string, opts: { allowNotFound?: boolean } = {}) {
  if (res.ok || (opts.allowNotFound && res.status === 404)) return;
  throw new Error(`deleteAccount: ${step} falhou (${res.status})`);
}

async function expectJson<T>(res: Response, step: string): Promise<T> {
  await expectOk(res, step);
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (3).

- [ ] **Step 5: Testes que falham (rota)**

```ts
// kizuna-core/src/server/account/delete-account-handler.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDeleteAccountHandler } from './delete-account-handler';
import { ServiceUnavailableError, type ServiceDb } from '../service-db';

vi.mock('./delete-account', () => ({ deleteAccount: vi.fn(async () => {}) }));
import { deleteAccount } from './delete-account';

const NOW = new Date('2026-09-29T12:00:00Z');
const nowSec = NOW.getTime() / 1000;
const db = {} as ServiceDb;

function handler(session: Record<string, unknown> | null) {
  return createDeleteAccountHandler({
    db,
    getSession: async () => session as never,
    now: () => NOW,
  });
}

const req = (email: string) =>
  new Request('http://x/api/account/delete', { method: 'POST', body: JSON.stringify({ email }) });

const session = { user_id: 'u1', tenant_id: 't1', login: 'a@b.com', iat: nowSec - 60 };

describe('POST /api/account/delete', () => {
  it('sem sessão → 401 unauthenticated', async () => {
    const res = await handler(null)(req('a@b.com'));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthenticated');
  });

  it('login antigo (> 15 min) → 401 reauth_required', async () => {
    const res = await handler({ ...session, iat: nowSec - 16 * 60 })(req('a@b.com'));
    expect((await res.json()).code).toBe('reauth_required');
  });

  it('e-mail diferente do login → 400 email_mismatch', async () => {
    const res = await handler(session)(req('outro@b.com'));
    expect((await res.json()).code).toBe('email_mismatch');
  });

  it('root → 403 root_forbidden', async () => {
    const res = await handler({ ...session, is_root: true })(req('a@b.com'));
    expect(res.status).toBe(403);
  });

  it('ok → 200, exclui e expira o cookie de sessão', async () => {
    const res = await handler(session)(req(' A@B.com '));
    expect(res.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledWith(db, { userId: 'u1', login: 'a@b.com' }, NOW);
    expect(res.headers.get('set-cookie')).toMatch(/session=;.*Max-Age=0/i);
  });

  it('sem token de serviço → 503', async () => {
    (deleteAccount as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ServiceUnavailableError()
    );
    const res = await handler(session)(req('a@b.com'));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar** → FAIL.

- [ ] **Step 7: Implementar a rota**

```ts
// kizuna-core/src/server/account/delete-account-handler.ts
import { NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME, type SessionPayload } from '../auth';
import { serviceDb, ServiceUnavailableError, type ServiceDb } from '../service-db';
import { deleteAccount } from './delete-account';

/** Login precisa ter no máximo 15 min para excluir a conta (confirmação sem senha). */
export const RECENT_LOGIN_MAX_AGE_SEC = 15 * 60;

type Deps = {
  db?: ServiceDb;
  getSession?: () => Promise<SessionPayload | null>;
  now?: () => Date;
};

const fail = (status: number, code: string) => NextResponse.json({ code }, { status });

export function createDeleteAccountHandler(deps: Deps = {}) {
  const db = deps.db ?? serviceDb;
  const readSession = deps.getSession ?? getSession;
  const now = deps.now ?? (() => new Date());

  return async function handleDeleteAccount(request: Request): Promise<Response> {
    const session = await readSession();
    if (!session?.login) return fail(401, 'unauthenticated');
    if (session.is_root) return fail(403, 'root_forbidden');

    const ageSec = now().getTime() / 1000 - (session.iat ?? 0);
    if (ageSec > RECENT_LOGIN_MAX_AGE_SEC) return fail(401, 'reauth_required');

    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email !== session.login.trim().toLowerCase()) return fail(400, 'email_mismatch');

    try {
      await deleteAccount(db, { userId: session.user_id, login: session.login }, now());
    } catch (error) {
      if (error instanceof ServiceUnavailableError) return fail(503, 'service_unavailable');
      console.error('[account.delete] failed', { userId: session.user_id, error: String(error) });
      return fail(500, 'delete_failed');
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', path: '/', maxAge: 0 });
    return response;
  };
}
```

Em `auth.ts`, acrescentar `iat?: number;` ao `SessionPayload` (o `jsonwebtoken` já grava `iat`). Exportar `createDeleteAccountHandler` e `deleteAccount` em `src/server/index.ts`. Rota do starter e do template:

```ts
// src/app/api/account/delete/route.ts
import { createDeleteAccountHandler } from '@kizuna/core/server';

export const runtime = 'nodejs';
export const POST = createDeleteAccountHandler();
```

- [ ] **Step 8: Rodar e ver passar** — `npx vitest run src/server/account` → PASS (9).
- [ ] **Step 9: Checkpoint.**

---

### Task 5: Revogação de sessão no proxy

**Files:**
- Create: `kizuna-core/src/server/account/session-revocation.ts`, `session-revocation.test.ts`
- Modify: `kizuna-core/src/server/proxy.ts`

**Interfaces:**
- Produces:
  - `type UserStatus = { isActive: boolean; sessionsRevokedAt: string | null } | null` (null = usuário não existe)
  - `createSessionRevocationChecker(opts: { fetchStatus: (userId: string) => Promise<UserStatus>; ttlMs?: number; now?: () => number }): { isRevoked(userId: string, issuedAtSec: number): Promise<boolean> }`
  - `fetchUserStatusViaService(userId: string): Promise<UserStatus>` (usa `serviceTable`)

- [ ] **Step 1: Teste que falha**

```ts
// kizuna-core/src/server/account/session-revocation.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSessionRevocationChecker } from './session-revocation';

const T0 = Date.parse('2026-09-29T12:00:00Z');
const iat = T0 / 1000 - 3600; // emitido 1h antes

function checker(status: unknown, now = () => T0) {
  const fetchStatus = vi.fn(async () => status as never);
  return { fetchStatus, c: createSessionRevocationChecker({ fetchStatus, ttlMs: 60_000, now }) };
}

describe('session revocation', () => {
  it('conta ativa sem revogação → válida', async () => {
    const { c } = checker({ isActive: true, sessionsRevokedAt: null });
    expect(await c.isRevoked('u1', iat)).toBe(false);
  });

  it('conta inativa ou inexistente → revogada', async () => {
    expect(await checker({ isActive: false, sessionsRevokedAt: null }).c.isRevoked('u1', iat)).toBe(true);
    expect(await checker(null).c.isRevoked('u1', iat)).toBe(true);
  });

  it('token emitido antes da revogação → revogado; depois → válido', async () => {
    const revokedAt = new Date(T0 - 1800_000).toISOString(); // 30 min antes de agora
    const { c } = checker({ isActive: true, sessionsRevokedAt: revokedAt });
    expect(await c.isRevoked('u1', iat)).toBe(true);
    expect(await c.isRevoked('u1', T0 / 1000 - 60)).toBe(false);
  });

  it('cacheia por usuário durante o TTL', async () => {
    let now = T0;
    const { c, fetchStatus } = checker({ isActive: true, sessionsRevokedAt: null }, () => now);
    await c.isRevoked('u1', iat);
    await c.isRevoked('u1', iat);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    now += 61_000;
    await c.isRevoked('u1', iat);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('erro ao consultar → não derruba a sessão (fail-open) e não cacheia', async () => {
    const fetchStatus = vi.fn(async () => {
      throw new Error('down');
    });
    const c = createSessionRevocationChecker({ fetchStatus, now: () => T0 });
    expect(await c.isRevoked('u1', iat)).toBe(false);
    await c.isRevoked('u1', iat);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
// kizuna-core/src/server/account/session-revocation.ts
import { serviceTable } from '../service-db';

/**
 * A sessão é um JWT de 7 dias: sozinha ela não "sabe" que a conta foi excluída/bloqueada. Este
 * checker compara o `iat` do token com `auth.users.sessions_revoked_at` / `is_active`, com cache
 * por usuário (padrão 60 s) — no máximo 1 consulta por usuário por minuto, por instância.
 * Falha na consulta = fail-open (não derruba ninguém por instabilidade do banco).
 */
export type UserStatus = { isActive: boolean; sessionsRevokedAt: string | null } | null;

type Options = {
  fetchStatus: (userId: string) => Promise<UserStatus>;
  ttlMs?: number;
  now?: () => number;
};

export function createSessionRevocationChecker({ fetchStatus, ttlMs = 60_000, now = Date.now }: Options) {
  const cache = new Map<string, { at: number; status: UserStatus }>();

  async function statusOf(userId: string): Promise<UserStatus | undefined> {
    const hit = cache.get(userId);
    if (hit && now() - hit.at < ttlMs) return hit.status;
    try {
      const status = await fetchStatus(userId);
      cache.set(userId, { at: now(), status });
      return status;
    } catch {
      return undefined;
    }
  }

  return {
    async isRevoked(userId: string, issuedAtSec: number): Promise<boolean> {
      const status = await statusOf(userId);
      if (status === undefined) return false;
      if (status === null || !status.isActive) return true;
      if (!status.sessionsRevokedAt) return false;
      return issuedAtSec * 1000 < Date.parse(status.sessionsRevokedAt);
    },
  };
}

export async function fetchUserStatusViaService(userId: string): Promise<UserStatus> {
  const res = await serviceTable(
    `/users?select=is_active,sessions_revoked_at&uid=eq.${userId}&limit=1`,
    { schema: 'auth' }
  );
  if (!res.ok) throw new Error(`users ${res.status}`);
  const [row] = (await res.json()) as { is_active: boolean | null; sessions_revoked_at: string | null }[];
  return row ? { isActive: row.is_active !== false, sessionsRevokedAt: row.sessions_revoked_at } : null;
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (5).

- [ ] **Step 5: Ligar no proxy**

Em `kizuna-core/src/server/proxy.ts`:
1. Trocar `hasValidSession(token): boolean` por `decodeSession(token): { user_id: string; iat: number } | null` (mesmo `jwt.verify`, devolvendo o payload).
2. Criar o checker uma vez no módulo, só quando houver acesso de serviço:

```ts
import { hasServiceAccess } from './service-db';
import {
  createSessionRevocationChecker,
  fetchUserStatusViaService,
} from './account/session-revocation';

const revocation = createSessionRevocationChecker({ fetchStatus: fetchUserStatusViaService });
let warnedNoService = false;

async function isSessionActive(session: { user_id: string; iat: number } | null): Promise<boolean> {
  if (!session) return false;
  if (!hasServiceAccess()) {
    if (!warnedNoService) {
      console.warn('[proxy] POSTGREST_SERVICE_TOKEN ausente — revogação de sessão desligada.');
      warnedNoService = true;
    }
    return true;
  }
  return !(await revocation.isRevoked(session.user_id, session.iat));
}
```

3. A função retornada vira `async function proxy(request)`; `const authenticated = await isSessionActive(decodeSession(token));`. Quando havia token mas `authenticated` é false, a resposta final (`NextResponse.next()` ou o redirect) apaga o cookie: `res.cookies.set({ name: sessionCookie, value: '', path: '/', maxAge: 0 })`. Extrair isso num helper `withClearedSession(res)` para não repetir nos três retornos.

- [ ] **Step 6: Verificar** — `cd .. && npx tsc --noEmit -p tsconfig.json` sem erros fora de `.next/types`; `npx vitest run src/server` no core → PASS.
- [ ] **Step 7: Checkpoint.**

---

### Task 6: Plugin `tickets` — banco

**Files:**
- Create: `kizuna-core/plugins/tickets/0001_tickets.sql`
- Create: `kizuna-core/plugins/tickets/rls-check.sql` (roteiro manual de verificação)
- Modify: `kizuna-core/plugins/services/` → **não**; em vez disso, o GRANT de `services` ao `service_role` vai num `0006_services_service_role.sql` do plugin `services`:

```sql
-- plugins/services/0006_services_service_role.sql
-- A exclusão de conta (core, TypeScript com service_role) desativa os anúncios do usuário.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, UPDATE ON TABLE public.services TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
```

  e o de `notifications` num `0003_notifications_service_role.sql` do plugin `notifications`:

```sql
-- plugins/notifications/0003_notifications_service_role.sql
-- Servidor (service_role) avisa usuários via a função existente auth.fun_notify.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON TABLE auth.tenants TO service_role;
    GRANT EXECUTE ON FUNCTION auth.fun_notify(uuid, text, text, text, text, text) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
```

- Modify: `kizuna.plugins.json` (starter): acrescentar `"tickets"` depois de `"notifications"`.

**Interfaces:**
- Produces: tabelas `public.tickets`, `public.ticket_comments`; permissão `tickets.manage`.

- [ ] **Step 1: Escrever `0001_tickets.sql`**

```sql
-- plugins/tickets/0001_tickets.sql
-- Chamados. Usuário abre (type 'support') e comenta os seus; staff (tickets.manage — root sempre)
-- vê todos, muda status e comenta. O sistema (service_role, servidor) abre tickets automáticos
-- (ex.: 'account_recreated', created_by NULL — só staff vê). Sem funções/views: tudo é RLS.
-- Comentários: o autor edita/apaga (lógico, deleted_at) os próprios enquanto não houver resposta
-- de staff posterior; staff vê os apagados. Status muda por UPDATE em tickets + comentário
-- kind 'status_change' (duas escritas, feitas pela tela).

CREATE TABLE IF NOT EXISTS public.tickets (
  id               bigserial PRIMARY KEY,
  uid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  type             text NOT NULL DEFAULT 'support'
                   CHECK (type IN ('support', 'account_recreated')),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  description      text,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_by       uuid DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  subject_user_id  uuid REFERENCES auth.users(uid) ON DELETE RESTRICT,
  related_user_id  uuid REFERENCES auth.users(uid) ON DELETE RESTRICT,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_created_by_idx ON public.tickets (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id               bigserial PRIMARY KEY,
  uid              uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ticket_id        bigint NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id        uuid NOT NULL DEFAULT auth.fun_auth_user_id() REFERENCES auth.users(uid) ON DELETE RESTRICT,
  author_is_staff  boolean NOT NULL DEFAULT false,
  kind             text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'status_change')),
  body             text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON public.ticket_comments (ticket_id, created_at);

-- tickets -----------------------------------------------------------------------------------
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.tickets TO auth_user;
GRANT INSERT (type, title, description) ON TABLE public.tickets TO auth_user;
GRANT UPDATE (status, resolved_at, updated_at) ON TABLE public.tickets TO auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.tickets_id_seq TO auth_user;

DROP POLICY IF EXISTS tickets_select ON public.tickets;
CREATE POLICY tickets_select ON public.tickets FOR SELECT TO auth_user
USING (created_by = auth.fun_auth_user_id() OR auth.fun_auth_has_perm('tickets', 'manage'));

DROP POLICY IF EXISTS tickets_insert ON public.tickets;
CREATE POLICY tickets_insert ON public.tickets FOR INSERT TO auth_user
WITH CHECK (
  created_by = auth.fun_auth_user_id()
  AND status = 'open'
  AND (type = 'support' OR auth.fun_auth_has_perm('tickets', 'manage'))
);

DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets FOR UPDATE TO auth_user
USING (auth.fun_auth_has_perm('tickets', 'manage'))
WITH CHECK (auth.fun_auth_has_perm('tickets', 'manage'));

-- ticket_comments ---------------------------------------------------------------------------
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.ticket_comments TO auth_user;
GRANT INSERT (ticket_id, body, kind, author_is_staff) ON TABLE public.ticket_comments TO auth_user;
GRANT UPDATE (body, updated_at, deleted_at) ON TABLE public.ticket_comments TO auth_user;
GRANT USAGE, SELECT ON SEQUENCE public.ticket_comments_id_seq TO auth_user;

-- "Visível" = o ticket passa na RLS de tickets para quem consulta.
DROP POLICY IF EXISTS ticket_comments_select ON public.ticket_comments;
CREATE POLICY ticket_comments_select ON public.ticket_comments FOR SELECT TO auth_user
USING (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id)
  AND (deleted_at IS NULL OR auth.fun_auth_has_perm('tickets', 'manage'))
);

DROP POLICY IF EXISTS ticket_comments_insert ON public.ticket_comments;
CREATE POLICY ticket_comments_insert ON public.ticket_comments FOR INSERT TO auth_user
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id)
  AND author_id = auth.fun_auth_user_id()
  AND author_is_staff = auth.fun_auth_has_perm('tickets', 'manage')
  AND (kind = 'comment' OR auth.fun_auth_has_perm('tickets', 'manage'))
);

-- Autor edita/apaga os próprios, não apagados, enquanto não houver resposta de staff posterior
-- (staff não tem essa trava nos próprios).
DROP POLICY IF EXISTS ticket_comments_update ON public.ticket_comments;
CREATE POLICY ticket_comments_update ON public.ticket_comments FOR UPDATE TO auth_user
USING (
  author_id = auth.fun_auth_user_id()
  AND deleted_at IS NULL
  AND (
    auth.fun_auth_has_perm('tickets', 'manage')
    OR NOT EXISTS (
      SELECT 1 FROM public.ticket_comments r
      WHERE r.ticket_id = ticket_comments.ticket_id
        AND r.author_is_staff
        AND r.created_at > ticket_comments.created_at
    )
  )
)
WITH CHECK (author_id = auth.fun_auth_user_id());

-- service_role (servidor): abre tickets do sistema. BYPASSRLS; só GRANTs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON TABLE public.tickets TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE public.tickets_id_seq TO service_role;
  END IF;
END $$;

INSERT INTO auth.permissions (resource, action, name)
VALUES ('tickets', 'manage', 'Gerenciar chamados (ver todos, mudar status, responder)')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('tickets', '1.0.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Escrever `rls-check.sql`** — roteiro que roda dentro de `BEGIN ... ROLLBACK`, simulando claims com `SET LOCAL role auth_user; SELECT set_config('request.jwt.claims', '{"user_id":"<uid>","role":"auth_user"}', true);` e confere com `SELECT count(*)`: (a) usuário vê só o próprio ticket; (b) não vê ticket de sistema; (c) `UPDATE tickets SET status='resolved'` afeta 0 linhas; (d) comenta no próprio; (e) edita o próprio comentário; (f) após comentário com `author_is_staff = true` posterior, o `UPDATE` do comentário afeta 0 linhas; (g) `deleted_at` some do SELECT do usuário e aparece com claims `{"is_root": true}`. Cada verificação com `-- esperado: N` ao lado.

- [ ] **Step 3: Regenerar consolidados** — `node db/build.mjs && node kizuna-core/bundle/build.mjs`; `Select-String db/public.sql -Pattern 'CREATE TABLE IF NOT EXISTS public.tickets'` acha 1 linha.
- [ ] **Step 4: Aplicar num banco local** (usuário roda; sem `DATABASE_URL` aqui): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f kizuna-core/sql/0117_service_role_and_account_deletion.sql -f kizuna-core/plugins/services/0006_services_service_role.sql -f kizuna-core/plugins/notifications/0003_notifications_service_role.sql -f kizuna-core/plugins/tickets/0001_tickets.sql` duas vezes (idempotência) e depois `rls-check.sql` com os uids reais.
- [ ] **Step 5: Checkpoint.**

---

### Task 7: Detectar recriação → ticket + aviso aos roots

**Files:**
- Create: `kizuna-core/src/server/account/report-recreation.ts`, `report-recreation.test.ts`
- Modify: `kizuna-core/src/server/auth-handlers.ts` (após auto-login OK, antes de montar a resposta)
- Modify: `kizuna-core/src/server/oauth-handlers.ts` (após `rpcRes.ok`, quando `data.created === true`)

**Interfaces:**
- Consumes: `ServiceDb` (Task 3).
- Produces: `reportAccountRecreation(db: ServiceDb, input: { login: string; newUserId: string }): Promise<'none' | 'reported' | 'plugin_missing'>` — lança em erro inesperado; `safeReportAccountRecreation(input)` usa `serviceDb`, engole e loga qualquer erro (nunca lança).

- [ ] **Step 1: Teste que falha**

```ts
// kizuna-core/src/server/account/report-recreation.test.ts
import { describe, expect, it, vi } from 'vitest';
import { reportAccountRecreation } from './report-recreation';
import type { ServiceDb } from '../service-db';

type Reply = { status?: number; body?: unknown };

function fakeDb(routes: Record<string, Reply>) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const respond = (key: string) => {
    const r = routes[key] ?? { status: 200, body: [] };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  const table = vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return respond(`${method} ${path.split('?')[0]}${path.includes('is_root') ? '#roots' : ''}`);
  });
  const rpc = vi.fn(async (name: string, body: unknown) => {
    calls.push({ path: name, method: 'RPC', body });
    return new Response(null, { status: 204 });
  });
  return { db: { table, rpc } as unknown as ServiceDb, calls };
}

const input = { login: 'a@b.com', newUserId: 'new' };

describe('reportAccountRecreation', () => {
  it('sem conta excluída com esse login → none, não abre ticket', async () => {
    const { db, calls } = fakeDb({ 'GET /users': { body: [] } });
    expect(await reportAccountRecreation(db, input)).toBe('none');
    expect(calls.some((c) => c.path.startsWith('/tickets'))).toBe(false);
  });

  it('achou → abre ticket account_recreated e avisa cada root', async () => {
    const { db, calls } = fakeDb({
      'GET /users': {
        body: [
          { uid: 'old2', deleted_at: '2026-09-20T00:00:00Z' },
          { uid: 'old1', deleted_at: '2026-01-01T00:00:00Z' },
        ],
      },
      'POST /tickets': { status: 201, body: [{ uid: 'tk1' }] },
      'GET /users#roots': { body: [{ uid: 'r1' }, { uid: 'r2' }] },
    });

    expect(await reportAccountRecreation(db, input)).toBe('reported');

    const ticket = calls.find((c) => c.method === 'POST')!;
    expect(ticket.body).toMatchObject({
      type: 'account_recreated',
      created_by: null,
      subject_user_id: 'new',
      related_user_id: 'old2',
      payload: { login: 'a@b.com', deletedAt: '2026-09-20T00:00:00Z', previousDeletions: 2 },
    });
    const notifies = calls.filter((c) => c.method === 'RPC');
    expect(notifies.map((n) => (n.body as { p_user_id: string }).p_user_id)).toEqual(['r1', 'r2']);
    expect(notifies[0].body).toMatchObject({ p_context_type: 'ticket', p_context_id: 'tk1' });
  });

  it('plugin tickets ausente (404) → plugin_missing, sem avisos', async () => {
    const { db, calls } = fakeDb({
      'GET /users': { body: [{ uid: 'old', deleted_at: '2026-09-20T00:00:00Z' }] },
      'POST /tickets': { status: 404, body: { message: 'not found' } },
    });
    expect(await reportAccountRecreation(db, input)).toBe('plugin_missing');
    expect(calls.some((c) => c.method === 'RPC')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
// kizuna-core/src/server/account/report-recreation.ts
import { serviceDb, type ServiceDb } from '../service-db';

type DeletedAccount = { uid: string; deleted_at: string };

/**
 * Cadastro novo com o login de uma conta excluída (auth.users.deleted_login, sql/0117) → abre um
 * ticket 'account_recreated' (plugin tickets) e avisa cada root via auth.fun_notify.
 */
export async function reportAccountRecreation(
  db: ServiceDb,
  { login, newUserId }: { login: string; newUserId: string }
): Promise<'none' | 'reported' | 'plugin_missing'> {
  const deleted = await getJson<DeletedAccount[]>(
    await db.table(
      `/users?select=uid,deleted_at&deleted_login=eq.${encodeURIComponent(login)}` +
        '&deleted_at=not.is.null&order=deleted_at.desc',
      { schema: 'auth' }
    )
  );
  if (deleted.length === 0) return 'none';

  const [latest] = deleted;
  const ticketRes = await db.table('/tickets?select=uid', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      type: 'account_recreated',
      title: `Conta recriada: ${login}`,
      created_by: null,
      subject_user_id: newUserId,
      related_user_id: latest.uid,
      payload: { login, deletedAt: latest.deleted_at, previousDeletions: deleted.length },
    }),
  });
  if (ticketRes.status === 404) return 'plugin_missing';
  const [ticket] = await getJson<{ uid: string }[]>(ticketRes);

  const roots = await getJson<{ uid: string }[]>(
    await db.table('/users?select=uid&is_root=is.true&is_active=is.true&deleted_at=is.null', {
      schema: 'auth',
    })
  );
  for (const root of roots) {
    await db.rpc(
      'fun_notify',
      {
        p_user_id: root.uid,
        p_type: 'ticket.account_recreated',
        p_title: `Conta recriada: ${login}`,
        p_body: null,
        p_context_type: 'ticket',
        p_context_id: ticket.uid,
      },
      'auth'
    );
  }
  return 'reported';
}

/** Para os handlers de cadastro: nunca lança — o cadastro não depende do alerta. */
export async function safeReportAccountRecreation(input: { login: string; newUserId: string }) {
  try {
    return await reportAccountRecreation(serviceDb, input);
  } catch (error) {
    console.error('[account.recreation] report_failed', { error: String(error) });
    return 'none' as const;
  }
}

async function getJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`PostgREST ${res.status}`);
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (3).

- [ ] **Step 5: Ligar nos cadastros**
  - `auth-handlers.ts` (`createRegisterHandler`), logo depois do `if (!loginRes.ok || !userId || !tenantId) {...}`: `await safeReportAccountRecreation({ login: email, newUserId: userId });`
  - `oauth-handlers.ts`, depois do bloco `if (!rpcRes.ok) {...}`: ler `created` e `user_id`/`user_uid` de `data` e, se `data?.created === true && profile.email`, `await safeReportAccountRecreation({ login: profile.email, newUserId })`.
  - Import: `import { safeReportAccountRecreation } from './account/report-recreation';`
- [ ] **Step 6: Rodar a suíte de auth** — `npx vitest run src/server` → PASS (os testes existentes de cadastro/OAuth continuam verdes; `safeReport...` sem token de serviço cai no catch e retorna `'none'`).
- [ ] **Step 7: Checkpoint.**

---

### Task 8: Recursos `tickets` e `ticket_comments`

**Files:**
- Create: `kizuna-core/src/client/components/screen-engine/resources/tickets.ts`, `tickets.test.ts`
- Modify (starter): `src/lib/server/resources.ts` (import + spread `resourceTickets`)

**Interfaces:**
- Produces: `resourceTickets: Record<string, ResourceConfig>` com chaves `tickets`, `ticket_comments`. Saída (camelCase):
  - ticket: `{ id, uid, type, title, description, status, createdBy, subjectUserId, relatedUserId, payload, createdAt, updatedAt, resolvedAt, isSystem }`
  - comment: `{ id, ticketId, authorId, authorIsStaff, kind, body, createdAt, updatedAt, deletedAt }`
  - Entrada ticket: `title`, `description` (POST); `status` (PATCH) → define `resolved_at` (`now` se `resolved`, senão `null`) e `updated_at`.
  - Entrada comment: `ticketId`, `body`, `kind`, `authorIsStaff` (POST); `body` (PATCH, + `updated_at`); `deleted: true` (PATCH) → `deleted_at`.

- [ ] **Step 1: Teste que falha**

```ts
// kizuna-core/src/client/components/screen-engine/resources/tickets.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resourceTickets } from './tickets';

const NOW = '2026-09-29T12:00:00.000Z';
vi.useFakeTimers().setSystemTime(new Date(NOW));

const tickets = resourceTickets.tickets;
const comments = resourceTickets.ticket_comments;

describe('resourceTickets', () => {
  it('ticket: POST só aceita título e descrição (resto é RLS/default)', () => {
    expect(tickets.mapInput!({ title: ' Ajuda ', description: 'x', status: 'resolved', type: 'account_recreated' }))
      .toEqual({ title: 'Ajuda', description: 'x' });
  });

  it('ticket: PATCH de status carimba resolved_at e updated_at', () => {
    expect(tickets.mapInput!({ status: 'resolved' })).toEqual({ status: 'resolved', resolved_at: NOW, updated_at: NOW });
    expect(tickets.mapInput!({ status: 'open' })).toEqual({ status: 'open', resolved_at: null, updated_at: NOW });
    expect(tickets.mapInput!({ status: 'xyz' })).toEqual({});
  });

  it('ticket: saída marca ticket do sistema', () => {
    expect(tickets.mapOutput!({ id: 1, created_by: null, type: 'account_recreated' })).toMatchObject({ id: '1', isSystem: true });
  });

  it('comentário: apagar é lógico; editar carimba updated_at', () => {
    expect(comments.mapInput!({ deleted: true })).toEqual({ deleted_at: NOW });
    expect(comments.mapInput!({ body: ' oi ' })).toEqual({ body: 'oi', updated_at: NOW });
    expect(comments.mapInput!({ ticketId: '7', body: 'oi', kind: 'status_change', authorIsStaff: true }))
      .toEqual({ ticket_id: 7, body: 'oi', updated_at: NOW, kind: 'status_change', author_is_staff: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
// kizuna-core/src/client/components/screen-engine/resources/tickets.ts
import type { ResourceConfig } from '../types/resource-config';

/**
 * Plugin `tickets` (plugins/tickets/0001_tickets.sql). A RLS decide quem vê/escreve o quê
 * (usuário: os seus; staff `tickets.manage`: todos). Estes configs só traduzem campos.
 * Tickets do sistema são abertos no servidor (service_role), nunca por esta rota.
 */
type RecordValue = Record<string, unknown>;

const STATUSES = ['open', 'in_progress', 'resolved'] as const;
const nowIso = () => new Date().toISOString();
const text = (v: unknown) => String(v ?? '').trim();

const TICKETS: ResourceConfig = {
  schema: 'public',
  table: 'tickets',
  listRequiresAuth: true,
  returnRepresentation: true,
  select:
    'id,uid,type,title,description,status,created_by,subject_user_id,related_user_id,payload,created_at,updated_at,resolved_at',
  primaryKey: 'id',
  defaultOrder: 'created_at',
  searchableColumns: ['title', 'description'],
  mapInput: (input) => {
    const out: RecordValue = {};
    if (input.title !== undefined) out.title = text(input.title);
    if (input.description !== undefined) out.description = text(input.description) || null;
    if (input.status !== undefined) {
      const status = text(input.status);
      if ((STATUSES as readonly string[]).includes(status)) {
        out.status = status;
        out.resolved_at = status === 'resolved' ? nowIso() : null;
        out.updated_at = nowIso();
      }
    }
    return out;
  },
  mapOutput: (r) => ({
    id: String(r.id ?? ''),
    uid: r.uid ?? null,
    type: String(r.type ?? 'support'),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    status: String(r.status ?? 'open'),
    createdBy: r.created_by ?? null,
    subjectUserId: r.subject_user_id ?? null,
    relatedUserId: r.related_user_id ?? null,
    payload: (r.payload as RecordValue) ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? null,
    isSystem: r.created_by == null,
  }),
};

const TICKET_COMMENTS: ResourceConfig = {
  schema: 'public',
  table: 'ticket_comments',
  listRequiresAuth: true,
  returnRepresentation: true,
  select: 'id,ticket_id,author_id,author_is_staff,kind,body,created_at,updated_at,deleted_at',
  primaryKey: 'id',
  defaultOrder: 'created_at',
  searchableColumns: [],
  maxPageSize: 500,
  mapInput: (input) => {
    const out: RecordValue = {};
    if (input.ticketId !== undefined) out.ticket_id = Number(input.ticketId);
    if (input.body !== undefined) {
      out.body = text(input.body);
      out.updated_at = nowIso();
    }
    if (input.kind === 'comment' || input.kind === 'status_change') out.kind = input.kind;
    if (input.authorIsStaff !== undefined) out.author_is_staff = input.authorIsStaff === true;
    if (input.deleted === true) out.deleted_at = nowIso();
    return out;
  },
  mapOutput: (r) => ({
    id: String(r.id ?? ''),
    ticketId: String(r.ticket_id ?? ''),
    authorId: r.author_id ?? null,
    authorIsStaff: r.author_is_staff === true,
    kind: String(r.kind ?? 'comment'),
    body: String(r.body ?? ''),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
  }),
};

export const resourceTickets: Record<string, ResourceConfig> = {
  tickets: TICKETS,
  ticket_comments: TICKET_COMMENTS,
};
```

(Conferir o caminho real de `ResourceConfig` usado por `reviews.ts`: `'../types/resource-config'` — usar o mesmo import.)

Starter `src/lib/server/resources.ts`: `import { resourceTickets } from '@kizuna/core/client/components/screen-engine/resources/tickets';` e `...(resourceTickets as Record<string, ResourceConfig>),`.

- [ ] **Step 4: Rodar e ver passar** → PASS (4).
- [ ] **Step 5: Checkpoint.**

---

### Task 9: Regras de comentário + thread

**Files:**
- Create: `kizuna-core/src/client/components/tickets/types.ts`
- Create: `kizuna-core/src/client/components/tickets/comment-rules.ts`, `comment-rules.test.ts`
- Create: `kizuna-core/src/client/components/tickets/ticket-thread.tsx`, `ticket-thread.test.tsx`

**Interfaces:**
- Produces:
  - `type TicketComment` (= saída do recurso, Task 8), `type Ticket`, `type Viewer = { userId: string; isStaff: boolean }`
  - `canModifyComment(comment: TicketComment, all: TicketComment[], viewer: Viewer): boolean`
  - `visibleComments(all: TicketComment[], viewer: Viewer): TicketComment[]`
  - `<TicketThread ticketId: string; viewer: Viewer />` — carrega `/api/resources/ticket_comments?filter.ticket_id=<id>&orderBy=created_at`, novo comentário (POST), editar (PATCH `{ body }`), apagar (PATCH `{ deleted: true }`), recarrega depois de cada escrita; expõe `reload` via prop opcional `refreshKey: number`.

- [ ] **Step 1: Teste que falha (regras)**

```ts
// kizuna-core/src/client/components/tickets/comment-rules.test.ts
import { describe, expect, it } from 'vitest';
import { canModifyComment, visibleComments } from './comment-rules';
import type { TicketComment } from './types';

const c = (over: Partial<TicketComment>): TicketComment => ({
  id: '1', ticketId: '1', authorId: 'u1', authorIsStaff: false, kind: 'comment', body: 'x',
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z', deletedAt: null, ...over,
});

const user = { userId: 'u1', isStaff: false };
const staff = { userId: 'r1', isStaff: true };

describe('comment rules', () => {
  it('autor pode mexer no próprio enquanto staff não respondeu depois', () => {
    const mine = c({});
    expect(canModifyComment(mine, [mine], user)).toBe(true);
    const reply = c({ id: '2', authorId: 'r1', authorIsStaff: true, createdAt: '2026-09-29T11:00:00Z' });
    expect(canModifyComment(mine, [mine, reply], user)).toBe(false);
  });

  it('não mexe em comentário alheio nem apagado', () => {
    expect(canModifyComment(c({ authorId: 'outro' }), [], user)).toBe(false);
    expect(canModifyComment(c({ deletedAt: '2026-09-29T10:30:00Z' }), [], user)).toBe(false);
  });

  it('staff mexe nos próprios mesmo depois de outra resposta de staff', () => {
    const own = c({ authorId: 'r1', authorIsStaff: true });
    const later = c({ id: '2', authorId: 'r2', authorIsStaff: true, createdAt: '2026-09-29T11:00:00Z' });
    expect(canModifyComment(own, [own, later], staff)).toBe(true);
  });

  it('usuário não vê apagados; staff vê', () => {
    const all = [c({}), c({ id: '2', deletedAt: '2026-09-29T10:30:00Z' })];
    expect(visibleComments(all, user)).toHaveLength(1);
    expect(visibleComments(all, staff)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar tipos e regras**

```ts
// kizuna-core/src/client/components/tickets/types.ts
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export type Ticket = {
  id: string; uid: string; type: string; title: string; description: string;
  status: TicketStatus; createdBy: string | null; subjectUserId: string | null;
  relatedUserId: string | null; payload: Record<string, unknown>;
  createdAt: string; updatedAt: string; resolvedAt: string | null; isSystem: boolean;
};

export type TicketComment = {
  id: string; ticketId: string; authorId: string | null; authorIsStaff: boolean;
  kind: 'comment' | 'status_change' | string; body: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
};

export type Viewer = { userId: string; isStaff: boolean };

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
};
```

```ts
// kizuna-core/src/client/components/tickets/comment-rules.ts
import type { TicketComment, Viewer } from './types';

/**
 * Espelha a RLS de ticket_comments (plugins/tickets/0001_tickets.sql) para a tela só oferecer o
 * que o banco vai aceitar: o autor edita/apaga os próprios, não apagados, enquanto não houver
 * resposta de staff posterior (staff não tem essa trava nos próprios).
 */
export function canModifyComment(
  comment: TicketComment,
  all: TicketComment[],
  viewer: Viewer
): boolean {
  if (comment.authorId !== viewer.userId || comment.deletedAt) return false;
  if (viewer.isStaff) return true;
  const at = Date.parse(comment.createdAt);
  return !all.some((other) => other.authorIsStaff && Date.parse(other.createdAt) > at);
}

export function visibleComments(all: TicketComment[], viewer: Viewer): TicketComment[] {
  return viewer.isStaff ? all : all.filter((c) => !c.deletedAt);
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (4).

- [ ] **Step 5: Teste que falha (thread)**

```tsx
// kizuna-core/src/client/components/tickets/ticket-thread.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TicketThread } from './ticket-thread';

const items = [
  { id: '1', ticketId: '9', authorId: 'u1', authorIsStaff: false, kind: 'comment', body: 'Meu texto',
    createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z', deletedAt: null },
  { id: '2', ticketId: '9', authorId: 'u1', authorIsStaff: false, kind: 'comment', body: 'Apagado',
    createdAt: '2026-09-29T10:05:00Z', updatedAt: '2026-09-29T10:05:00Z', deletedAt: '2026-09-29T10:06:00Z' },
];

function stub() {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    new Response(JSON.stringify(init?.method ? {} : { items }), { status: 200 })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TicketThread', () => {
  it('usuário: esconde apagados e pode apagar o próprio (PATCH deleted)', async () => {
    const fetchMock = stub();
    render(<TicketThread ticketId="9" viewer={{ userId: 'u1', isStaff: false }} />);
    expect(await screen.findByText('Meu texto')).toBeTruthy();
    expect(screen.queryByText('Apagado')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/resources/ticket_comments/1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ deleted: true }) })
      )
    );
  });

  it('staff: vê o apagado marcado como excluído', async () => {
    stub();
    render(<TicketThread ticketId="9" viewer={{ userId: 'r1', isStaff: true }} />);
    expect(await screen.findByText('Comentário excluído')).toBeTruthy();
  });

  it('envia comentário novo como staff quando o viewer é staff', async () => {
    const fetchMock = stub();
    render(<TicketThread ticketId="9" viewer={{ userId: 'r1', isStaff: true }} />);
    await screen.findByText('Meu texto');
    fireEvent.change(screen.getByPlaceholderText('Escreva um comentário...'), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/resources/ticket_comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ticketId: '9', body: 'Oi', kind: 'comment', authorIsStaff: true }),
        })
      )
    );
  });
});
```

- [ ] **Step 6: Rodar e ver falhar** → FAIL.

- [ ] **Step 7: Implementar `ticket-thread.tsx`**

```tsx
// kizuna-core/src/client/components/tickets/ticket-thread.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { canModifyComment, visibleComments } from './comment-rules';
import type { TicketComment, Viewer } from './types';

const BASE = '/api/resources/ticket_comments';

type Props = { ticketId: string; viewer: Viewer; refreshKey?: number };

export function TicketThread({ ticketId, viewer, refreshKey = 0 }: Props) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ 'filter.ticket_id': ticketId, orderBy: 'created_at', pageSize: '500' });
    const res = await fetch(`${BASE}?${qs}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setComments(Array.isArray(data.items) ? data.items : []);
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function write(url: string, method: 'POST' | 'PATCH', body: unknown) {
    setError('');
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError('Não foi possível salvar. Atualize a página e tente de novo.');
    await load();
    return res.ok;
  }

  async function submitNew() {
    const body = draft.trim();
    if (!body) return;
    const ok = await write(BASE, 'POST', { ticketId, body, kind: 'comment', authorIsStaff: viewer.isStaff });
    if (ok) setDraft('');
  }

  const list = visibleComments(comments, viewer);

  return (
    <section className="space-y-4">
      <ul className="space-y-3">
        {list.map((comment) => {
          const editable = canModifyComment(comment, comments, viewer);
          const isEditing = editing?.id === comment.id;
          return (
            <li key={comment.id} className="rounded-xl border border-border bg-card p-4">
              <p className="mb-1 text-xs text-muted-foreground">
                {comment.authorIsStaff ? 'Equipe' : comment.authorId === viewer.userId ? 'Você' : 'Usuário'}
                {' · '}
                {new Date(comment.createdAt).toLocaleString('pt-BR')}
                {comment.updatedAt !== comment.createdAt && !comment.deletedAt ? ' · editado' : ''}
              </p>
              {comment.deletedAt ? (
                <p className="text-sm italic text-muted-foreground">
                  Comentário excluído
                  <span className="mt-1 block not-italic line-through">{comment.body}</span>
                </p>
              ) : isEditing ? (
                <div className="space-y-2">
                  <Textarea value={editing.body} onChange={(e) => setEditing({ id: comment.id, body: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => (await write(`${BASE}/${comment.id}`, 'PATCH', { body: editing.body })) && setEditing(null)}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <p className={comment.kind === 'status_change' ? 'text-sm italic' : 'whitespace-pre-wrap text-sm'}>
                  {comment.body}
                </p>
              )}
              {editable && !isEditing ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: comment.id, body: comment.body })}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => write(`${BASE}/${comment.id}`, 'PATCH', { deleted: true })}>Apagar</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="space-y-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva um comentário..." />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={submitNew} disabled={!draft.trim()}>Comentar</Button>
      </div>
    </section>
  );
}
```

(Conferir que `Button` aceita `size="sm"`/`variant="ghost"` e o caminho de `Textarea` em `src/client/components/ui/`; ajustar para os nomes reais se diferirem.)

- [ ] **Step 8: Rodar e ver passar** → PASS (3). Formatar com Prettier.
- [ ] **Step 9: Checkpoint.**

---

### Task 10: Telas de chamados (lista, novo, detalhe) + menu + contador

**Files:**
- Create: `kizuna-core/src/client/components/screen-engine/screens/chamados.ts`
- Create: `kizuna-core/src/client/components/tickets/ticket-create-form.tsx`, `ticket-create-form.test.tsx`
- Create: `kizuna-core/src/client/components/tickets/ticket-detail.tsx`
- Create: `kizuna-core/src/client/components/tickets/open-tickets-badge.tsx`, `open-tickets-badge.test.tsx`
- Create: `kizuna-core/plugins/tickets/shell/manifest.json` e páginas `src/app/painel/chamados/page.tsx`, `novo/page.tsx`, `[id]/page.tsx` (copiar para o starter)
- Modify (starter): `src/components/panel-shell.tsx` (item "Chamados" + `renderItemBadge`)

**Interfaces:**
- Consumes: `resourceTickets` (Task 8), `TicketThread`, `Viewer`, `TICKET_STATUS_LABEL` (Task 9).
- Produces:
  - `CHAMADOS_SCREEN: ScreenConfig`
  - `<TicketCreateForm />` → POST `/api/resources/tickets` `{ title, description }`, redireciona para `/painel/chamados/<id>`
  - `<TicketDetail ticketId: string; viewer: Viewer />` → GET `/api/resources/tickets/<id>`; staff: `<select>` de status → PATCH `{ status }` e POST comentário `{ ticketId, kind: 'status_change', authorIsStaff: true, body: 'Status: <de> → <para>' }`, depois incrementa `refreshKey` da thread.
  - `<OpenTicketsBadge />` → GET `/api/resources/tickets?filter.status=open&pageSize=1`, mostra `total` (> 0) num `<span>`.
  - Helper de servidor (nas páginas): `viewerFromSession(session): Viewer` = `{ userId: session.user_id, isStaff: Boolean(session.is_root || session.perms?.tickets?.manage) }` — definir em `kizuna-core/src/client/components/tickets/viewer.ts` (puro, sem `'use client'`).

- [ ] **Step 1: Testes que falham** (form e badge)

```tsx
// kizuna-core/src/client/components/tickets/ticket-create-form.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { TicketCreateForm } from './ticket-create-form';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TicketCreateForm', () => {
  it('cria o chamado e abre o detalhe', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ item: { id: '42' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TicketCreateForm />);
    fireEvent.change(screen.getByLabelText('Assunto'), { target: { value: 'Não consigo publicar' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Detalhes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/chamados/42'));
    expect(fetchMock).toHaveBeenCalledWith('/api/resources/tickets', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ title: 'Não consigo publicar', description: 'Detalhes' }),
    }));
  });
});
```

```tsx
// kizuna-core/src/client/components/tickets/open-tickets-badge.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OpenTicketsBadge } from './open-tickets-badge';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OpenTicketsBadge', () => {
  it('mostra o total de abertos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 3 }))));
    render(<OpenTicketsBadge />);
    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('não mostra nada com zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }))));
    const { container } = render(<OpenTicketsBadge />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });
});
```

(Antes de escrever: conferir em `postgrest-crud.ts` o nome exato do campo de total no JSON da lista — `total` — e o formato do POST (`{ item }` ou objeto direto) em `createResource`; ajustar os testes e componentes ao formato real.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

```tsx
// kizuna-core/src/client/components/tickets/ticket-create-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

export function TicketCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/resources/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: description.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    const id = data?.item?.id ?? data?.id;
    if (!res.ok || !id) return setError('Não foi possível abrir o chamado. Confira o assunto (3 a 160 caracteres).');
    router.push(`/painel/chamados/${id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium">
        <span>Assunto</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        <span>Descrição</span>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={saving || title.trim().length < 3}>Abrir chamado</Button>
    </form>
  );
}
```

```tsx
// kizuna-core/src/client/components/tickets/open-tickets-badge.tsx
'use client';

import { useEffect, useState } from 'react';

/** Contador de chamados abertos visíveis para quem está logado (staff: todos; usuário: os seus). */
export function OpenTicketsBadge() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    fetch('/api/resources/tickets?filter.status=open&pageSize=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { total: 0 }))
      .then((d) => setTotal(Number(d.total) || 0))
      .catch(() => setTotal(0));
  }, []);
  if (total <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
      {total}
    </span>
  );
}
```

```ts
// kizuna-core/src/client/components/tickets/viewer.ts
import type { SessionPayload } from '../../../server/auth';
import type { Viewer } from './types';

export function viewerFromSession(session: SessionPayload): Viewer {
  const perms = session.perms as Record<string, Record<string, boolean>> | undefined;
  return { userId: session.user_id, isStaff: Boolean(session.is_root || perms?.tickets?.manage) };
}
```

(`SessionPayload` é só tipo — `import type` não puxa `next/headers` para o cliente.)

```tsx
// kizuna-core/src/client/components/tickets/ticket-detail.tsx
'use client';

import { useEffect, useState } from 'react';
import { TicketThread } from './ticket-thread';
import { TICKET_STATUS_LABEL, type Ticket, type TicketStatus, type Viewer } from './types';

export function TicketDetail({ ticketId, viewer }: { ticketId: string; viewer: Viewer }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/resources/tickets/${ticketId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTicket((d.item ?? d) as Ticket))
      .catch(() => setError('Chamado não encontrado.'));
  }, [ticketId]);

  async function changeStatus(next: TicketStatus) {
    if (!ticket || next === ticket.status) return;
    const res = await fetch(`/api/resources/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) return setError('Não foi possível mudar o status.');
    await fetch('/api/resources/ticket_comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId,
        kind: 'status_change',
        authorIsStaff: true,
        body: `Status: ${TICKET_STATUS_LABEL[ticket.status]} → ${TICKET_STATUS_LABEL[next]}`,
      }),
    });
    setTicket({ ...ticket, status: next });
    setRefreshKey((k) => k + 1);
  }

  if (error && !ticket) return <p className="text-sm text-destructive">{error}</p>;
  if (!ticket) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">{ticket.title}</h1>
        <p className="text-sm text-muted-foreground">
          {ticket.isSystem ? 'Aberto pelo sistema' : 'Aberto por você'} ·{' '}
          {new Date(ticket.createdAt).toLocaleString('pt-BR')}
        </p>
        {viewer.isStaff ? (
          <select
            aria-label="Status"
            value={ticket.status}
            onChange={(e) => changeStatus(e.target.value as TicketStatus)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium">{TICKET_STATUS_LABEL[ticket.status]}</span>
        )}
        {ticket.description ? <p className="whitespace-pre-wrap text-sm">{ticket.description}</p> : null}
        {viewer.isStaff && ticket.type === 'account_recreated' ? (
          <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            <dt>Login</dt><dd>{String(ticket.payload.login ?? '')}</dd>
            <dt>Conta nova</dt><dd>{ticket.subjectUserId}</dd>
            <dt>Conta anterior</dt><dd>{ticket.relatedUserId}</dd>
            <dt>Excluída em</dt><dd>{String(ticket.payload.deletedAt ?? '')}</dd>
            <dt>Exclusões anteriores</dt><dd>{String(ticket.payload.previousDeletions ?? '')}</dd>
          </dl>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </header>
      <TicketThread ticketId={ticketId} viewer={viewer} refreshKey={refreshKey} />
    </div>
  );
}
```

```ts
// kizuna-core/src/client/components/screen-engine/screens/chamados.ts
import type { ListBlockConfig } from '../../list-block';
import type { ScreenConfig } from '../../../../types/screen';

/** Lista de chamados — a RLS de `tickets` decide o escopo (usuário: os seus; staff: todos). */
const listConfig: ListBlockConfig = {
  resource: 'tickets',
  title: 'Chamados',
  pageSize: 10,
  action: { label: 'Abrir', hrefBase: '/painel/chamados', icon: 'eye' },
  statusFilter: {},
  emptyState: {
    message: 'Nenhum chamado',
    description: 'Precisa de ajuda? Abra um chamado e a equipe responde por aqui.',
    ctaHref: '/painel/chamados/novo',
    ctaLabel: 'Abrir chamado',
  },
  displayConfig: {
    icon: 'LifeBuoy',
    singularName: 'Chamado',
    notFoundMessage: 'Nenhum chamado encontrado',
    fields: {
      status: {
        label: 'Status',
        format: {
          type: 'enum',
          labels: { open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido' },
          tones: { open: 'warning', in_progress: 'info', resolved: 'success' },
        },
      },
      type: {
        label: 'Tipo',
        format: { type: 'enum', labels: { support: 'Suporte', account_recreated: 'Conta recriada' } },
      },
    },
    badgeFields: ['status'],
    visibleFields: ['type'],
  },
};

export const CHAMADOS_SCREEN: ScreenConfig = {
  id: 'chamados',
  maxWidth: 'narrow',
  blocks: [
    {
      component: 'page-header',
      props: {
        title: 'Chamados',
        description: 'Acompanhe seus pedidos de ajuda.',
        backHref: '/painel',
        backLabel: 'Painel',
        createAction: { href: '/painel/chamados/novo', label: 'Novo chamado' },
      },
    },
    { component: 'list', props: { config: listConfig } },
  ],
};
```

(Antes de escrever: conferir em `list-block.tsx` as chaves aceitas de `ListBlockConfig` — `icon` válido em `ICON_MAP` (usar um que exista, ex.: `'eye'`/`'LifeBuoy'`), e se `createAction` sem `gateUserId` é permitido em `page-header`; remover o que não existir em vez de inventar.)

Páginas do shell (espelham `meus-servicos/page.tsx`):

```tsx
// plugins/tickets/shell/src/app/painel/chamados/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { RenderScreen } from '@kizuna/core/client/components/screen-engine/render-screen';
import { CHAMADOS_SCREEN } from '@kizuna/core/client/components/screen-engine/screens/chamados';

export default async function ChamadosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <RenderScreen
      config={CHAMADOS_SCREEN}
      context={{ params: {}, searchParams: {}, session: { tenantId: session.tenant_id, userId: session.user_id } }}
    />
  );
}
```

```tsx
// plugins/tickets/shell/src/app/painel/chamados/novo/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { TicketCreateForm } from '@kizuna/core/client/components/tickets/ticket-create-form';

export default async function NovoChamadoPage() {
  if (!(await getSession())) redirect('/login');
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-bold">Novo chamado</h1>
      <TicketCreateForm />
    </div>
  );
}
```

```tsx
// plugins/tickets/shell/src/app/painel/chamados/[id]/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { TicketDetail } from '@kizuna/core/client/components/tickets/ticket-detail';
import { viewerFromSession } from '@kizuna/core/client/components/tickets/viewer';

export default async function ChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;
  return (
    <div className="mx-auto max-w-2xl p-4">
      <TicketDetail ticketId={id} viewer={viewerFromSession(session)} />
    </div>
  );
}
```

```json
// plugins/tickets/shell/manifest.json
{
  "owner": "tickets",
  "files": {
    "src/app/painel/chamados/page.tsx": "managed",
    "src/app/painel/chamados/novo/page.tsx": "managed",
    "src/app/painel/chamados/[id]/page.tsx": "managed"
  }
}
```

Starter `src/components/panel-shell.tsx`: no grupo "Meu conteúdo", item `{ title: 'Chamados', href: '/painel/chamados', icon: LifeBuoy, permResource: 'default' }` (importar `LifeBuoy` de `lucide-react`); em `<PanelShellBase ...>` passar `renderItemBadge={(item, collapsed) => item.href === '/painel/chamados' && !collapsed ? <OpenTicketsBadge /> : null}` (import de `@kizuna/core/client/components/tickets/open-tickets-badge`). Copiar as 3 páginas do shell para `src/app/painel/chamados/` do starter.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/client/components/tickets` → PASS; `npx tsc --noEmit -p tsconfig.json` (raiz) limpo fora de `.next/types`.
- [ ] **Step 5: Checkpoint.**

---

### Task 11: "Excluir minha conta" em Minha conta

**Files:**
- Create: `kizuna-core/src/client/components/account/delete-account-section.tsx`, `delete-account-section.test.tsx`
- Modify: `kizuna-core/src/client/components/screen-engine/registry.ts` (`'delete-account': { component: DeleteAccountSection, serverSafe: false }`)
- Modify: `kizuna-core/src/client/components/screen-engine/screens/minha-conta.ts` (bloco `{ component: 'delete-account', props: {} }` depois de `account-form`)

**Interfaces:**
- Consumes: `POST /api/account/delete` (Task 4) e seus códigos de erro.
- Produces: `<DeleteAccountSection />`; props opcionais `onDeleted?: () => void` (padrão: `window.location.assign('/')`).

- [ ] **Step 1: Teste que falha**

```tsx
// kizuna-core/src/client/components/account/delete-account-section.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeleteAccountSection } from './delete-account-section';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function confirmWith(email: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
  fireEvent.change(screen.getByLabelText('Digite seu e-mail para confirmar'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
}

describe('DeleteAccountSection', () => {
  it('sucesso → chama onDeleted', async () => {
    const fetchMock = stub(200, { ok: true });
    const onDeleted = vi.fn();
    render(<DeleteAccountSection onDeleted={onDeleted} />);
    await confirmWith('a@b.com');
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/account/delete', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'a@b.com' }),
    }));
  });

  it('login antigo → pede para entrar de novo com link de login', async () => {
    stub(401, { code: 'reauth_required' });
    render(<DeleteAccountSection onDeleted={vi.fn()} />);
    await confirmWith('a@b.com');
    expect(await screen.findByRole('link', { name: 'Entrar novamente' })).toBeTruthy();
  });

  it('e-mail errado → mensagem', async () => {
    stub(400, { code: 'email_mismatch' });
    render(<DeleteAccountSection onDeleted={vi.fn()} />);
    await confirmWith('x@y.com');
    expect(await screen.findByText('O e-mail não confere com o da sua conta.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar**

```tsx
// kizuna-core/src/client/components/account/delete-account-section.tsx
'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const MESSAGES: Record<string, string> = {
  email_mismatch: 'O e-mail não confere com o da sua conta.',
  root_forbidden: 'A conta root não pode ser excluída por aqui.',
  service_unavailable: 'Exclusão de conta indisponível no momento.',
};

type Props = { onDeleted?: () => void };

/**
 * Zona de perigo de Minha conta. Confirma digitando o e-mail; exige login recente (a rota
 * responde `reauth_required` e aqui oferecemos entrar de novo). Ver POST /api/account/delete.
 */
export function DeleteAccountSection({ onDeleted = () => window.location.assign('/') }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setCode(null);
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return onDeleted();
    setCode(String(data.code ?? 'delete_failed'));
  }

  return (
    <section className="mt-10 space-y-3 rounded-xl border border-destructive/40 p-4">
      <h2 className="text-base font-semibold text-destructive">Excluir conta</h2>
      <p className="text-sm text-muted-foreground">
        Seus anúncios saem do ar e você perde o acesso. Depois você pode criar uma conta nova com o
        mesmo e-mail, que começa do zero.
      </p>
      {!open ? (
        <Button variant="destructive" onClick={() => setOpen(true)}>Excluir minha conta</Button>
      ) : (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm font-medium">
            <span>Digite seu e-mail para confirmar</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {code === 'reauth_required' ? (
            <p className="text-sm text-destructive">
              Por segurança, entre de novo antes de excluir.{' '}
              <a className="underline" href="/login?returnTo=/painel/minha-conta">Entrar novamente</a>
            </p>
          ) : code ? (
            <p className="text-sm text-destructive">{MESSAGES[code] ?? 'Não foi possível excluir a conta.'}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="destructive" disabled={busy || !email.trim()} onClick={confirm}>Excluir definitivamente</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </section>
  );
}
```

(Conferir o nome do parâmetro de retorno do login — `returnTo` ou `r` — em `src/app/login`/`sanitizeReturnTo` e usar o real; conferir se `Button` tem `variant="destructive"`.)

- [ ] **Step 4: Rodar e ver passar** → PASS (3).
- [ ] **Step 5: Checkpoint.**

---

### Task 12: Docs, fiação final e verificação ponta a ponta

**Files:**
- Create: `kizuna-core/docs/plugins/tickets.md`; Modify: `kizuna-core/docs/SUMMARY.md`, `kizuna-core/docs/plugins/README.md` (linha na tabela), `kizuna-core/plugins/README.md`
- Modify: `kizuna-core/docs/arquitetura/auth.md` (seções "Token de serviço", "Excluir conta", "Revogação de sessão")
- Modify: `kizuna-core/docs/comecando/configuracao.md` ou `README` de env: `POSTGREST_SERVICE_TOKEN`
- Modify (starter + template): `.env.example` → `# Token do service_role (node kizuna-core/cli token service). SÓ servidor.` + `POSTGREST_SERVICE_TOKEN=`
- Modify: `kizuna-core/STATUS.md` (plugin novo)

- [ ] **Step 1: Escrever as docs** seguindo a skill `documentacao` (frontmatter `description`, links relativos, entrada no `SUMMARY.md`). `tickets.md`: tabelas, tabela de RLS por papel (copiar da spec), regra de edição/apagamento, tickets do sistema, recursos, telas, `tickets.manage`.
- [ ] **Step 2: Verificação de links** — rodar o script da skill `documentacao` em `kizuna-core` → `ok`.
- [ ] **Step 3: Suíte completa** — `cd kizuna-core && npx vitest run src/server src/client/components/tickets src/client/components/account src/client/components/screen-engine/resources cli/commands/token.test.mjs` → PASS; `npx tsc --noEmit -p tsconfig.json` (raiz) → só `.next/types`.
- [ ] **Step 4: Ponta a ponta no navegador** (depois de o usuário aplicar o SQL e configurar `POSTGREST_SERVICE_TOKEN`; reiniciar o dev server porque rotas foram adicionadas):
  1. Usuário comum entra, abre `/painel/chamados/novo`, cria chamado, comenta, edita, apaga o próprio.
  2. Root abre o chamado, vê o comentário apagado marcado, responde; volta ao usuário: o comentário anterior não tem mais Editar/Apagar.
  3. Usuário exclui a conta em Minha conta → cai na home deslogado; em outra aba já logada, em até 60 s a sessão cai.
  4. Cadastra de novo com o mesmo e-mail → root vê contador no item "Chamados" e o ticket "Conta recriada" com login, contas e data.
- [ ] **Step 5: Checkpoint final** — resumo ao usuário; commit só se ele pedir.

---

## Self-review (feito)

- Cobertura da spec: 1a→T1/T6 (GRANTs de plugins), 1b→T1, 1c→T6/T8, 2a→T4/T11, 2b→T5, 2c→T7, Parte 3→T9/T10/T11, docs/env→T12. Sem lacunas.
- Nomes consistentes: `ServiceDb`, `serviceDb`, `serviceTable`, `serviceRpc`, `ServiceUnavailableError`, `deleteAccount`, `createDeleteAccountHandler`, `createSessionRevocationChecker`, `fetchUserStatusViaService`, `reportAccountRecreation`, `safeReportAccountRecreation`, `resourceTickets`, `TicketThread`, `TicketDetail`, `TicketCreateForm`, `OpenTicketsBadge`, `viewerFromSession`, `canModifyComment`, `visibleComments`, `DeleteAccountSection`, `CHAMADOS_SCREEN`.
- Pontos a conferir no código real antes de escrever (marcados nos passos, não são placeholders de comportamento): formato do JSON de `createResource`/`listResource` (`item`/`total`), chaves de `ListBlockConfig`/ícones, variantes de `Button`, parâmetro de retorno do login.
