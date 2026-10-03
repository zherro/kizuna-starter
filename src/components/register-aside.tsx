import { Typography } from '@kizuna/core/client/components/ui/typography';
import { RegisterArt } from '@/components/register-art';

/**
 * Ilustração, título e slogan da tela de cadastro. No desktop ficam à esquerda; no celular,
 * abaixo do formulário. A ilustração vem sempre acima do texto.
 */
export function RegisterAside() {
  return (
    <div className="flex flex-col gap-8">
      <RegisterArt className="max-w-[16rem] md:max-w-[22rem]" />
      <div className="space-y-3">
        <Typography.H1 size="5xl" font="display" weight="bold" className="leading-[1.1] tracking-tight">
          Conecte-se ao que acontece
        </Typography.H1>
        <Typography.P size="lg" color="muted" className="leading-tight">
          Unindo ideias, pessoas e experiências.
        </Typography.P>
      </div>
    </div>
  );
}
