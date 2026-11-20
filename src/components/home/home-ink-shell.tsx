'use client';

// Fundo "ink" da home com o seletor de intensidade (`home.inkPicker`): a escolha do usuário fica no
// localStorage, então o estado é do cliente. O conteúdo (`children`) continua vindo do servidor.
// Sem o seletor, a home nem carrega isto: o `<main>` sai pronto do Server Component.
import { useEffect, useState, type ReactNode } from 'react';
import {
  getHomeInkStyle,
  HOME_INK_LEVELS,
  HOME_INK_STORAGE_KEY,
  type HomeInkLevel,
} from './home-ink-config';
import { HomeInkTonePicker } from './home-ink-tone-picker';

export function HomeInkShell({
  defaultLevel,
  className,
  children,
}: {
  defaultLevel: HomeInkLevel;
  className?: string;
  children: ReactNode;
}) {
  const [inkLevel, setInkLevel] = useState<HomeInkLevel>(defaultLevel);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(HOME_INK_STORAGE_KEY));
      if (HOME_INK_LEVELS.includes(saved as HomeInkLevel)) {
        queueMicrotask(() => setInkLevel(saved as HomeInkLevel));
      }
    } catch {
      // localStorage unavailable — keep the fixed default.
    }
  }, []);

  function handleInkLevelChange(level: HomeInkLevel) {
    setInkLevel(level);
    try {
      localStorage.setItem(HOME_INK_STORAGE_KEY, String(level));
    } catch {
      // ignore — the picker still works for this render, just won't persist.
    }
  }

  return (
    <main className={className} data-home-ink-level={inkLevel} style={getHomeInkStyle(inkLevel)}>
      {children}
      <HomeInkTonePicker level={inkLevel} onChange={handleInkLevelChange} />
    </main>
  );
}
