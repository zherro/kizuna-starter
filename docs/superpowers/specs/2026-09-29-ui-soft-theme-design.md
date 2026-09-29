# Tema visual `soft` global (design)

Data: 2026-09-29

## Objetivo

Hoje o kit de UI do `kizuna-core` tem dois eixos de tema que não se cruzam direito:

- **Cor** — `data-theme-color` (`blue`, `bora_cuiaba`, `terracotta`...), já funciona bem, cascade CSS puro.
- **Forma** — `UiStyle` (`classic`/`soft`) em `src/client/lib/ui-theme.ts`, um objeto JS (`UI_THEME`) que
  só 7 dos ~28 componentes de `ui-better-soft/` leem. Os primitivos puros de `ui/` (Button, Input, Card,
  Progress, Sheet, Typography...) não participam — são sempre "classic" na prática, com `rounded-md`,
  `border border-border` etc. fixos no `cva`.

Resultado: ligar `NEXT_PUBLIC_UI_STYLE=soft` hoje só muda metade da UI. Este design redefine `soft` para
ser um visual "app" (referência: telas de agendamento estilo Lovable anexadas nesta conversa, qualidade
de execução tipo iFood/Uber) e estende a variação de forma pra **UI inteira**, pelo mesmo mecanismo que
já funciona pra cor: CSS custom properties + atributo no `<html>`, sem JS por componente.

## Não-objetivos

- Toggle de estilo em runtime pelo usuário (fica fixo por deploy, como `NEXT_PUBLIC_UI_STYLE` já é hoje).
- Um terceiro estilo (`app`) — `soft` é redefinido, não duplicado.
- Migrar tudo de uma vez — este spec cobre a infraestrutura + primitivos de `ui/`; os 21 componentes de
  `ui-better-soft/` com valor hardcoded e o passe fino tela a tela ficam pro plano de implementação e
  pra uma fase 2 (prompt separado, rodado depois que a base estiver no ar).

## Decisões

1. **`soft` é redefinido**, não vira um 3º nome. Consumidores que já usam `NEXT_PUBLIC_UI_STYLE=soft`
   herdam o visual novo automaticamente.
2. **Mecanismo: CSS custom properties, não objeto JS.** `ui-theme.ts` deixa de exportar `UI_THEME`/
   `activeTheme` (tokens de classe Tailwind resolvidos em JS). Mantém só `UiStyle`, `resolveUiStyle()` e
   `ACTIVE_UI_STYLE` — usados uma vez, no root layout, pra setar `<html data-ui-style={ACTIVE_UI_STYLE}>`.
   Todo o resto vira `:root { --token: valor-classic }` / `[data-ui-style="soft"] { --token: valor-soft }`
   no `globals.css` do projeto consumidor, e os componentes (em `ui/` **e** `ui-better-soft/`) usam
   `var(--token)` via classe arbitrária do Tailwind (`rounded-[var(--ui-radius-card)]`) em vez de valor
   fixo. Motivo: sem lookup em JS por render, escala pra N estilos futuros só com um bloco CSS novo, e
   cobre `ui/` de graça (hoje fora do sistema).
3. **Resolução server-side, sem flash.** Diferente do `data-theme-color` (que precisa de
   `AppPreferencesProvider` + localStorage porque é escolha do usuário em runtime), `data-ui-style` é
   fixo por deploy — o root layout (Server Component) já pode escrever o atributo direto no HTML, sem
   `useEffect` nem risco de flash/hydration mismatch.
4. **Fundo do tema `bora_cuiaba` mais próximo do branco.** `--background`/`--background-white` passam de
   `oklch(0.978 0.01 80)` para `oklch(0.99 0.005 80)` — mantém o leve calor (hue 80) mas com a intensidade
   das referências (mais perto do branco que o valor atual). Ajuste de cor, vale pra classic e soft.
5. **Fonte de heading configurável por lista curada.** Mesmo padrão de `THEME_COLORS`: um enum fixo de
   fontes pré-registradas via `next/font`, escolhida por config (não é livre/arbitrária). `soft` usa
   `Baloo 2` como default da lista. Detalhe técnico: `--font-display` hoje vive dentro do bloco
   `@theme inline` do `globals.css`, que o Tailwind v4 resolve em build-time — **não segue cascade**, por
   isso hoje é fixo (comentário já existente no arquivo confirma). Fix: `@theme inline` passa a apontar
   pra uma indireção — `--font-display: var(--font-display-active)` — e `--font-display-active` é
   definida fora do `@theme inline`, em `:root`/`[data-display-font="baloo"]`, blocos normais que seguem
   cascade igual a `data-theme-color` já faz.

## Contrato de tokens (CSS custom properties)

Definidos em `globals.css` do projeto consumidor (mesmo arquivo que já tem os blocos de `data-theme-color`).
Prefixo `--ui-` pra não colidir com os tokens de cor existentes (`--primary`, `--border` etc.).

