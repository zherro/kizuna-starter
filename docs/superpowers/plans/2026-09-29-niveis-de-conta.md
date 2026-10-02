# Níveis de conta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escada de 5 níveis (com "Anunciante" ganho ao publicar), card de nível no painel e uma barreira de nível padronizada (`RequireLevel`) usada no "novo anúncio".

**Architecture:** Regras continuam em `kizuna-core/src/shared/account-levels` (puro, testado com vitest). O servidor (`kizuna-core/src/server/account-levels.ts`) lê fatos do banco — agora também contagem de anúncios via RPC do plugin services. UI nova no core (`AccountLevelCard`, `LevelBlockedScreen`, `RequireLevel`); o starter só liga config, rótulos e páginas.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind, PostgREST + Postgres, vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-niveis-de-conta-design.md`

## Global Constraints

- Níveis sequenciais: nível N exige 1..N cumpridos (não mudar `computeAccountStatus`).
- Fecha por padrão: qualquer erro lendo fatos/contagens → trata como não cumprido.
- `auth` do core não depende de tabela de plugin; a contagem de anúncios vem de RPC do plugin services e só é consultada se algum nível habilitado usa `listing_published`.
- Textos de UI em pt-BR sem acento nos rótulos de regra (`missing`), igual ao código atual (ex.: "Anuncio em analise").
- Tailwind varre `.md`: não inventar classes inválidas em docs.
- **Não commitar.** O usuário commita (core + starter) só quando pedir. Os passos "Checkpoint" abaixo são só pausa para revisão.
- Paths: core = `kizuna-core/` (submódulo; o starter importa `@kizuna/core/*` → `kizuna-core/src/*`).
- Testes do core: `cd kizuna-core && npx vitest run <arquivo>`. Tipos do starter: `npx tsc --noEmit -p .` na raiz.

---

### Task 1: Regras — contato com email E celular, requisito `listing_published`, `unlocksByLevel`

**Files:**
- Modify: `kizuna-core/src/shared/account-levels/index.ts`
- Test: `kizuna-core/src/shared/account-levels/account-levels.test.ts`

**Interfaces:**
- Produces:
  - `REQUIREMENT_IDS` inclui `'listing_published'`
  - `AccountFacts.listings: { published: number; pending: number }`
  - `export const NO_LISTINGS = { published: 0, pending: 0 }`
  - `export function unlocksByLevel(capabilities: Record<string, string>, labels?: Record<string, string>): Record<string, string[]>`

- [ ] **Step 1: Ajustar o helper `facts()` e os testes existentes à nova regra de contato**

Em `account-levels.test.ts`, no helper `facts()` adicione `listings: { published: 0, pending: 0 },` antes de `...patch`.

Substitua o teste `'email OU telefone verificado = 2'` (linha ~105) por:

```ts
  it('contato exige email E celular', () => {
    const soEmail = computeAccountStatus(config, facts({ emailVerified: true }));
    expect(soEmail.level).toBe(1);
    expect(soEmail.levels[1]!.missing).toEqual(['Verificar celular']);

    const soCelular = computeAccountStatus(config, facts({ phoneVerified: true }));
    expect(soCelular.level).toBe(1);
    expect(soCelular.levels[1]!.missing).toEqual(['Verificar email']);

    const nenhum = computeAccountStatus(config, facts());
    expect(nenhum.levels[1]!.missing).toEqual(['Verificar email', 'Verificar celular']);

    expect(
      computeAccountStatus(config, facts({ emailVerified: true, phoneVerified: true })).level
    ).toBe(2);
  });
```

Nos testes que usam `emailVerified: true` esperando passar do nível 2 (linhas ~119, ~129, ~143, ~167), troque para `emailVerified: true, phoneVerified: true`.

- [ ] **Step 2: Adicionar testes novos**

No fim do arquivo:

```ts
describe('listing_published', () => {
  const cfg5 = parseAccountLevelsConfig({
    levels: [
      { key: 'conta', level: 1, title: 'Conta', requirement: 'authenticated' },
      { key: 'contato', level: 2, title: 'Contato', requirement: 'contact_verified' },
      { key: 'perfil', level: 3, title: 'Perfil', requirement: 'profile_complete' },
      { key: 'anunciante', level: 4, title: 'Anunciante', requirement: 'listing_published' },
      {
        key: 'identidade',
        level: 5,
        title: 'Identidade',
        requirement: 'identity_verified',
        enabled: false,
      },
    ],
  });
  const pronto = { emailVerified: true, phoneVerified: true, profile: fullProfile };

  it('sem anúncio: falta publicar', () => {
    const s = computeAccountStatus(cfg5, facts(pronto));
    expect(s.level).toBe(3);
    expect(s.next?.key).toBe('anunciante');
    expect(s.next?.missing).toEqual(['Publicar seu primeiro anuncio']);
  });

  it('só pendente: em análise', () => {
    const s = computeAccountStatus(
      cfg5,
      facts({ ...pronto, listings: { published: 0, pending: 1 } })
    );
    expect(s.level).toBe(3);
    expect(s.next?.missing).toEqual(['Anuncio em analise']);
  });

  it('publicado: nível 4, e o 5 desligado nunca é alcançado', () => {
    const s = computeAccountStatus(
      cfg5,
      facts({ ...pronto, listings: { published: 1, pending: 0 } })
    );
    expect(s.level).toBe(4);
    expect(s.levelKey).toBe('anunciante');
    expect(s.next).toBeNull();
  });

  it('canDo service.create no nível 2 lista só o perfil como pendente', () => {
    const caps5 = defineCapabilities(cfg5, { 'service.create': 'perfil' });
    const s = computeAccountStatus(cfg5, facts({ emailVerified: true, phoneVerified: true }));
    const r = canDo(s, caps5, 'service.create');
    expect(r.allowed).toBe(false);
    expect(r.pending.map((l) => l.key)).toEqual(['perfil']);
  });
});

describe('unlocksByLevel', () => {
  it('agrupa rótulos por nível, ignora ação sem rótulo e não repete', () => {
    const out = unlocksByLevel(
      { like: 'conta', save: 'conta', review: 'contato', 'service.create': 'perfil', x: 'perfil' },
      { like: 'Curtir', save: 'Curtir', review: 'Avaliar', 'service.create': 'Publicar anuncios' }
    );
    expect(out).toEqual({
      conta: ['Curtir'],
      contato: ['Avaliar'],
      perfil: ['Publicar anuncios'],
    });
  });
});
```

E adicione `unlocksByLevel` ao import do topo do arquivo.

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd kizuna-core && npx vitest run src/shared/account-levels/account-levels.test.ts`
Expected: FAIL (`unlocksByLevel` não existe; `listing_published` desconhecido; contato ainda aceita OU).

- [ ] **Step 4: Implementar em `index.ts`**

Troque `REQUIREMENT_IDS`:

```ts
export const REQUIREMENT_IDS = [
  'authenticated',
  'contact_verified',
  'profile_complete',
  'listing_published',
  'identity_verified',
] as const;
```

Em `AccountFacts`, depois de `documentRequired: boolean;`:

```ts
  /** Anúncios do usuário (plugin services). Sem o plugin: zeros. */
  listings: { published: number; pending: number };
