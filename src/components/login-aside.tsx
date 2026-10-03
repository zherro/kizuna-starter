import Link from 'next/link';
import { LoginArt } from '@/components/login-art';
import { cn } from '@kizuna/core/lib/utils';

const LINK = 'font-semibold text-primary hover:underline';

/**
 * Explicações da tela de login, em linguagem simples. No desktop ficam à esquerda com a
 * ilustração; no celular aparecem abaixo do formulário, sem a ilustração. Os termos que levam a
 * outra tela são links no próprio texto. Server component (só usa `next/link`).
 */
export function LoginAside({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <ul className="max-w-sm space-y-4 md:max-w-md">
        <li className="border-l-2 border-primary/50 pl-4 text-sm text-muted-foreground md:text-base">
          <strong className="font-semibold text-foreground">Já tem conta?</strong> Digite seu email
          e sua senha e toque em Entrar.
        </li>
        <li className="border-l-2 border-primary/50 pl-4 text-sm text-muted-foreground md:text-base">
          <strong className="font-semibold text-foreground">Primeira vez aqui?</strong> Toque em{' '}
          <Link href="/registre-se" className={LINK}>
            Criar conta
          </Link>
          . É rápido.
        </li>
        <li className="border-l-2 border-primary/50 pl-4 text-sm text-muted-foreground md:text-base">
          <strong className="font-semibold text-foreground">Esqueceu a senha?</strong> Toque em{' '}
          <Link href="/esqueci-senha" className={LINK}>
            Esqueci minha senha
          </Link>{' '}
          e a gente te ajuda a criar outra.
        </li>
      </ul>
      <LoginArt className="hidden max-w-[18rem] md:block" />
    </div>
  );
}
