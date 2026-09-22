import { createKizunaProxy } from '@kizuna/core/server/proxy';

export const proxy = createKizunaProxy({
  protectedPrefixes: ['/painel'],
  authPages: ['/login', '/registre-se'],
});

// Roda em tudo (menos assets estáticos e imagens do next) — a trava de ambiente
// do createKizunaProxy precisa cobrir toda rota, não só /painel e /login.
// O matcher TEM que ficar literal aqui para o Next analisar em build.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