```

Logo abaixo do tipo `AccountFacts`:

```ts
export const NO_LISTINGS: AccountFacts['listings'] = { published: 0, pending: 0 };
```

Em `REQUIREMENTS`, substitua `contact_verified` e adicione `listing_published` antes de `identity_verified`:

```ts
  contact_verified: (f) => {
    const missing: string[] = [];
    if (!f.emailVerified) missing.push('Verificar email');
    if (!f.phoneVerified) missing.push('Verificar celular');
    return missing;
  },
```

```ts
  listing_published: (f) => {
    if (f.listings.published > 0) return [];
    return f.listings.pending > 0 ? ['Anuncio em analise'] : ['Publicar seu primeiro anuncio'];
  },
```

Depois de `defineCapabilities`:

```ts
/** Rótulos das ações agrupados pelo nível que as libera — "o que você libera" no card. */
export function unlocksByLevel(
  capabilities: Record<string, string>,
  labels: Record<string, string> = {}
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [action, levelKey] of Object.entries(capabilities)) {
    const label = labels[action];
    if (!label) continue;
    const list = (out[levelKey] ??= []);
    if (!list.includes(label)) list.push(label);
  }
  return out;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd kizuna-core && npx vitest run src/shared/account-levels/account-levels.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Checkpoint** — não commitar; seguir.

