'use client';
import { usePathname } from 'next/navigation';
import { isAdFreeRoute } from '@/lib/ad-free-routes';

/**
 * `adsbygoogle.js` do AdSense, fora das telas de autenticação (login, cadastro, senha, e-mail).
 *
 * Componente cliente só para ler a rota: no SSR o `usePathname` já vem certo, então o HTML do
 * servidor continua levando o script (o React 19 sobe `<script async src>` para o <head>, sem
 * repetir) em todas as outras páginas — e as telas de autenticação saem sem ele, o que também
 * impede os anúncios automáticos de aparecerem ali. O id é o que o `GoogleAd` do core procura
 * antes de injetar o dele.
 */
export function AdsenseScript({ id, src }: { id: string; src: string }) {
  const pathname = usePathname();
  if (isAdFreeRoute(pathname)) return null;
  return <script id={id} async src={src} crossOrigin="anonymous" />;
}
