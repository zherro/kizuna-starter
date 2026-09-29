# Tema `soft` — Fase 1 (infraestrutura + `ui/`) — Plano de implementação

> **Para quem executar:** use superpowers:executing-plans (ou subagent-driven-development) task a task.
> Passos em checkbox (`- [ ]`). **Git:** nada de commit/push — ao fim de cada task, só `git add`
> (no submódulo `kizuna-core` e/ou no starter). Commit só quando o usuário pedir.

Status: proposta, aguardando aprovação. Nada implementado.

**Objetivo:** ligar o eixo "forma" (`classic`/`soft`) à UI por CSS custom properties + `<html data-ui-style>`,
migrar todos os primitivos de `kizuna-core/src/client/components/ui/` que têm raio/borda/sombra fixos,
clarear o fundo do `bora_cuiaba` e tornar a fonte de títulos configurável por lista curada.

**Arquitetura:** tokens `--ui-*` em `src/app/globals.css` do consumidor (`:root` = classic, `:root[data-ui-style='soft']`
= soft). O root layout (Server Component) escreve `data-ui-style={ACTIVE_UI_STYLE}` e, opcionalmente,
`data-display-font`. Os componentes trocam valor fixo por classe arbitrária do Tailwind `…-[var(--ui-x,<valor classic>)]`.

**Stack:** Next 16.2.6 (App Router), Tailwind v4.3.3, tailwind-merge 3.6, `next/font/google`, vitest (no core).

**Spec:** `docs/superpowers/specs/2026-09-29-ui-soft-theme-design.md`

## Restrições globais

- `NEXT_PUBLIC_UI_STYLE=classic` (ou ausente) **não muda de aparência**. Única exceção intencional: fundo do
  `bora_cuiaba` (decisão 4 do spec, vale pros dois estilos).
- Escopo: só `ui/` + infra. **Não tocar** nos componentes de `ui-better-soft/` (nem nos 7 que leem `activeTheme`,
  ver D1) nem fazer passe fino tela a tela.
- Em cada componente: ler o arquivo inteiro antes de editar; trocar só valor fixo → `var(--ui-*)`; nada de refactor.
- Docs do core: seguir `kizuna-core/docs/.claude/skills/documentacao/SKILL.md`.

## Estado real encontrado (levantamento)

- `ui-theme.ts` exporta `UI_STYLES`, `UI_THEME`, `ACTIVE_UI_STYLE`, `activeTheme`. `resolveUiStyle` existe mas **não é exportada**.
  `activeTheme` é lido por 7 componentes de `ui-better-soft/` (color-chip, fab, page-header, page-heading,
  modal-panel, section, select-popover).
- `UI_THEME.soft` usa sombra arbitrária lendo as vars `--shadow-soft-1/2/3`, que **não estão definidas** em nenhum `globals.css`
  (hoje o soft desses 7 não tem sombra nenhuma).
- `<html>` do starter não tem `data-ui-style`; `.env` não define `NEXT_PUBLIC_UI_STYLE` → starter hoje é classic.
- `--font-display` está no `@theme inline` (Quicksand → Bricolage → Roboto). Fontes carregadas no layout: Roboto,
  Geist Mono, Bricolage, Quicksand. (O spec cita Eczar como carregada — não está; só aparece em comentários.)
- Grep de `rounded-|border-border|shadow-|border` em `ui/`: 20 arquivos. Classificação:

| Arquivo | Valor fixo hoje | Token | Entra na fase 1? |
|---|---|---|---|
| `button.tsx` | `rounded-md` (base e `size=sm`) | `--ui-radius-pill` | sim |
| `badge.tsx` | `rounded-md` | `--ui-radius-pill` | sim |
| `card.tsx` | `rounded-xl` / `border` / `shadow-sm` | `--ui-radius-card-compact` / `--ui-border-w-card` / `--ui-shadow-card` | sim |
| `sheet.tsx` | `rounded-{b,l,t,r}-2xl` / `border` / `shadow-lg` | `--ui-radius-sheet-top` / `--ui-border-w-card` / `--ui-shadow-sheet` | sim |
| `progress.tsx` | `h-2` / `bg-primary/15` | `--ui-progress-h` / `--ui-progress-track` (novos, D4) | sim |
| `input.tsx`, `textarea.tsx`, `currency-input.tsx`, `quill-editor.tsx`, `searchable-select.tsx` (gatilho) | `rounded-md` | `--ui-radius-field` (novo, D4) | sim |
| `dropdown-menu.tsx` (2 painéis), `tooltip.tsx`, `searchable-select.tsx` (painel) | `rounded-md` | `--ui-radius-popover` (novo, D4) | sim |
| `select.tsx` (deprecated) | `rounded-lg` (gatilho + painel) / `shadow-sm` (gatilho) | `--ui-radius-select` (novo, D4) / `--ui-shadow-card` | sim |
| `typography.tsx` | — (sem raio/borda/sombra; fonte vem de `font-display`) | coberto pela indireção de fonte (Task 3) | sem mudança de código |
| `checkbox`, `radio-group`, `switch`, `slider`, `accordion`, `divider`, `separator`, `table`, `tabs`, itens do `dropdown-menu` (`rounded-sm`), `markdown-editor` | formas funcionais (círculo, trilho, linha) ou sem par nas referências | — | não (fase 3 se o passe fino pedir) |

- Checagens técnicas feitas (Tailwind 4.3.3 + tailwind-merge 3.6 deste repo):
  - `rounded-[var(--x,0.375rem)]`, `rounded-t-[…]`, `border-[length:var(--x,1px)]`, `h-[var(--x,0.5rem)]` compilam certo
    e o `twMerge` resolve conflito com o `className` do chamador (`rounded-full`, `border-0`, `h-3` vencem).
  - **`shadow-[var(--x)]` NÃO é reconhecida pelo twMerge** (um `shadow-none` do chamador não remove a nossa). Com rótulo,
    `shadow-[shadow:var(--x,…)]`, funciona. → usar sempre o rótulo `shadow:`.
  - O utilitário `shadow-sm` compila para `0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a`; a var `--shadow-sm` que
    existe na página vale `0 1px 2px 0 rgb(0 0 0 / 0.05)` (outro valor, vem de fora do Tailwind). Ver D2.
  - `none` dentro de `--tw-shadow` invalida o `box-shadow` (é composto numa lista com o ring). Soft usa `0 0 #0000`.

## Decisões que não estavam 100% no spec (precisam do seu ok)

- **D1 — `UI_THEME`/`activeTheme` ficam na fase 1.** O spec (decisão 2) remove os dois, mas isso obriga a migrar os 7
  componentes de `ui-better-soft/` que os leem, e o rollout não põe esses 7 em nenhuma fase (a fase 2 fala só dos 21).
  Proposta: manter os dois exports intactos (com `@deprecated` apontando pra fase 2) e remover junto com a migração
  dos 7 + 21 na fase 2. A escala de heading (`headingTitleSize/Weight`, `pageHeaderTitleSize/Weight`), que o spec
  deixa pro plano decidir, é consumida só por `page-heading`/`page-header` (ui-better-soft) → decide-se na fase 2.
  Recomendação pra lá: tokens CSS (`--ui-heading-title-size` com o `clamp()` da escala fluida) passados como
  `className` pro `Typography`, pra não precisar de JS por estilo.
- **D2 — `--ui-shadow-card` classic = valor literal do utilitário `shadow-sm`**, não `var(--shadow-sm)` como na tabela
  do spec: a var tem outro valor e mudaria o classic. Mesma coisa pra `--ui-shadow-sheet` (= `shadow-lg` literal).
  Soft: `0 0 #0000` em vez de `none` (motivo acima; visualmente é igual a "sem sombra").
- **D3 — Fallback classic dentro do `var()`** em toda classe (`rounded-[var(--ui-radius-pill,0.375rem)]`). Motivo: os
  tokens vivem no `globals.css` de cada consumidor; um projeto em produção que atualizar o submódulo sem copiar o bloco
  de tokens ficaria com raio 0/sem borda. Com o fallback, sem o bloco = classic idêntico.
