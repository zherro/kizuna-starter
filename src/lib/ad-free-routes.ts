// Sem import de config: usado por componente cliente no layout raiz (bundle leve).
/**
 * Rotas sem nenhum anúncio (nem Google): telas de autenticação. Também deixam de carregar o
 * `adsbygoogle.js`, então os anúncios automáticos do AdSense não aparecem nelas ao abrir a URL.
 */
export const AD_FREE_ROUTES = ['/login', '/registre-se', '/esqueci-senha', '/redefinir-senha', '/verificar-email'] as const;

export function isAdFreeRoute(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return AD_FREE_ROUTES.some((r) => p === r || p.startsWith(`${r}/`));
}
