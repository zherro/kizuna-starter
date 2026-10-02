import type { NextConfig } from 'next';
import appPkg from './package.json';
import corePkg from './kizuna-core/package.json';

const nextConfig: NextConfig = {
  // EXEMPLO — ajuste conforme o projeto

  // Build standalone para produção em Docker (ver Dockerfile na raiz).
  output: 'standalone',

  // Versões exibidas no rodapé (só pra conferir se o deploy subiu). Inlineadas no build:
  // a env (--build-arg no Docker) sobrescreve; sem ela vale o "version" de cada package.json,
  // que o scripts/publish.sh incrementa a cada push.
  env: {
    APP_VERSION: process.env.APP_VERSION || appPkg.version,
    KIZUNA_CORE_VERSION: process.env.KIZUNA_CORE_VERSION || corePkg.version,
  },

  // Headers de segurança padrão (ver kizuna-core/docs/HARDENING.md §Segurança).
  // CSP não entra aqui por default — exige rollout em Report-Only por projeto.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            // `geolocation=(self)` porque o hook `use-user-location` do core usa
            // `navigator.geolocation`. Ajuste se o projeto não usa.
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(), microphone=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