---

### Task 2: Fatos do servidor — contagem de anúncios, `labels`, `unlocks` + config

**Files:**
- Create: `kizuna-core/plugins/services/0006_services_account_facts.sql`
- Modify: `kizuna-core/src/server/account-levels.ts`
- Modify: `kizuna.config.json` (starter) e `kizuna-core/starter/kizuna.config.json`
- Modify: `src/lib/account-levels.ts`, `src/lib/server/account-levels.ts`

**Interfaces:**
- Consumes: `NO_LISTINGS`, `unlocksByLevel`, `AccountFacts.listings` (Task 1)
- Produces:
  - `AccountLevelsSetup.labels?: Record<string, string>`
  - `getAccountFacts(documentRequired?: boolean, withListings?: boolean): Promise<AccountFacts>`
  - `export function usesListings(config: AccountLevelsConfig): boolean`
  - resposta de `GET /api/account/level`: `{ status, allowed, unlocks, can? }`
  - starter: `ACTION_LABELS` exportado de `src/lib/account-levels.ts`

- [ ] **Step 1: Migração do plugin services**

`kizuna-core/plugins/services/0006_services_account_facts.sql`:

```sql
-- 0006_services_account_facts.sql
-- Contagem de anúncios do usuário logado, para o nível de conta "Anunciante"
-- (requisito listing_published em src/shared/account-levels). Publicado = active ou paused
-- (passou pela aprovação); pendente = pending. SECURITY INVOKER: a RLS de services já limita
-- ao dono. Aditivo + idempotente.

CREATE OR REPLACE FUNCTION public.fun_services__my_listing_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'published', count(*) FILTER (WHERE s.status IN ('active', 'paused')),
    'pending',   count(*) FILTER (WHERE s.status = 'pending')
  )
  FROM public.services s
  WHERE s.active AND s.created_by = auth.fun_auth_user_id();
$$;

REVOKE ALL ON FUNCTION public.fun_services__my_listing_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_services__my_listing_counts() TO auth_user;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no banco local**

Run (raiz do starter): `node kizuna-core/cli update --no-pull`
Expected: aplica `services/0006` (e as demais pendentes que o `predev` já apontava); `kizuna.lock` atualizado.
Conferir: `curl -s -X POST http://127.0.0.1:3000/rpc/fun_services__my_listing_counts` sem auth → erro de permissão (não 404).

- [ ] **Step 3: Servidor — `kizuna-core/src/server/account-levels.ts`**

Imports: adicione `NO_LISTINGS`, `unlocksByLevel` e `type AccountLevelsConfig` (já importado) ao import de `'../shared/account-levels'`.

No tipo `AccountLevelsSetup`, depois de `documentRequired?`:

```ts
  /** Ação → rótulo humano ("Publicar anuncios"). Usado no card e na tela de bloqueio. */
  labels?: Record<string, string>;
```

Em `ANONYMOUS`, adicione `listings: NO_LISTINGS,`.

Acima de `getAccountFacts`:

```ts
export function usesListings(config: AccountLevelsConfig): boolean {
  return config.levels.some((l) => l.enabled !== false && l.requirement === 'listing_published');
}

async function getListingCounts(auth: string): Promise<AccountFacts['listings']> {
  try {
    const res = await pgrstRpc('fun_services__my_listing_counts', {}, { auth });
    if (!res.ok) {
      console.warn('[account-levels] listings_failed', { status: res.status });
      return NO_LISTINGS;
    }
    const d = (await res.json().catch(() => null)) as { published?: unknown; pending?: unknown } | null;
    return { published: Number(d?.published) || 0, pending: Number(d?.pending) || 0 };
  } catch {
    return NO_LISTINGS;
  }
}
```

Assinatura: `export async function getAccountFacts(documentRequired = true, withListings = false)`.
No retorno autenticado, antes do `return {`: `const listings = withListings ? await getListingCounts(auth) : NO_LISTINGS;` e inclua `listings,` no objeto (depois de `documentRequired,`).

