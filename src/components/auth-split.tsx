import type { ReactNode } from 'react';

/**
 * Casca das telas de entrada (login e cadastro): explicações + ilustração à esquerda, formulário
 * "soft" à direita, sobre um círculo na cor do tema. No celular o formulário vem primeiro e as
 * explicações ficam abaixo. Ocupa toda a altura útil (`data-fill`, ver `<main>` em layout.tsx).
 * Server component.
 */
export function AuthSplit({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div data-fill className="relative isolate flex w-full flex-1 items-center overflow-hidden">
      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
        {/*
          Círculo do tema. No desktop é gigante (240vh) e a borda direita fica fixa atrás do
          formulário, então ele só cresce para a esquerda e cobre toda a altura da tela.
        */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-[62%] rounded-full bg-primary/[0.06] md:top-1/2 md:right-[12rem] md:left-auto md:h-[240vh] md:w-[240vh] md:translate-x-0 md:-translate-y-1/2"
        />
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 md:order-1">{aside}</div>
          <div className="order-1 md:order-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