- **D4 — Tokens novos além da tabela do spec** (sem eles não dá pra tokenizar sem mudar o classic):

| Token | classic (`:root`) | soft |
|---|---|---|
| `--ui-radius-field` | `0.375rem` (rounded-md) | `1rem` |
| `--ui-radius-popover` | `0.375rem` (rounded-md) | `1rem` |
| `--ui-radius-select` | `0.5rem` (rounded-lg, só o `select.tsx` deprecated) | `1rem` |
| `--ui-progress-h` | `0.5rem` (h-2) | `0.375rem` ("fina") |
| `--ui-progress-track` | *não definido* — fallback no próprio componente: `color-mix(in oklab, var(--primary) 15%, transparent)` | `var(--muted)` |

  `--ui-progress-track` só existe no soft de propósito: um token com `var(--primary)` definido no `:root` é resolvido
  no `<html>` e ignoraria um `--primary` sobrescrito num wrapper; no fallback ele resolve no próprio elemento.
  Valores soft de campo/popover são chute inicial, afinados na fase 3.
- **D5 — `sheet.tsx`: os 4 lados usam `--ui-radius-sheet-top`** (hoje todos são `2xl` = 1rem; no soft ficam 1.75rem,
  consistentes). Borda do painel usa `--ui-border-w-card` (some no soft). **Alça (drag handle) não entra** — é
  elemento novo, fica pra fase 3.
- **D6 — Nome do token de fonte: `--ui-font-display-active`** (o spec usa esse na tabela e `--font-display-active` na
  decisão 5; fico com o prefixo `--ui-`). Chave de config: **`theme.displayFont`** no `kizuna.config.json`, valores de
  `DISPLAY_FONTS = ['quicksand', 'baloo', 'bricolage']` (as já carregadas + Baloo 2). Precedência: `theme.displayFont`
  válido > default do estilo (soft = Baloo, classic = pilha atual). Implementado só em CSS: `:root[data-display-font=…]`
  vem depois de `:root[data-ui-style='soft']` com a mesma especificidade.
- **D7 — Template do core** (`kizuna-core/template/src/app/{globals.css,layout.tsx}`): proposta é **não mexer** na fase 1
  (o fallback de D3 já protege projetos novos, que nascem classic). Se quiser que projeto novo já nasça com soft
  disponível, vira uma task extra.
- **Nota fora do spec:** `theme.metaColor` (`#fbf7f0`) foi escolhido pelo fundo antigo do `bora_cuiaba`. Não mexo; se
  quiser, o novo fundo `oklch(0.99 0.005 80)` fica perto de `#fdfbf8`.

## Arquivos

- Modificar (core): `src/client/lib/ui-theme.ts`; `src/client/components/ui/{button,badge,card,sheet,progress,input,textarea,currency-input,quill-editor,searchable-select,dropdown-menu,tooltip,select}.tsx`;
  `docs/comecando/configuracao.md`; `docs/interface/componentes.md`.
- Criar (core): `src/shared/display-fonts.ts`, `src/shared/display-fonts.test.ts`, `src/client/lib/ui-theme.test.ts`.
- Modificar (starter): `src/app/layout.tsx`, `src/app/globals.css`, `kizuna.config.json`, `.env.example`.

## Como verificar (vale pra todas as tasks)

**V-classic (regressão zero):** na Task 0 capturo um snapshot de estilos computados; depois de cada bloco comparo.
Páginas: `/`, `/busca`, `/login`, `/registre-se`, um `/anuncios/<uid>` (primeiro link da home) e `/painel` se o browser
pane já tiver sessão. Snippet (via `javascript_tool`), salvo como JSON no scratchpad por página:

```js
(() => {
  const props = ['border-radius', 'border-top-width', 'box-shadow', 'font-family', 'background-color', 'height'];
  const out = {};
  document.querySelectorAll('button, a, input, textarea, [role=dialog], [role=progressbar], div, h1, h2, h3, span')
    .forEach((el, i) => {
      const cs = getComputedStyle(el);
      if (cs.borderRadius === '0px' && cs.boxShadow === 'none' && cs.borderTopWidth === '0px' && !/^H\d$/.test(el.tagName)) return;
      out[`${i}:${el.tagName}`] = props.map((p) => cs.getPropertyValue(p)).join(' | ');
    });
  return out;
})()
```