`getAccountStatus`:

```ts
export async function getAccountStatus(setup: AccountLevelsSetup): Promise<AccountStatus> {
  const documentRequired = setup.documentRequired ? await setup.documentRequired() : true;
  const facts = await getAccountFacts(documentRequired, usesListings(setup.config));
  return computeAccountStatus(setup.config, facts);
}
```

Em `createAccountLevelHandler`, troque o JSON por:

```ts
    return NextResponse.json(
      {
        status,
        allowed,
        unlocks: unlocksByLevel(setup.capabilities, setup.labels),
        ...(can ? { can } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
```

Em `kizuna-core/src/server/index.ts`, adicione `usesListings` ao bloco de export de `'./account-levels'`.

Em `kizuna-core/src/client/components/account-levels/use-account-level.ts`, no tipo `AccountLevelResponse` adicione `unlocks?: Record<string, string[]>;` e no retorno do hook `unlocks: data?.unlocks ?? {},`.

- [ ] **Step 4: Config (os dois arquivos: `kizuna.config.json` e `kizuna-core/starter/kizuna.config.json`)**

No nível `contato`, troque a descrição para:
`"Confirme seu email e seu celular para avaliar, comentar e anunciar."`

Entre `perfil` e `identidade`, insira:

```json
      {
        "key": "anunciante",
        "level": 4,
        "title": "Anunciante",
        "description": "Publique seu primeiro anuncio e ganhe o selo de anunciante.",
        "onboardingOrder": 4,
        "profileOrder": 4,
        "requirement": "listing_published",
        "href": "/painel/meus-servicos/novo"
      },
```

No nível `identidade`: `"level": 5`, `"onboardingOrder": 5`, `"profileOrder": 5`.

- [ ] **Step 5: Starter — rótulos e setup**

`src/lib/account-levels.ts`, depois de `CAPABILITIES`:

```ts
/** Rótulo humano de cada ação — aparece no card ("o que você libera") e na tela de bloqueio. */
export const ACTION_LABELS: Record<Capability, string> = {
  like: 'Curtir e salvar',
  save: 'Curtir e salvar',
  review: 'Avaliar e comentar',
  comment: 'Avaliar e comentar',
  'service.create': 'Publicar anuncios',
  'event.create': 'Publicar eventos',
  sell: 'Vender pela plataforma',
};
```

(`Capability` é declarado abaixo de `CAPABILITIES`; mova a linha `export type Capability = ...` para antes de `ACTION_LABELS`.)

`src/lib/server/account-levels.ts`: importe `ACTION_LABELS` junto de `CAPABILITIES` e adicione `labels: ACTION_LABELS,` ao `accountLevelsSetup`.

- [ ] **Step 6: Verificar**

Run: `cd kizuna-core && npx vitest run src/shared/account-levels` → PASS.
Run (raiz): `npx tsc --noEmit -p .` → sem erros.
Com o dev rodando e logado: `GET /api/account/level` → JSON com `status.levels` de 5 itens e `unlocks.perfil` contendo `"Publicar anuncios"`.

- [ ] **Step 7: Checkpoint** — não commitar.

---

### Task 3: `AccountLevelCard` no painel (substitui o `OnboardingBanner`)

**Files:**
- Create: `kizuna-core/src/client/components/account-levels/next-step-action.tsx`
- Create: `kizuna-core/src/client/components/account-levels/account-level-card.tsx`
- Modify: `kizuna-core/src/client/components/account-levels/index.ts`
- Modify: `src/app/painel/page.tsx`
- Delete: `src/components/onboarding-banner.tsx`, `src/components/painel-wrapper.tsx`

**Interfaces:**
- Consumes: `useAccountLevel` (agora com `unlocks`), `AccountLevelResponse`, `LevelStatus`, `PhoneLoginForm`
- Produces:
  - `NextStepAction({ level, phoneEnabled, onDone }: { level: LevelStatus; phoneEnabled: boolean; onDone: () => void })` — botão do próximo passo (celular inline; demais via `href`; "em análise"/email sem botão)
  - `AccountLevelCard({ initial, phoneEnabled, allLevelsHref? }: { initial: AccountLevelResponse | null; phoneEnabled: boolean; allLevelsHref?: string })`

