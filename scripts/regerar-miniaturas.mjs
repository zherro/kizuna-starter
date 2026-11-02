#!/usr/bin/env node
// scripts/regerar-miniaturas.mjs
//
// Gera a miniatura (`files.thumb_content`, servida em `/api/public/storage/files/<id>/content?size=thumb`
// e usada nos cards da busca/home) das imagens que NÃO têm uma — em geral as gravadas direto no banco
// por importadores (ex. lugares-para-servicos.mjs) sem passar pelo `sharp` do upload. Sem miniatura a
// rota devolve o original inteiro (JPEG de 1600 px e ~480 kB num card de ~270 px).
//
// Só LÊ por padrão (simulação): mostra o que faria e o ganho. Nada é gravado sem --aplicar.
// Nunca apaga nem troca o arquivo original (`content`), salvo com --otimizar-original.
//
// Uso:
//   DATABASE_URL=... node scripts/regerar-miniaturas.mjs                  # simulação
//   DATABASE_URL=... node scripts/regerar-miniaturas.mjs --aplicar        # grava as miniaturas
//   ... --limite 20                      # só as 20 maiores (teste)
//   ... --lado 480 --qualidade 65        # padrões (mesmos do preset `thumb` do core)
//   ... --todas                          # recria também as que já têm miniatura
//   ... --minimo-kb 60                   # só imagens sem miniatura com mais que isto (padrão 60) ou não-WebP
//   ... --otimizar-original              # (opcional) recomprime o original em WebP 1600 q80 (mexe no `content`)

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(ROOT, 'package.json'));
const sharp = req('sharp');
// `pg` é dependência do CLI do core (kizuna-core/cli), não do app.
const pg = createRequire(path.join(ROOT, 'kizuna-core', 'cli', 'package.json'))('pg');

function fail(msg) {
  console.error(`erro: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const opts = {
  aplicar: has('--aplicar'),
  todas: has('--todas'),
  otimizarOriginal: has('--otimizar-original'),
  limite: Number(val('--limite', 0)) || 0,
  lado: Number(val('--lado', 480)),
  qualidade: Number(val('--qualidade', 65)),
  minimoKb: Number(val('--minimo-kb', 60)),
};
if (!process.env.DATABASE_URL) fail('defina DATABASE_URL');
if (!(opts.lado >= 200 && opts.lado <= 1600)) fail('--lado fora de 200..1600');
if (!(opts.qualidade >= 30 && opts.qualidade <= 95)) fail('--qualidade fora de 30..95');

const kb = (n) => `${Math.round(n / 1024)} kB`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Candidatas: imagens ativas, sem miniatura (ou todas), e que "valem" a miniatura: não-WebP ou pesadas.
const { rows } = await client.query(
  `SELECT id, original_name, mime_type, size_bytes, width, height, thumb_size_bytes
     FROM public.files
    WHERE active AND mime_type LIKE 'image/%'
      AND ($1::boolean OR thumb_content IS NULL)
      AND (mime_type <> 'image/webp' OR size_bytes > $2)
    ORDER BY size_bytes DESC
    ${opts.limite ? 'LIMIT ' + opts.limite : ''}`,
  [opts.todas, opts.minimoKb * 1024]
);

console.log(
  `${opts.aplicar ? 'APLICANDO' : 'SIMULAÇÃO (nada será gravado)'} — ${rows.length} imagem(ns); miniatura ${opts.lado}px q${opts.qualidade}` +
    (opts.otimizarOriginal ? ' + otimizar original' : '')
);

let antes = 0;
let depois = 0;
let feitas = 0;
let erros = 0;

for (const r of rows) {
  try {
    const { rows: [f] } = await client.query('SELECT content FROM public.files WHERE id = $1', [r.id]);
    const buf = f?.content;
    if (!buf || !buf.length) {
      console.log(`  pulada  ${r.id.slice(0, 8)} ${r.original_name}: sem conteúdo`);
      continue;
    }
    const thumb = await sharp(buf, { animated: false })
      .rotate()
      .resize(opts.lado, opts.lado, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: opts.qualidade, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    let full = null;
    if (opts.otimizarOriginal) {
      full = await sharp(buf, { animated: false })
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      // só troca o original se realmente ficar menor
      if (full.data.length >= buf.length * 0.9) full = null;
    }

    antes += r.size_bytes;
    depois += thumb.data.length;
    console.log(
      `  ${opts.aplicar ? 'ok     ' : 'faria  '} ${r.id.slice(0, 8)} ${r.original_name.padEnd(34).slice(0, 34)} ` +
        `${r.mime_type.replace('image/', '').padEnd(4)} ${r.width}x${r.height} ${kb(r.size_bytes)} -> miniatura ${thumb.info.width}x${thumb.info.height} ${kb(thumb.data.length)}` +
        (full ? ` | original -> webp ${kb(full.data.length)}` : '')
    );

    if (opts.aplicar) {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.files
            SET thumb_content = $2, thumb_size_bytes = $3, thumb_width = $4, thumb_height = $5,
                updated_at = now()
          WHERE id = $1`,
        [r.id, thumb.data, thumb.data.length, thumb.info.width, thumb.info.height]
      );
      if (full) {
        await client.query(
          `UPDATE public.files
              SET content = $2, mime_type = 'image/webp', size_bytes = $3, width = $4, height = $5,
                  optimized_at = now(), updated_at = now()
            WHERE id = $1`,
          [r.id, full.data, full.data.length, full.info.width, full.info.height]
        );
      }
      await client.query('COMMIT');
    }
    feitas++;
  } catch (e) {
    erros++;
    if (opts.aplicar) await client.query('ROLLBACK').catch(() => undefined);
    console.error(`  ERRO    ${r.id.slice(0, 8)} ${r.original_name}: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(
  `\n${feitas} imagem(ns) ${opts.aplicar ? 'atualizada(s)' : 'a atualizar'}, ${erros} erro(s). ` +
    `Peso servido nos cards: ${kb(antes)} -> ${kb(depois)}` +
    (opts.aplicar ? '' : '\nRode de novo com --aplicar para gravar.')
);
await client.end();