Comparação: diff dos JSONs antes/depois (tem que dar vazio, exceto `background-color` do fundo `bora_cuiaba`
na Task 2) + screenshot lado a lado.

**V-soft:** criar `.env.development.local` com `NEXT_PUBLIC_UI_STYLE=soft`, reiniciar o dev server (`NEXT_PUBLIC_*`
entra no bundle na subida), conferir `<html data-ui-style="soft">`, estilos computados e screenshot. Apagar o arquivo no
fim. Ele **não** está no `.gitignore`, então nunca entra num `git add`. Os dois dev servers não rodam juntos (mesmo `.next`), então é stop → start.

**Checks estáticos:** `npx tsc --noEmit` (starter), `npx vitest run <arquivo>` (dentro de `kizuna-core/`),
`npx eslint <arquivos alterados>`.

---

### Task 0: Baseline classic

**Arquivos:** nenhum.

- [ ] Confirmar que `.env` não define `NEXT_PUBLIC_UI_STYLE` e que não existe `.env.development.local`.
- [ ] `preview_start` `starter-dev`; rodar o snippet em cada página da lista; salvar `baseline-<pagina>.json` no scratchpad.
- [ ] Screenshot de cada página (referência visual).

### Task 1: `data-ui-style` no `<html>`

**Arquivos:** Modificar `kizuna-core/src/client/lib/ui-theme.ts`, `src/app/layout.tsx`. Criar `kizuna-core/src/client/lib/ui-theme.test.ts`.

**Interfaces:** Produz `export function resolveUiStyle(): UiStyle` e `ACTIVE_UI_STYLE` (já existe), usados no layout.

- [ ] **Teste (falha):** `kizuna-core/src/client/lib/ui-theme.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveUiStyle } from './ui-theme';

afterEach(() => vi.unstubAllEnvs());

describe('resolveUiStyle', () => {
  it('lê soft da env, sem diferenciar caixa/espaço', () => {
    vi.stubEnv('NEXT_PUBLIC_UI_STYLE', ' Soft ');
    expect(resolveUiStyle()).toBe('soft');
  });
  it('cai em classic sem env', () => {
    vi.stubEnv('NEXT_PUBLIC_UI_STYLE', '');
    expect(resolveUiStyle()).toBe('classic');
  });
  it('cai em classic com valor desconhecido', () => {
    vi.stubEnv('NEXT_PUBLIC_UI_STYLE', 'app');
    expect(resolveUiStyle()).toBe('classic');
  });
});
```

- [ ] `cd kizuna-core && npx vitest run src/client/lib/ui-theme.test.ts` → FALHA (`resolveUiStyle` não é exportada).
- [ ] Em `ui-theme.ts`: `function resolveUiStyle()` → `export function resolveUiStyle()`. Adicionar `@deprecated` em
  `UI_THEME` e `activeTheme`: `/** @deprecated Fase 2 do tema soft: os componentes passam a ler var(--ui-*) (globals.css) e este objeto sai. */`.
  Atualizar o comentário do topo pra dizer que `ACTIVE_UI_STYLE` vira `<html data-ui-style>` no root layout.
- [ ] Rodar o teste → PASSA.
- [ ] `src/app/layout.tsx`: `import { ACTIVE_UI_STYLE } from '@kizuna/core/client/lib/ui-theme';` e no `<html>`
  acrescentar `data-ui-style={ACTIVE_UI_STYLE}` logo depois de `data-theme-color`. Comentário de uma linha: fixo por
  deploy (`NEXT_PUBLIC_UI_STYLE`), resolvido no servidor, sem flash — diferente do `data-theme-color`.