- [ ] **Step 1: `next-step-action.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LevelStatus } from '../../../shared/account-levels';
import { PhoneLoginForm } from '../auth/phone-login-form';

const BUTTON =
  'inline-flex h-9 items-center rounded-[var(--ui-radius-pill,0.375rem)] bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90';

/** Botão do próximo passo de um nível. Celular verifica inline; o resto segue o `href` do nível. */
export function NextStepAction({
  level,
  phoneEnabled,
  onDone,
}: {
  level: LevelStatus;
  phoneEnabled: boolean;
  onDone: () => void;
}) {
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  if (level.enabled === false || level.met) return null;

  if (level.requirement === 'contact_verified') {
    if (!level.missing.includes('Verificar celular') || !phoneEnabled) return null;
    if (verifyingPhone) {
      return (
        <div className="mt-3 max-w-sm">
          <PhoneLoginForm
            purpose="verify_phone"
            onVerified={() => {
              setVerifyingPhone(false);
              onDone();
            }}
          />
        </div>
      );
    }
    return (
      <button type="button" onClick={() => setVerifyingPhone(true)} className={`mt-3 ${BUTTON}`}>
        Verificar meu celular
      </button>
    );
  }

  if (level.requirement === 'listing_published' && level.missing.includes('Anuncio em analise')) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Seu anuncio esta em analise. Voce vira Anunciante quando ele for aprovado.
      </p>
    );
  }

  if (!level.href) return null;
  return (
    <Link href={level.href} className={`mt-3 ${BUTTON}`}>
      {level.requirement === 'listing_published' ? 'Publicar anuncio' : 'Completar'}
    </Link>
  );
}
```

- [ ] **Step 2: `account-level-card.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { NextStepAction } from './next-step-action';
import { useAccountLevel, type AccountLevelResponse } from './use-account-level';

type Props = {
  initial: AccountLevelResponse | null;
  phoneEnabled: boolean;
  allLevelsHref?: string;
};

/** Card do painel: nível atual, barra de progresso, próximo passo e o que ele libera. */
export function AccountLevelCard({
  initial,
  phoneEnabled,
  allLevelsHref = '/painel/onboarding',
}: Props) {
  const { status, unlocks, refresh } = useAccountLevel({ initial });
  if (!status) return null;

  const total = status.levels.length;
  const current = status.levels.find((l) => l.key === status.levelKey);
  const next = status.next;

  if (!next) {
    return (
      <section className="flex items-center gap-3 rounded-[var(--ui-radius-card-lg,1.5rem)] border border-border bg-card px-5 py-4">
        <BadgeCheck className="h-5 w-5 text-primary" />
        <p className="text-sm">
          Nivel {status.level} de {total} · <strong>{current?.title}</strong>
        </p>
        <Link href={allLevelsHref} className="ml-auto text-sm text-primary hover:underline">
          Ver niveis
        </Link>
      </section>
    );
  }

  const nextUnlocks = unlocks[next.key] ?? [];

  return (
    <section className="rounded-[var(--ui-radius-card-lg,1.5rem)] border border-border bg-card px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Nivel {status.level} de {total}
          {current ? (
            <>
              {' '}
              · <strong className="text-foreground">{current.title}</strong>
            </>
          ) : null}
        </p>
        <Link href={allLevelsHref} className="text-sm text-primary hover:underline">
          Ver todos os niveis
        </Link>
      </div>

      <div className="mt-3 flex gap-1" aria-hidden>
        {status.levels.map((l) => (
          <span
            key={l.key}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              l.reached ? 'bg-primary' : 'bg-muted',
              l.enabled === false && 'opacity-40'
            )}
          />
        ))}
      </div>

      <div className="mt-4">
        <p className="font-medium">Proximo: {next.title}</p>
        {next.missing.length ? (
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {next.missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        ) : null}
        {nextUnlocks.length ? (
          <p className="mt-2 text-sm">
            Libera: <span className="text-muted-foreground">{nextUnlocks.join(', ')}</span>
          </p>
        ) : null}
        <NextStepAction level={next} phoneEnabled={phoneEnabled} onDone={() => void refresh()} />
      </div>
    </section>
  );
}
```

