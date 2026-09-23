import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';

// Área logada e API ficam fora dos buscadores.
export default function robots(): MetadataRoute.Robots {
  const url = cfg.site?.url ?? 'http://localhost:3000';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/painel', '/api/'] },
    sitemap: `${url}/sitemap.xml`,
  };
}