- [ ] Ler `AppPreferencesProvider` e confirmar que ele não sobrescreve/remove atributos do `<html>` além do dele.
- [ ] `npx tsc --noEmit`; V-classic (`<html data-ui-style="classic">`, diff vazio).
- [ ] `git -C kizuna-core add src/client/lib/ui-theme.ts src/client/lib/ui-theme.test.ts`; `git add src/app/layout.tsx`.

### Task 2: bloco de tokens `--ui-*` + fundo do `bora_cuiaba`

**Arquivos:** Modificar `src/app/globals.css` (bloco novo antes de `@theme inline`; linhas 275-276).

**Interfaces:** Produz os tokens consumidos pelas Tasks 4-16 (nomes exatos abaixo).

- [ ] Inserir, depois do bloco `.dark { … }` e antes de `@theme inline`:

```css
/* ================= FORMA (data-ui-style) ================= */

/* Raio/borda/sombra dos componentes do kizuna-core por estilo — mesmo mecanismo do data-theme-color,
   mas o atributo vem do root layout (NEXT_PUBLIC_UI_STYLE, fixo por deploy). :root = classic, com os
   mesmos valores das classes Tailwind de antes; cada componente também traz o valor classic como
   fallback do var(), então projeto sem este bloco continua classic. */
:root {
  --ui-radius-card: 1rem;
  --ui-radius-card-compact: 0.75rem;
  --ui-radius-pill: 0.375rem;
  --ui-radius-sheet-top: 1rem;
  --ui-radius-field: 0.375rem;
  --ui-radius-popover: 0.375rem;
  --ui-radius-select: 0.5rem;
  --ui-border-w-card: 1px;
  --ui-border-w-chip: 1px;
  /* = utilitários shadow-sm / shadow-lg do Tailwind v4 (a var --shadow-sm da página tem outro valor) */
  --ui-shadow-card: 0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a;
  --ui-shadow-sheet: 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a;
  --ui-progress-h: 0.5rem;
}

/* soft: visual "app" — pill, cards sem borda/sombra (separação por bg-card sobre bg-background). */
:root[data-ui-style='soft'] {
  --ui-radius-card: 1.75rem;
  --ui-radius-card-compact: 1rem;
  --ui-radius-pill: 9999px;
  --ui-radius-sheet-top: 1.75rem;
  --ui-radius-field: 1rem;
  --ui-radius-popover: 1rem;
  --ui-radius-select: 1rem;
  --ui-border-w-card: 0px;
  --ui-border-w-chip: 1px;
  /* `0 0 #0000`, não `none`: o Tailwind junta --tw-shadow numa lista com o ring e `none` invalida a lista */
  --ui-shadow-card: 0 0 #0000;
  --ui-progress-h: 0.375rem;
  /* só no soft: o classic usa o fallback do componente, que resolve --primary no próprio elemento */
  --ui-progress-track: var(--muted);
}
```

- [ ] `bora_cuiaba` (linhas 275-276): `--background` e `--background-white` → `oklch(0.99 0.005 80)`. Só o bloco claro;
  o `.dark` do tema não muda.
- [ ] V-classic: diff vazio exceto `background-color` do body/`bg-background` no `bora_cuiaba` (esperado). Screenshot.
- [ ] `git add src/app/globals.css`.

### Task 3: fonte de títulos configurável

**Arquivos:** Criar `kizuna-core/src/shared/display-fonts.ts`, `kizuna-core/src/shared/display-fonts.test.ts`.
Modificar `src/app/layout.tsx`, `src/app/globals.css` (bloco de forma + `@theme inline` linha 551), `kizuna.config.json`.

**Interfaces:** Produz `DISPLAY_FONTS`, `type DisplayFont`, `isDisplayFont(value: unknown): value is DisplayFont`
(mesmo formato de `shared/theme-colors.ts`) e o token `--ui-font-display-active`.

- [ ] **Teste (falha):** `kizuna-core/src/shared/display-fonts.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DISPLAY_FONTS, isDisplayFont } from './display-fonts';