Confirme que `cn` existe em `kizuna-core/src/lib/utils` (o `weather-widget.tsx` importa de `'../../../lib/utils'`, mesmo nível de pasta).

- [ ] **Step 3: Exportar**

Em `kizuna-core/src/client/components/account-levels/index.ts` adicione:

```ts
export { AccountLevelCard } from './account-level-card';
export { NextStepAction } from './next-step-action';
```

- [ ] **Step 4: Painel do starter — `src/app/painel/page.tsx`**

Remova o import de `PainelWrapper`, a variável `isUserType` e o bloco `{isUserType && session?.user_id && (...)}`.

Adicione imports:

```ts
import { canDo, unlocksByLevel } from '@kizuna/core/shared/account-levels';
import { getAccountStatus, isPhoneLoginEnabled, type OtpConfig } from '@kizuna/core/server';
import { AccountLevelCard } from '@kizuna/core/client/components/account-levels';
import { accountLevelsSetup } from '@/lib/server/account-levels';
import cfg from '@/../kizuna.config.json';
```

(`getSession` já vem de `@kizuna/core/server` — junte no mesmo import.)

No início de `PainelPage`, depois de `const session = await getSession();`:

```ts
  const status = await getAccountStatus(accountLevelsSetup);
  const levelInitial = {
    status,
    allowed: Object.fromEntries(
      Object.keys(accountLevelsSetup.capabilities).map((a) => [
        a,
        canDo(status, accountLevelsSetup.capabilities, a).allowed,
      ])
    ),
    unlocks: unlocksByLevel(accountLevelsSetup.capabilities, accountLevelsSetup.labels),
  };
  const phoneEnabled = isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp);
```

Como primeiro filho do `<div>` raiz (onde estava o banner):

```tsx
      {session ? <AccountLevelCard initial={levelInitial} phoneEnabled={phoneEnabled} /> : null}
```

- [ ] **Step 5: Apagar o banner antigo**

Confirme que nada mais usa: Grep `PainelWrapper|OnboardingBanner` em `src/` → só os dois arquivos. Então apague `src/components/onboarding-banner.tsx` e `src/components/painel-wrapper.tsx`.
(Não apagar `src/app/api/onboarding/progress/route.ts` — é arquivo gerenciado do plugin onboarding.)

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit -p .` → sem erros.
No navegador (dev), logado com conta nova em `/painel`: card "Nivel 1 de 5 · Conta criada", barra com 1 de 5 segmentos cheios, "Proximo: Contato verificado" com "• Verificar email • Verificar celular" e "Libera: Avaliar e comentar". Com `otp.enabled: false`, sem botão de celular (esperado). Screenshot como prova.

- [ ] **Step 7: Checkpoint** — não commitar.

---

### Task 4: `RequireLevel` + `LevelBlockedScreen` e uso no "novo anúncio"

**Files:**
- Create: `kizuna-core/src/client/components/account-levels/level-blocked-screen.tsx`
- Create: `kizuna-core/src/server/require-level.tsx`
- Modify: `kizuna-core/src/client/components/account-levels/index.ts`
- Modify: `kizuna-core/src/server/index.ts`
- Modify: `src/app/painel/meus-servicos/[serviceId]/page.tsx`

**Interfaces:**
- Consumes: `getAccountStatus`, `canDo`, `AccountLevelsSetup.labels`, `NextStepAction`, `CanResult`
- Produces:
  - `LevelBlockedScreen({ can, actionLabel, status, phoneEnabled, allLevelsHref? })` (client)
  - `RequireLevel({ setup, action, returnTo, phoneEnabled?, children }): Promise<ReactNode>` (server), exportado de `@kizuna/core/server`

- [ ] **Step 1: `level-blocked-screen.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import type { AccountStatus, CanResult } from '../../../shared/account-levels';
import { NextStepAction } from './next-step-action';

type Props = {
  can: CanResult;
  status: AccountStatus;
  /** Rótulo humano da ação ("Publicar anuncios"). */
  actionLabel: string;
  phoneEnabled: boolean;
  allLevelsHref?: string;
};