| Token | `:root` (classic, valor atual) | `[data-ui-style="soft"]` |
|---|---|---|
| `--ui-radius-card` | `1rem` (rounded-2xl) | `1.75rem` |
| `--ui-radius-card-compact` | `0.75rem` (rounded-xl) | `1rem` |
| `--ui-radius-pill` | `0.375rem` (rounded-md, botão shadcn padrão) | `9999px` |
| `--ui-radius-sheet-top` | `1rem` | `1.75rem` |
| `--ui-border-w-card` | `1px` | `0px` |
| `--ui-border-w-chip` | `1px` | `1px` (chip não-selecionado mantém contorno fino mesmo no soft) |
| `--ui-shadow-card` | valor literal do utilitário `shadow-sm` | `var(--shadow-soft-2)` — sombra difusa e leve (revisto em 2026-09-29: sem sombra os cards sumiam no fundo) |
| `--ui-shadow-sheet` | `var(--shadow-lg)` | `var(--shadow-lg)` |
| `--ui-font-display-active` | `var(--font-quicksand)...` | `var(--font-baloo)...` |

Não incluído nesta tabela (fica pro plano, porque depende de decisão de implementação sobre a API do
componente `Typography`, que hoje recebe `size`/`weight` como props discretas, não classes CSS livres):
escala de heading (`headingTitleSize/Weight`, `pageHeaderTitleSize/Weight` do `UI_THEME` antigo). O plano
decide se migra para `var(--ui-heading-size)` via classe arbitrária ou mantém prop discreta com default
diferente por estilo.

## Padrões de componente vistos nas referências (Lovable)

- **Cards de lista** (compromisso, item): sem borda, sombra difusa leve (`--shadow-soft-1`) — branco
  sobre o fundo, raio grande (`--ui-radius-card-compact`).
- **Botão primário**: pill sólido (`--ui-radius-pill` = `9999px` no soft).
- **Botão secundário**: pill branco + ícone.
- **Botão terciário**: texto puro, sem fundo/borda.
- **Chip de seleção**: não marcado = contorno fino + fundo card; marcado = preenchido sólido, sem borda.
- **Badge de hora/status**: círculo pastel por tom semântico — reaproveita `color-chip.tsx` (já lê tema),
  provável só ajuste de token, não componente novo.
- **Progress bar**: fina, `rounded-full`, fill na cor primária sobre trilho `--muted`.
- **Bottom sheet**: cantos superiores bem arredondados (`--ui-radius-sheet-top`) + alça (drag handle)
  centralizada no topo.
- **Empty state**: única superfície com borda visível de propósito — `border-dashed`, sinaliza placeholder.
- **Eyebrow label**: caixa alta, `tracking-wide`, `text-muted-foreground`.

## Escopo de migração

- **`ui/` (primitivos)** — hoje zero tokenizados, todos precisam trocar valor fixo por `var(--ui-*)`:
  `button.tsx`, `badge.tsx`, `progress.tsx`, `sheet.tsx`, `typography.tsx`, `input.tsx`, `card.tsx`,
  `select.tsx` (lista completa fecha no plano, com grep de `rounded-`/`border-border`/`shadow-` em cada
  arquivo).
- **`ui-better-soft/`** — os 7 componentes que já leem `activeTheme` (JS) migram pra ler os tokens CSS em
  vez do objeto; os 21 restantes (hoje com `border`/`rounded-*` fixo) migram junto, mesmo esforço.
- **Fontes** — registrar `Baloo 2` via `next/font` (provavelmente em `layout.tsx` do consumidor, ao lado
  de Quicksand/Bricolage/Eczar já carregadas), criar o enum curado (`DISPLAY_FONTS`, espelhando
  `THEME_COLORS`) e o mecanismo de indireção do `--font-display`.
- **Config** — nova chave em `kizuna.config.json` (nome exato decidido no plano) pra escolher a fonte da
  lista curada, resolvida server-side igual a `theme.default`.
- **`bora_cuiaba`** — ajuste de `--background`/`--background-white` no bloco existente do `globals.css`.

## Rollout

1. **Fase 1 (este plano)**: infraestrutura — tokens CSS, atributo `data-ui-style` no layout, mecanismo de
   fonte configurável, migração de `ui/` inteiro + ajuste do `bora_cuiaba`.
2. **Fase 2**: migrar os 21 componentes pendentes de `ui-better-soft/` pros tokens novos.
3. **Fase 3**: passe fino tela a tela contra as referências reais do app (`/painel`, `/anuncios`, wizard
   de serviço) — candidato a um prompt separado pra rodar em sessão(ões) do Opus, uma vez que a fase 1/2
   estejam no ar. Esse prompt é produzido depois, não faz parte deste spec.

## Testagem

- Verificação existente do skill `documentacao` não se aplica aqui (isso não é doc, é código) — mas se
  este trabalho gerar página nova em `docs/interface/` (ex.: explicando o sistema de tema), roda a
  verificação de links/SUMMARY.md do skill `documentacao` nela.
- Visual: `NEXT_PUBLIC_UI_STYLE=classic` não pode mudar de aparência (regressão zero) — é o valor default
  hoje em produção fora deste projeto. `NEXT_PUBLIC_UI_STYLE=soft` no `kizuna-starter` é o caso de teste
  real, comparado lado a lado com as referências do Lovable.
- Sem teste automatizado de CSS/visual novo previsto — checagem manual via preview (`/painel`, home,
  wizard) nos dois valores de `NEXT_PUBLIC_UI_STYLE`.
