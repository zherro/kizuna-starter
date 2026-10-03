'use client';

import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Count-up leve: anima do valor exibido até `target` (easing cúbico). Na primeira exibição conta
 * a partir de 0. Com prefers-reduced-motion do sistema, mostra o valor direto.
 */
export function useCountUp(target: number, duration = 700, animate = true): number {
  const [value, setValue] = useState(() => (!animate || prefersReducedMotion() ? target : 0));
  const shown = useRef(value);

  useEffect(() => {
    if (!animate || prefersReducedMotion() || !Number.isFinite(target)) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    // Aba oculta: o navegador pausa o requestAnimationFrame e o número ficaria preso no valor antigo.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      shown.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      shown.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Rede de segurança: se o rAF for pausado no meio, o valor final aparece mesmo assim.
    const done = setTimeout(() => {
      shown.current = target;
      setValue(target);
    }, duration + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, duration, animate]);

  return value;
}

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const v = useCountUp(value, 700);
  return <span className={className}>{format(v)}</span>;
}
