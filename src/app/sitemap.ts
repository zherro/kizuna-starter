import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';

// Páginas públicas. Adicione aqui as rotas públicas do seu app.
export default function sitemap(): MetadataRoute.Sitemap {
  const url = cfg.site?.url ?? 'http://localhost:3000';
  return [{ url: `${url}/`, changeFrequency: 'daily', priority: 1 }];
}
