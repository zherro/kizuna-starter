# Tema `soft` — Fase 2 (componentes além de `ui/`) — Plano de implementação

> **Para quem executar:** superpowers:subagent-driven-development, um despacho por lote. **Git:** nada de commit/push —
> cada lote aprovado vai pro stage (`git add` só dos arquivos do lote). Commit só quando o usuário pedir.

Status: em execução (usuário pediu "faça a fase 2, com subagents").

**Objetivo:** levar os tokens `--ui-*` da fase 1 para todo componente com raio/borda/sombra fixos fora de `ui/`:
os 32 arquivos de `ui-better-soft/`, os componentes de domínio do core e os do starter; remover `UI_THEME`/`activeTheme`.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-soft-theme-design.md` (fase 2 do rollout). Plano anterior:
`docs/superpowers/plans/2026-09-29-ui-soft-theme-fase1.md` (decisões D1–D7 continuam valendo).

## Restrições globais

- `NEXT_PUBLIC_UI_STYLE=classic` **não muda de aparência**. Toda troca é classe fixa → classe arbitrária cujo token tem,
  no `:root`, exatamente o valor da classe antiga, com esse mesmo valor como fallback dentro do `var()`.
- Só se troca o **token de classe** (raio, largura de borda, sombra, fundo de card). Nada de refactor, reformatar, mudar
  layout, padding, cor de texto ou estrutura.
- Sombra sempre com o rótulo `shadow:` dentro dos colchetes (ex.: `shadow-[shadow:var(--ui-shadow-card,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]`);
  largura de borda com o rótulo `length:` (ex.: `border-[length:var(--ui-border-w-card,1px)]`); fundo com o rótulo `color:`
  (ex.: `bg-[color:var(--ui-card-bg,var(--background))]`). Espaço dentro de valor arbitrário = `_`.
- Tailwind v4 varre `.md`: nenhum texto em forma de classe inválida em relatório, plano ou doc.
- Outra sessão pode estar editando arquivos neste mesmo working tree. **Pule** (e reporte) qualquer arquivo que já apareça
  modificado em `git status` / `git -C kizuna-core status` antes de você começar; nunca reverta nada que não escreveu.
- Nada de `git add`/commit pelos subagentes; nada de subir/derrubar dev server (o do usuário roda na 3000, em soft).

## Tokens novos (Task 1) — além dos da fase 1

| Token | classic (`:root`) | soft |
|---|---|---|
| `--ui-radius-card-lg` | `1.5rem` (rounded-3xl) | `2rem` |
| `--ui-radius-card-sm` | `0.5rem` (rounded-lg) | `1rem` |
| `--ui-radius-control` | `0.5rem` (rounded-lg) | `9999px` |
| `--ui-shadow-item` | `0 0 #0000` (sem sombra) | `var(--shadow-soft-1)` |
| `--ui-shadow-card-compact` | `0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a` (shadow-sm) | `var(--shadow-soft-1)` |
| `--ui-shadow-card-flat` | `0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a` (shadow-sm) | `var(--shadow-soft-3)` |
| `--ui-shadow-fab` | `0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a` (shadow-md) | `0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a` (shadow-lg) |
| `--ui-fab-size` | `3rem` (h-12/w-12) | `3.5rem` |
| `--ui-card-bg` | *não definido* (fallback no componente = o fundo antigo) | `var(--card)` |

Já existentes (fase 1): `--ui-radius-card` 1rem/1.75rem, `--ui-radius-card-compact` 0.75rem/1rem, `--ui-radius-pill`
0.375rem/9999px, `--ui-radius-sheet-top` 1rem/1.75rem, `--ui-radius-field` 0.375rem/1rem, `--ui-radius-popover`
0.375rem/1rem, `--ui-radius-select` 0.5rem/1rem, `--ui-border-w-card` 1px/0px, `--ui-border-w-chip` 1px/1px,
`--ui-shadow-card` shadow-sm/`var(--shadow-soft-2)`, `--ui-shadow-sheet` shadow-lg/shadow-lg, `--shadow-soft-1/2/3` (só soft).

## Tabela de regras (vale para todos os lotes)

Aplique pela **função** do elemento; o valor classic da classe antiga tem que bater com o `:root` do token.

| Elemento | Classe antiga | Classe nova |
|---|---|---|
| Card com cabeçalho / seção | `rounded-2xl` | `rounded-[var(--ui-radius-card,1rem)]` |
| Item de lista / card compacto | `rounded-xl` | `rounded-[var(--ui-radius-card-compact,0.75rem)]` |
| Wrapper grande | `rounded-3xl` | `rounded-[var(--ui-radius-card-lg,1.5rem)]` |
| Card / item pequeno com borda ou fundo de superfície | `rounded-lg` | `rounded-[var(--ui-radius-card-sm,0.5rem)]` (callout/alerta colorido não é card: fica) |
| Borda de superfície (card, item, painel) | `border` | `border-[length:var(--ui-border-w-card,1px)]` (mantém as classes de cor) |
| Sombra de card com cabeçalho | `shadow-sm` | `shadow-[shadow:var(--ui-shadow-card,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]` |
| Sombra de card compacto / item | `shadow-sm` | `shadow-[shadow:var(--ui-shadow-card-compact,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]` |
| Sombra de wrapper grande | `shadow-sm` | `shadow-[shadow:var(--ui-shadow-card-flat,0_1px_3px_0_#0000001a,_0_1px_2px_-1px_#0000001a)]` |
| Item/card com borda e **sem** nenhuma classe de sombra | (nada) | acrescentar `shadow-[shadow:var(--ui-shadow-item,0_0_#0000)]` — só se o elemento não tiver outra sombra **base** em nenhum ramo do className (sombra só em variante de estado, como hover ou focus, não impede: acrescente a de item mesmo assim) |
| Fundo de card que usa `bg-background` | `bg-background` | `bg-[color:var(--ui-card-bg,var(--background))]` (`bg-card` fica como está) |
| Botão/controle com cara de botão | `rounded-md` | `rounded-[var(--ui-radius-pill,0.375rem)]` |
| Botão/chip/tag/toggle | `rounded-lg` | `rounded-[var(--ui-radius-control,0.5rem)]` |
| Campo de texto / textarea / gatilho de select | `rounded-md` | `rounded-[var(--ui-radius-field,0.375rem)]` |
| Campo de texto / gatilho de select | `rounded-lg` | `rounded-[var(--ui-radius-select,0.5rem)]` |
| Campo de texto / gatilho de select | `rounded-xl` | `rounded-[var(--ui-radius-card-compact,0.75rem)]` (mesmo valor: 0.75rem classic, 1rem soft) |
| Painel flutuante (popover, menu, dropdown) | `rounded-md` | `rounded-[var(--ui-radius-popover,0.375rem)]` |
| Painel flutuante | `rounded-lg` | `rounded-[var(--ui-radius-select,0.5rem)]` |

**Não mexer:** `rounded-full`, `rounded-sm`, `rounded-none`; imagens, avatares, thumbnails, skeletons, ícones; borda
tracejada de estado vazio (a borda fica — o raio pode seguir a tabela); divisores (`border-t`/`border-b`/`divide-*`);
tabelas; variantes de estado (hover, focus, data-state etc.), `dark:`; classes de CSS próprio do
projeto (`home-ink`, `wz-*`, `ai-generate-button`…); valores fora da tabela (ex.: raio em px) → deixar e reportar;
`showcase/` e `shadow-lab.tsx`.

**Relatório obrigatório:** tabela `arquivo:linha | classe antiga | classe nova | função do elemento` para cada troca,
e a lista de ocorrências deixadas de propósito com o motivo.

## Tasks

### Task 1: tokens novos + os 7 componentes de `activeTheme` + remover `UI_THEME`

**Arquivos:** `src/app/globals.css`; `kizuna-core/src/client/lib/ui-theme.ts`; em `kizuna-core/src/client/components/ui-better-soft/`:
`section.tsx`, `color-chip.tsx`, `fab.tsx`, `overlay/modal-panel.tsx`, `select-popover.tsx`, `headers/page-heading.tsx`,
`headers/page-header.tsx`; textos de `kizuna-core/src/client/components/showcase/showcase-sections.ts` que dizem que
raio/sombra/título "vêm do tema ativo".

- [ ] Tokens da tabela acima no bloco FORMA do `globals.css` (`:root` e soft; `--ui-card-bg` só no soft).
- [ ] Mapear o que cada componente lia de `UI_THEME` (classic → soft), sempre preservando o classic:
  - `section` card: `rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6` → raio `--ui-radius-card`,
    borda `--ui-border-w-card`, fundo `--ui-card-bg` (fallback `var(--background)`), sombra `--ui-shadow-card`; padding igual.
  - `section` compact: `rounded-xl border border-border bg-background p-3.5 shadow-sm` → `--ui-radius-card-compact`,
    `--ui-border-w-card`, `--ui-card-bg`, `--ui-shadow-card-compact`.
  - `section` flat: como o card, com sombra `--ui-shadow-card-flat`.
  - `section`: hoje só acrescenta `border` quando recebe `accentColor` (ler o arquivo); o destaque continua funcionando nos dois estilos.
  - `color-chip`: `rounded-lg` → `--ui-radius-control`.
  - `fab`: `h-12 w-12 rounded-full shadow-md` → `h-[var(--ui-fab-size,3rem)] w-[var(--ui-fab-size,3rem)] rounded-full` + sombra `--ui-shadow-fab`.
  - `select-popover` gatilho: `rounded-md border border-border bg-background px-3 py-2` → raio `--ui-radius-field` (borda fica, igual ao `Input`);
    painel: `rounded-md border border-border bg-popover shadow-md` → raio `--ui-radius-popover` (resto fica).
  - `modal-panel` bottom sheet: `w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-lg` → raio
    `--ui-radius-sheet-top`, borda `--ui-border-w-card`, fundo `--ui-card-bg`, sombra `--ui-shadow-sheet`.
  - `page-heading` / `page-header` (escala de título — o spec deixou pro plano; decisão: **prop discreta com default por
    estilo**): mapa local no componente a partir de `ACTIVE_UI_STYLE` — heading classic `2xl`/`bold`, soft `4xl`/`normal`;
    page-header classic `xl`/`semibold`, soft `2xl`/`normal` (os mesmos valores de hoje).
- [ ] Remover `UI_THEME`, `activeTheme`, `UiThemeTokens` e o import de tipo que só eles usavam de `ui-theme.ts`; manter
  `UiStyle`, `UI_STYLES`, `resolveUiStyle`, `ACTIVE_UI_STYLE`. Tirar o comentário `// soft-theme: lê activeTheme` do topo dos 7.
- [ ] `grep -rn "activeTheme\|UI_THEME" kizuna-core/src src` → vazio. `npx tsc --noEmit`; vitest de `ui-theme.test.ts`.

### Task 2: `ui-better-soft/` — formulários e listas

`google-form/address-google-form.tsx`, `lists/icon-choice-grid.tsx`, `lists/entity-grid-list.tsx`, `lists/chip-toggle-list.tsx`,
`lists/listing-result-card.tsx`, `lists/filter-stat-card.tsx`, `lists/entity-list-card.tsx`, `lists/media-result-card.tsx`,
`lists/empty-state-card.tsx`, `forms/number-field.tsx`, `forms/form-field.tsx`. Aplicar a tabela de regras.

### Task 3: `ui-better-soft/` — resto

`chat-better-soft.tsx`, `stepper.tsx`, `icon-carousel.tsx`, `section-illustration.tsx`, `inline-alert.tsx`, `choice-card.tsx`,
`channel-chip.tsx`, `fixed-bottom-progress.tsx`, `toggle-row.tsx`, `system-config-section.tsx`, `schedule-row.tsx`,
`overlay/confirm-dialog.tsx`, `mosaic-grid.tsx`, `experience-pill.tsx`. Aplicar a tabela de regras.

### Task 4: domínio — auth, header, shell

Em `kizuna-core/src/client/components/`: `login-page.tsx`, `register-page.tsx`, `forgot-password-page.tsx`,
`reset-password-page.tsx`, `auth/`, `kizuna-header.tsx`, `topbar.tsx`, `topbar-compact.tsx`, `location-modal.tsx`,
`preferences-fab.tsx`, `panel-shell.tsx`, `weather/`, `onboarding/`, `account-levels/`, `captcha/`. Tabela de regras.

### Task 5: domínio — telas genéricas

`resource-screen.tsx`, `wrappers/`, `list-block.tsx`, `dynamic-field.tsx`, `dynamic-step-form.tsx`, `form-builder/`,
`screen-engine/`, `page-header-block.tsx`, `root-screens/`, `administracao/`, `forms/`, `setup-required-screen.tsx`. Tabela de regras.

### Task 6: domínio — descoberta

`taxonomy/`, `search/`, `swipe/`, `home/`. Tabela de regras.

### Task 7: domínio — serviços e conteúdo

`services/` (inclui `detail/` e `wizard-steps/`), `reviews/`, `storage/`, `wizard/`. Tabela de regras.

### Task 8: domínio — resto do core

`rbac/`, `pages/`, `messaging/`, `agenda-config/`, `ai-assistant/`, e qualquer outro arquivo de `kizuna-core/src/client/components/`
fora de `ui/`, `ui-better-soft/`, `showcase/`, `shadow-lab.tsx` e das Tasks 4–7 que ainda tenha classe da tabela. Tabela de regras.

### Task 9: starter

`src/components/**` e `src/app/**/*.tsx` do kizuna-starter. Tabela de regras.

### Task 10: docs

`kizuna-core/docs/interface/componentes.md`: tokens novos na tabela; tirar a menção a `UI_THEME`/`activeTheme` deprecated;
a tabela de regras resumida para quem escreve componente. Spec: marcar fase 2 como feita. Seguir a skill `documentacao`.

### Verificação (controller)

- Baseline classic capturada **antes** das mudanças, trocando `data-ui-style` para `classic` num iframe do servidor do usuário
  (soft): `/`, `/busca`, `/busca?q=cinema`, `/login`, `/registre-se`, `/descobrir`, `/esqueci-senha`, um `/anuncios/<uid>`.
  Depois de cada lote: diff tem que ser 0, salvo a troca "sem sombra" → lista de sombras transparentes (normalizada).
  Exceção esperada: os 7 da Task 1 liam `activeTheme` (JS, soft no servidor do usuário) — conferidos por equivalência estática.
- Checagem automática de fallback: todo `var(--ui-x,<fallback>)` no código tem fallback igual ao valor do `:root` (ou o token é só-soft).
- `/painel` precisa de login — sem credencial de teste no projeto; revisão visual do painel fica com o usuário.
