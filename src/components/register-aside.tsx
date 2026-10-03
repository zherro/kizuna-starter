import { RegisterArt } from '@/components/register-art';

/**
 * Título, slogan e ilustração da tela de cadastro. No desktop ficam à esquerda; no celular,
 * abaixo do formulário e sem a ilustração.
 */
export function RegisterAside() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <h1 className="font-display text-[1.4rem] leading-[1.1] font-bold tracking-tight text-foreground md:text-4xl">
          Conecte-se ao que acontece
        </h1>
        <p className="text-[2rem] leading-tight text-muted-foreground md:text-4xl">
          Unindo ideias, pessoas e experiências.
        </p>
      </div>
      <RegisterArt className="hidden max-w-[22rem] md:block" />
    </div>
  );
}
