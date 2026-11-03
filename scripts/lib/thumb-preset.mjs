// scripts/lib/thumb-preset.mjs
//
// Miniatura (`files.thumb_content`) pelo preset de kizuna.config.json → images.thumbPreset
// (xl|lg|md|sm|xs). Os valores ficam em kizuna-core/src/shared/image/thumb-presets.json (fonte única,
// a mesma do upload do core). Usado pelos importadores e pelo regerar-miniaturas.

import fs from 'node:fs';
import path from 'node:path';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Resolve o preset em uso: `override` ({ name } e/ou { side, quality }, vindo de flags) vence o
 * kizuna.config.json; nome desconhecido (ou ausente) cai no `default` do JSON de presets.
 * @returns {{ name: string, side: number, quality: number }}
 */
export function loadThumbPreset(root, override = {}) {
  const { default: padrao, presets } = readJson(path.join(root, 'kizuna-core', 'src', 'shared', 'image', 'thumb-presets.json'));
  const cfg = readJson(path.join(root, 'kizuna.config.json'));
  let name = override.name ?? cfg.images?.thumbPreset;
  if (!Object.prototype.hasOwnProperty.call(presets, name)) name = padrao;
  const base = presets[name];
  return {
    name,
    side: override.side ?? base.side,
    quality: override.quality ?? base.quality,
  };
}

/** WebP do preset: maior lado = `side`, proporção mantida, sem ampliar. Devolve { data, info }. */
export function makeThumb(sharp, buf, preset) {
  return sharp(buf)
    .rotate()
    .resize(preset.side, preset.side, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: preset.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
}

/** Só vale miniatura se a imagem passa de `side` em algum lado, não é WebP ou pesa mais de 60 kB. */
export function needsThumb({ mime, size, width, height }, preset) {
  return Math.max(width ?? 0, height ?? 0) > preset.side || mime !== 'image/webp' || size > 60 * 1024;
}