describe('isDisplayFont', () => {
  it('aceita as fontes da lista curada', () => {
    for (const f of DISPLAY_FONTS) expect(isDisplayFont(f)).toBe(true);
  });
  it('recusa fonte fora da lista e não-string', () => {
    expect(isDisplayFont('comic-sans')).toBe(false);
    expect(isDisplayFont(undefined)).toBe(false);
    expect(isDisplayFont(3)).toBe(false);
  });
});
```

- [ ] `cd kizuna-core && npx vitest run src/shared/display-fonts.test.ts` → FALHA (módulo não existe).
- [ ] Criar `kizuna-core/src/shared/display-fonts.ts`:

```ts
// Fontes de título (Typography font="display") escolhíveis por config — lista curada, igual a
// THEME_COLORS: cada nome precisa de um next/font carregado no layout do consumidor e de um bloco
// :root[data-display-font='<nome>'] no globals.css apontando --ui-font-display-active pra ela.
// Módulo sem 'use client' para ser lido no servidor (layout.tsx valida theme.displayFont).
export const DISPLAY_FONTS = ['quicksand', 'baloo', 'bricolage'] as const;

export type DisplayFont = (typeof DISPLAY_FONTS)[number];

export function isDisplayFont(value: unknown): value is DisplayFont {
  return typeof value === 'string' && (DISPLAY_FONTS as readonly string[]).includes(value);
}
```

- [ ] Rodar o teste → PASSA.
- [ ] `layout.tsx`: importar `Baloo_2` de `next/font/google` e declarar, ao lado da Quicksand:

```ts
// Fonte de títulos do estilo soft (default da lista curada em DISPLAY_FONTS) — ver --ui-font-display-active.
const baloo = Baloo_2({
  variable: '--font-baloo',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});
```

  Acrescentar `${baloo.variable}` no `className` do `<html>`. Resolver a config e passar o atributo:

```ts
// Fonte de títulos — chave "theme.displayFont" (lista em DISPLAY_FONTS). Sem ela, vale o default do
// estilo (soft = Baloo 2, classic = Quicksand), definido em globals.css.
const displayFontCfg = (cfg as { theme?: { displayFont?: string } }).theme?.displayFont;
const displayFont = isDisplayFont(displayFontCfg) ? displayFontCfg : undefined;
```

  e `data-display-font={displayFont}` no `<html>` (React omite o atributo quando `undefined`).
- [ ] `globals.css`: no `:root` do bloco de forma acrescentar
  `--ui-font-display-active: var(--font-quicksand), var(--font-bricolage), var(--font-roboto), ui-sans-serif, system-ui, sans-serif;`
  (exatamente a pilha de hoje); no `:root[data-ui-style='soft']`
  `--ui-font-display-active: var(--font-baloo), var(--font-quicksand), var(--font-roboto), ui-sans-serif, system-ui, sans-serif;`.
  Logo depois do bloco soft (mesma especificidade, então a config vence por ordem):

```css
/* theme.displayFont do kizuna.config.json — vence o default do estilo (vem depois, mesma especificidade) */
:root[data-display-font='quicksand'] {
  --ui-font-display-active: var(--font-quicksand), var(--font-roboto), ui-sans-serif, system-ui, sans-serif;
}
:root[data-display-font='baloo'] {
  --ui-font-display-active: var(--font-baloo), var(--font-roboto), ui-sans-serif, system-ui, sans-serif;
}
:root[data-display-font='bricolage'] {
  --ui-font-display-active: var(--font-bricolage), var(--font-roboto), ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] `@theme inline` (linha 551): `--font-display: var(--ui-font-display-active);` e reescrever o comentário das
  linhas 548-550: o `@theme inline` continua build-time, mas agora aponta pra uma var normal que segue cascade.
- [ ] `grep -rn "var(--font-display)"` no starter e no core: se alguém usa a var direto (e não a classe `font-display`),
  conferir que continua resolvendo.
- [ ] `kizuna.config.json` → `theme._comment`: acrescentar `"displayFont": fonte dos títulos, uma de quicksand | baloo | bricolage;
  sem ela vale o padrão do estilo (NEXT_PUBLIC_UI_STYLE: classic = quicksand, soft = baloo)`. Não definir a chave.
