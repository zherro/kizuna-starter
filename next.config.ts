import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // EXEMPLO — ajuste conforme o projeto

  // Build standalone para produção em Docker (ver Dockerfile na raiz).
  output: 'standalone',

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
