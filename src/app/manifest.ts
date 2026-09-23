import { existsSync } from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import cfg from '@/../kizuna.config.json';

// Manifest do PWA — nome/cores vêm do kizuna.config.json ("site" e "theme").
// Ícones em public/icon/ (icon-192.png, icon-512.png, icon-maskable-512.png);
// os que não existirem ficam de fora.
const ICONS: NonNullable<MetadataRoute.Manifest['icons']> = [
  { src: '/icon/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export default function manifest(): MetadataRoute.Manifest {
  const color = cfg.theme?.metaColor ?? '#2563eb';
  return {
    name: cfg.site?.name ?? 'Kizuna',
    short_name: cfg.site?.shortName ?? cfg.site?.name ?? 'Kizuna',
    description: cfg.site?.description,
    lang: cfg.site?.lang ?? 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: color,
    theme_color: color,
    icons: ICONS.filter((i) => existsSync(path.join(process.cwd(), 'public', i.src))),
  };
}