- [ ] `.env.example`: `# Estilo de forma da UI: classic (padrão) | soft. Entra no build. Ver kizuna-core/docs/interface/componentes.md` +
  `# NEXT_PUBLIC_UI_STYLE=classic`.
- [ ] Verificar: compilado de `.font-display` = `font-family: var(--ui-font-display-active)`; V-classic (`font-family`
  dos h1/h2 inalterado); V-soft (títulos em Baloo 2). Testar também `theme.displayFont: "bricolage"` temporário nos
  dois estilos e reverter.
- [ ] `npx tsc --noEmit`. `git -C kizuna-core add src/shared/display-fonts.ts src/shared/display-fonts.test.ts`;
  `git add src/app/layout.tsx src/app/globals.css kizuna.config.json .env.example`.

> Tasks 4-16: um arquivo por task, mesmo roteiro — **ler o arquivo inteiro**, fazer só a troca indicada, `npx tsc --noEmit`,
> V-classic nas páginas onde o componente aparece (diff vazio), V-soft no fim do bloco (Task 17), `git -C kizuna-core add <arquivo>`.
> Nenhuma dessas tasks cria teste automatizado (o spec não prevê teste visual); a garantia é o diff de estilos computados.

### Task 4: `ui/button.tsx`

- [ ] Linha 6 (base do `cva`): `rounded-md` → `rounded-[var(--ui-radius-pill,0.375rem)]`.
- [ ] Linha 17 (`size.sm`): `h-8 rounded-md px-3` → `h-8 rounded-[var(--ui-radius-pill,0.375rem)] px-3`.
- [ ] Borda do `variant.outline` fica como está (1px nos dois estilos).

### Task 5: `ui/badge.tsx`

- [ ] Linha 7: `rounded-md` → `rounded-[var(--ui-radius-pill,0.375rem)]`.

### Task 6: `ui/card.tsx`

- [ ] Linha 8: `'rounded-xl border border-border bg-card text-card-foreground shadow-sm'` →
  `'rounded-[var(--ui-radius-card-compact,0.75rem)] border-[length:var(--ui-border-w-card,1px)] border-border bg-card text-card-foreground shadow-[shadow:var(--ui-shadow-card,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]'`.
- [ ] Grep de chamadores de `<Card` com `rounded-`/`border-`/`shadow-` no `className` e conferir no navegador que o
  override do chamador continua vencendo.

### Task 7: `ui/sheet.tsx`

- [ ] Linhas 73-76: `rounded-b-2xl` / `rounded-l-2xl` / `rounded-t-2xl` / `rounded-r-2xl` →
  `rounded-b-[var(--ui-radius-sheet-top,1rem)]` e o mesmo token/fallback nos prefixos `rounded-l-`, `rounded-t-`, `rounded-r-` (D5).
- [ ] Linha 102: `border border-border bg-background shadow-lg` →
  `border-[length:var(--ui-border-w-card,1px)] border-border bg-background shadow-[shadow:var(--ui-shadow-sheet,0_10px_15px_-3px_#0000001a,_0_4px_6px_-4px_#0000001a)]`.
- [ ] `SheetHeader` (`border-b`) não muda. Verificar abrindo um sheet (menu do header no mobile).

### Task 8: `ui/progress.tsx`

- [ ] Linha 13: `h-2` → `h-[var(--ui-progress-h,0.5rem)]`; `bg-primary/15` →
  `bg-[color:var(--ui-progress-track,color-mix(in_oklab,var(--primary)_15%,transparent))]`.
- [ ] Conferir no CSS compilado que vira `background-color` e comparar com o `bg-primary/15` de antes (mesmo
  `color-mix`); conferir que o twMerge ainda deixa um `bg-*`/`h-*` do chamador vencer.

### Task 9: `ui/input.tsx`

- [ ] Linha 12: `rounded-md` → `rounded-[var(--ui-radius-field,0.375rem)]`.

### Task 10: `ui/textarea.tsx`

- [ ] Linha 10: `rounded-md` → `rounded-[var(--ui-radius-field,0.375rem)]`.