/**
 * Tela padrão de "falta nível" — renderizada pelo `RequireLevel` na MESMA URL. Ao completar um
 * passo, `router.refresh()`: o servidor recalcula e, se liberou, entrega o conteúdo.
 */
export function LevelBlockedScreen({
  can,
  status,
  actionLabel,
  phoneEnabled,
  allLevelsHref = '/painel/onboarding',
}: Props) {
  const router = useRouter();
  const requiredLevel = can.required?.level ?? 1;
  const steps = status.levels.filter((l) => l.level <= requiredLevel);
  const firstPending = steps.find((l) => !l.reached);

  function onStepDone() {
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Para {actionLabel.toLowerCase()}, falta pouco</h1>
          {can.required ? (
            <p className="text-sm text-muted-foreground">
              Chegue ao nivel {can.required.level} · {can.required.title}
            </p>
          ) : null}
        </div>
      </div>

      {can.required?.enabled === false ? (
        <p className="text-sm text-muted-foreground">Este nivel ainda nao esta disponivel. Em breve!</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((l) => (
            <li key={l.key} className="rounded-[var(--ui-radius-card-sm,0.5rem)] border border-border p-4">
              <div className="flex items-start gap-3">
                {l.reached ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {l.level}. {l.title}
                  </p>
                  {!l.reached && l.missing.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">Falta: {l.missing.join(', ')}</p>
                  ) : null}
                  {firstPending?.key === l.key ? (
                    <NextStepAction level={l} phoneEnabled={phoneEnabled} onDone={onStepDone} />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Link href={allLevelsHref} className="inline-block text-sm text-primary hover:underline">
        Ver todos os niveis
      </Link>
    </div>
  );
}
```

Observação: `NextStepAction` só renderiza botão se o nível não está `met`. Um nível pode estar `met` mas não `reached` (anterior pendente) — por isso o botão vai no `firstPending`, que por definição é o primeiro não alcançado e, pela cadeia, é o que tem `met === false`.

- [ ] **Step 2: `kizuna-core/src/server/require-level.tsx`**

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { canDo } from '../shared/account-levels';
import { LevelBlockedScreen } from '../client/components/account-levels/level-blocked-screen';
import { getAccountStatus, type AccountLevelsSetup } from './account-levels';
import { getSession } from './auth';

type Props = {
  setup: AccountLevelsSetup;
  action: string;
  /** URL atual, para voltar depois do login. */
  returnTo: string;
  phoneEnabled?: boolean;
  children: ReactNode;
};

/**
 * Barreira de nível padrão para páginas. Liberado → children. Bloqueado → tela de "falta nível"
 * na mesma URL (ao completar, o refresh entrega o conteúdo). Sem sessão → login com retorno.
 */
export async function RequireLevel({ setup, action, returnTo, phoneEnabled = false, children }: Props) {
  const session = await getSession();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  const status = await getAccountStatus(setup);
  const can = canDo(status, setup.capabilities, action);
  if (can.allowed) return <>{children}</>;

  return (
    <LevelBlockedScreen
      can={can}
      status={status}
      actionLabel={setup.labels?.[action] ?? 'continuar'}
      phoneEnabled={phoneEnabled}
    />
  );
}
```

Confirme que `getSession` é exportado de `./auth` (é: `kizuna-core/src/server/auth.ts:80`).

- [ ] **Step 3: Exportar**

`kizuna-core/src/server/index.ts`, logo após o bloco de `./account-levels`:

```ts
export { RequireLevel } from './require-level';
```

`kizuna-core/src/client/components/account-levels/index.ts`:

```ts
export { LevelBlockedScreen } from './level-blocked-screen';
```

Se o `tsc` do core reclamar de JSX em `src/server` (checar `kizuna-core/tsconfig.json` → `"jsx"`), confirme que já há outro `.tsx` sob `src/server`; se não houver e o `jsx` não estiver configurado, adicione `"jsx": "react-jsx"` ao `compilerOptions` do core.

- [ ] **Step 4: Usar no "novo anúncio" — `src/app/painel/meus-servicos/[serviceId]/page.tsx`**

Troque o import `canDoServer` por `RequireLevel, isPhoneLoginEnabled, type OtpConfig` (de `@kizuna/core/server`), remova o bloco `if (isCreating && !(await canDoServer(...)))` com o `redirect` para onboarding, e troque o `return` por:

```tsx
  const wizard = (
    <ServicoWizardPage
      key={serviceId}
      mode={isCreating ? 'create' : 'edit'}
      serviceId={isCreating ? null : serviceId}
      wizardConfig={cfg.wizards.servicos as WizardJsonConfig}
    />
  );

  if (!isCreating) return wizard;

  return (
    <RequireLevel
      setup={accountLevelsSetup}
      action="service.create"
      returnTo="/painel/meus-servicos/novo"
      phoneEnabled={isPhoneLoginEnabled((cfg as { otp?: OtpConfig }).otp)}
    >
      {wizard}
    </RequireLevel>
  );
```

Mantenha o comentário `key={serviceId}` acima do `<ServicoWizardPage` (ele explica um bug real).

- [ ] **Step 5: Verificar**

Run: `cd kizuna-core && npx tsc --noEmit` e na raiz `npx tsc --noEmit -p .` → sem erros.
No navegador:
1. Conta nível 1 em `/painel/meus-servicos/novo` → tela "Para publicar anuncios, falta pouco", checklist 1 ✓, 2 ○ (Falta: Verificar email, Verificar celular), 3 ○; URL continua `/painel/meus-servicos/novo`.
2. Conta nível 3 (use o banco: `UPDATE auth.users SET email_verified_at = now(), phone_verified_at = now() WHERE login = '<login da conta de teste>'` e complete o perfil) → wizard abre.
3. Deslogado em `/painel/meus-servicos/novo` → `/login?returnTo=%2Fpainel%2Fmeus-servicos%2Fnovo`.
4. Editar um serviço existente continua abrindo sem barreira.

- [ ] **Step 6: Checkpoint** — não commitar.

---

### Task 5: Página `/painel/onboarding`, docs e verificação final

**Files:**
- Modify: `src/app/painel/onboarding/page.tsx`
- Modify: `kizuna-core/docs/arquitetura/niveis-de-conta.md`

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Onboarding usa rótulo da ação**

Em `src/app/painel/onboarding/page.tsx`, troque a faixa de aviso por:

```tsx
      {blocked && !blocked.allowed && blocked.required ? (
        <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Para <strong>{(accountLevelsSetup.labels?.[acao!] ?? 'continuar').toLowerCase()}</strong>,
          chegue ao nivel <strong>{blocked.required.title}</strong>.
        </p>
      ) : null}
```

- [ ] **Step 2: Docs — `kizuna-core/docs/arquitetura/niveis-de-conta.md`**

Acrescente/atualize (texto corrido, sem classes CSS):
- Requisito `contact_verified` exige email **e** celular.
- Requisito `listing_published` (fatos `listings`, RPC `public.fun_services__my_listing_counts` da migração `services/0006`; só consultada se algum nível habilitado usa o requisito).
- `AccountLevelsSetup.labels` + `unlocksByLevel` + campo `unlocks` em `GET /api/account/level`.
- Seção "Barreira em páginas" com o exemplo de `RequireLevel` (o mesmo do Task 4, Step 4) substituindo o exemplo antigo de `canDoServer` + `redirect('/painel/onboarding?acao=...')`.
- Seção "Card no painel" com `AccountLevelCard`.
- Aviso: sem provedor de SMS real (`otp.enabled: false`), ninguém passa do nível 1; verificação de email por senha depende do plano 2.

- [ ] **Step 3: Verificação final**

Run: `cd kizuna-core && npx vitest run` → PASS.
Run (raiz): `npx tsc --noEmit -p .` → sem erros.
Run (raiz): `npm run build` → build ok.
Navegador: repetir os 4 cenários do Task 4 Step 5 + `/painel` com conta que tem 1 anúncio `active` mostra "Nivel 4 de 5 · Anunciante" e barra com 4 segmentos cheios; conta com só anúncio `pending` mostra "Seu anuncio esta em analise".

- [ ] **Step 4: Checkpoint final** — resumir o diff (core + starter) ao usuário; commit só se ele pedir.
