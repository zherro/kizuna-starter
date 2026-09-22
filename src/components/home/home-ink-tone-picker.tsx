'use client';

import { HOME_INK_LEVELS, type HomeInkLevel } from './home-ink-config';

// Dev-only control — see HOME_INK_TONE_PICKER_ENABLED in home-ink-config.ts.
// Lets you click through the 5 tone levels live to settle on one, then you flip
// the flag and hardcode HOME_INK_FIXED_LEVEL to what you picked.
export function HomeInkTonePicker({
  level,
  onChange,
}: {
  level: HomeInkLevel;
  onChange: (level: HomeInkLevel) => void;
}) {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lg">
      <span className="pl-2 pr-1 text-xs text-muted-foreground">tom</span>
      {HOME_INK_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === level}
          onClick={() => onChange(l)}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
            l === level
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