### Task 11: `ui/currency-input.tsx`

- [ ] Linha 54: `rounded-md` → `rounded-[var(--ui-radius-field,0.375rem)]`.

### Task 12: `ui/quill-editor.tsx`

- [ ] Linha 22: `rounded-md` → `rounded-[var(--ui-radius-field,0.375rem)]`.

### Task 13: `ui/searchable-select.tsx`

- [ ] Linha 119 (gatilho): `rounded-md` → `rounded-[var(--ui-radius-field,0.375rem)]`.
- [ ] Linha 153 (painel): `rounded-md` → `rounded-[var(--ui-radius-popover,0.375rem)]`.

### Task 14: `ui/dropdown-menu.tsx`

- [ ] Linhas 28 e 132 (painéis): `rounded-md` → `rounded-[var(--ui-radius-popover,0.375rem)]`. Itens (`rounded-sm`) não mudam.

### Task 15: `ui/tooltip.tsx`

- [ ] Linha 36: `rounded-md` → `rounded-[var(--ui-radius-popover,0.375rem)]`.

### Task 16: `ui/select.tsx` (deprecated)

- [ ] Linha 52 (gatilho): `rounded-lg` → `rounded-[var(--ui-radius-select,0.5rem)]`; `shadow-sm` →
  `shadow-[shadow:var(--ui-shadow-card,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]`.
- [ ] Linha 80 (painel): `rounded-lg` → `rounded-[var(--ui-radius-select,0.5rem)]`. `shadow-lg` fica.
- [ ] O arquivo usa template string e não `cn`: conferir se `form-builder/FormRenderer.tsx` passa `className` com
  `rounded-`/`shadow-` no `SelectTrigger` (sem twMerge, a ordem do CSS decidiria).

### Task 17: verificação do bloco `ui/` nos dois estilos

- [ ] V-classic completo em todas as páginas: diff contra a baseline vazio (salvo o fundo do `bora_cuiaba`).
- [ ] V-soft: `data-ui-style="soft"`; botões/badges pill, cards sem borda/sombra, raio de campos/popovers/sheet
  maiores, progress mais fino com trilho `--muted`, títulos em Baloo 2. Screenshots.
- [ ] Os 7 de `ui-better-soft/` continuam no soft antigo (JS) — esperado, é D1.
- [ ] Apagar `.env.development.local`, reiniciar em classic.
- [ ] `cd kizuna-core && npx vitest run` (suite inteira), `npx tsc --noEmit`, `npx eslint` nos arquivos alterados.

### Task 18: docs do core

**Arquivos:** `kizuna-core/docs/comecando/configuracao.md` (seção `theme`), `kizuna-core/docs/interface/componentes.md` (parágrafo de tema, ~linha 173).

- [ ] Ler `kizuna-core/docs/.claude/skills/documentacao/SKILL.md` e seguir.
- [ ] `configuracao.md`: linha `displayFont` na tabela de `theme` + lista `DISPLAY_FONTS` (`src/shared/display-fonts.ts`).
- [ ] `componentes.md`: `data-ui-style` (`NEXT_PUBLIC_UI_STYLE`, fixo por deploy, no root layout), tabela de tokens
  `--ui-*` (classic/soft), regra do fallback no `var()`, `shadow-[shadow:…]` por causa do twMerge, `0 0 #0000` em vez de `none`.
- [ ] Rodar a verificação de links/SUMMARY da skill. `git -C kizuna-core add docs/...`.

## Pendente (fora da fase 1)

- **Fase 2:** os 7 componentes que leem `activeTheme` + os 21 com valor fixo em `ui-better-soft/` passam a usar os
  tokens; remover `UI_THEME`/`activeTheme` (D1); escala de heading por token; decidir o destino de `--shadow-soft-1/2/3`.
- **Fase 3:** passe fino tela a tela (`/painel`, `/anuncios`, wizard); alça do bottom sheet; `tabs`/`table`/`checkbox`
  se as referências pedirem; afinar valores soft de campo/popover.
- Template do core (D7) e `metaColor`, se aprovados.
