import { NextResponse, type NextRequest } from 'next/server';
import { createKizunaProxy } from '@kizuna/core/server/proxy';
import { CITY_COOKIE } from '@kizuna/core/shared/city-routing/city-slug';
import { resolveHomeRedirect } from '@/lib/home-redirect';
import { buildHostRedirectConfig, hostRedirectTarget } from '@/lib/host-redirect';
import cfg from '@/../kizuna.config.json';

const base = createKizunaProxy({
  protectedPrefixes: ['/painel'],
  authPages: ['/login', '/registre-se'],
});

const location = (cfg as { location?: { outsideList?: string; defaultCitySlug?: string } }).location;

// `seo.redirectHosts` → 301 para `site.url` (ver `@/lib/host-redirect`). Montado uma vez no boot;
// `SEO_HOST_REDIRECT=off` desliga sem mexer no código.
const seo = (cfg as { seo?: { redirectHosts?: string[]; redirectKeepPaths?: string[] } }).seo;
const hostRedirect = buildHostRedirectConfig(
  cfg.site?.url,
  seo?.redirectHosts,
  seo?.redirectKeepPaths,
  process.env.SEO_HOST_REDIRECT
);

// `/` → cidade (cookie `kz_city` ou padrão do config) direto no proxy, sem banco nem render.
// O slug do cookie só é validado por formato; se a cidade não existir, a própria rota /[cidade] dá 404/redireciona.
export const proxy = async (req: NextRequest) => {
  const { pathname, search } = req.nextUrl;
  // Domínio alternativo → canônico (antes de tudo). Checagem barata: um lookup do Host num Set.
  const canonicalTo = hostRedirectTarget(hostRedirect, req.headers.get('host'), pathname, search);
  if (canonicalTo) {
    // 301 em GET/HEAD; 308 nos demais para não virar GET (formulário/POST continua funcionando).
    return NextResponse.redirect(canonicalTo, req.method === 'GET' || req.method === 'HEAD' ? 301 : 308);
  }
  if (pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
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
  const res = await base(req);
  // Busca com filtro/texto na URL: a página é uma casca estática (filtros lidos no cliente), então o
  // `noindex` vai por header — sem tornar a rota dinâmica. A /busca sem query segue indexável.
  if (pathname === '/busca' && search.length > 1) res?.headers.set('X-Robots-Tag', 'noindex, follow');
  return res;
};

// Roda em tudo (menos assets estáticos e imagens do next) — a trava de ambiente
// do createKizunaProxy precisa cobrir toda rota, não só /painel e /login.
// O matcher TEM que ficar literal aqui para o Next analisar em build.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
