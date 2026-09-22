import type { CSSProperties } from 'react';

// Tuning knob for the "ink" background (hero, featured card, closing CTA band).
// Flip HOME_INK_TONE_PICKER_ENABLED to false once a level feels right, set
// HOME_INK_FIXED_LEVEL to that number, and the on-page toggle disappears —
// the chosen level then applies statically, no JS/localStorage involved.

// 1-5 span the original range (5 == the "before" tone this all started from).
// 6-7 push past it, for testing something even bolder than that.
export const HOME_INK_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
export type HomeInkLevel = (typeof HOME_INK_LEVELS)[number];

export const HOME_INK_TONE_PICKER_ENABLED = true;

// Used only while the picker above is disabled.
export const HOME_INK_FIXED_LEVEL: HomeInkLevel = 6;

export const HOME_INK_STORAGE_KEY = 'foco-total-home-ink-level';

// Per-level values for the custom properties .home-ink reads (globals.css). Applied
// as an inline style on the wrapping <main> (see home-content.tsx) rather than via
// a `[data-home-ink-level]` CSS selector — the selector approach turned out to
// depend on this project's Tailwind/Lightning CSS build picking up a plain
// attribute-scoped rule, which wasn't reliable. Inline styles update the instant
// React re-renders, with no CSS-pipeline dependency.
const HOME_INK_LEVEL_VARS: Record<
  HomeInkLevel,
  { mix: string; base: string; glow: string; glow2: string }
> = {
  1: { mix: '10%', base: '#1c1c22', glow: '22%', glow2: '10%' },
  2: { mix: '15%', base: '#16161c', glow: '28%', glow2: '13%' },
  3: { mix: '19%', base: '#101014', glow: '34%', glow2: '16%' },
  4: { mix: '24%', base: '#0b0b0f', glow: '40%', glow2: '19%' },
  5: { mix: '30%', base: '#08080c', glow: '48%', glow2: '23%' },
  6: { mix: '37%', base: '#050508', glow: '56%', glow2: '27%' },
  7: { mix: '46%', base: '#020204', glow: '64%', glow2: '31%' },
};

export function getHomeInkStyle(level: HomeInkLevel): CSSProperties {
  const v = HOME_INK_LEVEL_VARS[level];
  return {
    '--home-ink-mix': v.mix,
    '--home-ink-base-dark': v.base,
    '--home-ink-glow': v.glow,
    '--home-ink-glow-2': v.glow2,
  } as CSSProperties;
}
