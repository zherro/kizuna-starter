'use client';

import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { useA11yPrefs } from './prefs';

/** Controle discreto do tamanho da letra (A−, nível atual, A+): uma linha, sem cartão nem título grande. */
export function A11yBar() {
  const { messages } = useAppPreferences();
  const t = messages.election;
  const a = useA11yPrefs();
  const levels = [t.fontLevel0, t.fontLevel1, t.fontLevel2];

  return (
    <div
      role="group"
      aria-label={t.a11yFontLabel}
      className="flex shrink-0 items-center gap-1 text-base text-muted-foreground"
    >
      <span className="mr-1">{t.a11yFontLabel}:</span>
      <button
        type="button"
        className="el-tool-sm"
        onClick={() => a.setFont(-1)}
        disabled={!a.canSmaller}
        aria-label={t.fontSmaller}
      >
        <span aria-hidden="true">A−</span>
      </button>
      <span className="min-w-[5.5rem] text-center text-foreground" aria-live="polite">
        {levels[a.prefs.font]}
      </span>
      <button
        type="button"
        className="el-tool-sm"
        onClick={() => a.setFont(1)}
        disabled={!a.canLarger}
        aria-label={t.fontLarger}
      >
        <span aria-hidden="true">A+</span>
      </button>
    </div>
  );
}
