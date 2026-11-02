import { NextResponse, type NextRequest } from 'next/server';
import { createKizunaProxy } from '@kizuna/core/server/proxy';
import { CITY_COOKIE } from '@kizuna/core/shared/city-routing/city-slug';
import { resolveHomeRedirect } from '@/lib/home-redirect';
import cfg from '@/../kizuna.config.json';

const base = createKizunaProxy({
  protectedPrefixes: ['/painel'],
  authPages: ['/login', '/registre-se'],
});

const location = (cfg as { location?: { outsideList?: string; defaultCitySlug?: string } }).location;

// `/` → cidade (cookie `kz_city` ou padrão do config) direto no proxy, sem banco nem render.
// O slug do cookie só é validado por formato; se a cidade não existir, a própria rota /[cidade] dá 404/redireciona.
export const proxy = async (req: NextRequest) => {
  if (req.nextUrl.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    const to = resolveHomeRedirect({
      cookie: req.cookies.get(CITY_COOKIE)?.value,
      outsideList: location?.outsideList,
      defaultCitySlug: location?.defaultCitySlug,
    });
    if (to) {
      const url = req.nextUrl.clone();
      url.pathname = to;
      const res = NextResponse.redirect(url, 307);
      res.headers.set('Vary', 'Cookie');
      res.headers.set('Cache-Control', 'private, no-store');
      return res;
    }
  }
  return base(req);
};

// Roda em tudo (menos assets estáticos e imagens do next) — a trava de ambiente
// do createKizunaProxy precisa cobrir toda rota, não só /painel e /login.
// O matcher TEM que ficar literal aqui para o Next analisar em build.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
