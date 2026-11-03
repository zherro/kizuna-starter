#!/usr/bin/env node
// scripts/regerar-miniaturas.mjs
//
// Gera a miniatura (`files.thumb_content`, servida em `/api/public/storage/files/<id>/content?size=thumb`
// e usada nos cards da busca/home) das imagens que NÃO têm uma (em geral as gravadas direto no banco
// por importadores ou crawlers, sem passar pelo `sharp` do upload) e das que têm uma miniatura
// DESATUALIZADA: cada miniatura é marcada com a medida usada (`thumb_spec` = `<lado>q<qualidade>`,
// ex. `360q60`, e `thumb_at`); sem marca ou com outra medida que a do preset atual, é refeita.
// Quem já está na medida atual é pulado; sem candidatas o script termina logo ("nada a fazer"), sem ler
// `content`. Pode rodar de forma recorrente. Requer a migration storage/0007 (db/extras/atualizar-storage-0007.sql).
//
// Só LÊ por padrão (simulação): mostra o que faria e o ganho. Nada é gravado sem --aplicar.
// Nunca apaga nem troca o arquivo original (`content`), salvo com --otimizar-original.
// Toda execução (simulação, --aplicar e --conferir) termina com um bloco "Resumo" das imagens ativas
// e a linha "Total de imagens otimizadas: N de M". Saída 0 em sucesso; 1 se alguma imagem deu erro.
//
// Uso:
//   DATABASE_URL=... node scripts/regerar-miniaturas.mjs                  # simulação
//   DATABASE_URL=... node scripts/regerar-miniaturas.mjs --aplicar        # grava as miniaturas
//   ... --limite 20                      # só as 20 maiores (teste)
//   ... --preset xl|lg|md|sm|xs          # preset da miniatura (padrão: kizuna.config.json → images.thumbPreset)
//   ... --lado 360 --qualidade 60        # (opcional) sobrepõem o lado e a qualidade do preset
//   ... --conferir                       # só relatório (sem sharp, sem gravar): situação das imagens + primeiras a processar
//   ... --forcar                         # ignora a marca: refaz todas as que têm miniatura ou valem ter
//   ... --minimo-kb 60                   # sem miniatura, só vale ter se pesa mais que isto (padrão 60), não é WebP ou passa do lado
//   ... --otimizar-original              # (opcional) recomprime o original em WebP 1600 q80 (mexe no `content`)

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadThumbPreset, makeThumb, thumbSpec } from './lib/thumb-preset.mjs';

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
  conferir: has('--conferir'),
  forcar: has('--forcar') || has('--todas'),
  otimizarOriginal: has('--otimizar-original'),
  limite: Number(val('--limite', 0)) || 0,
  minimoKb: Number(val('--minimo-kb', 60)),
};
// Preset (kizuna.config.json → images.thumbPreset); --preset/--lado/--qualidade sobrepõem.
const presetFlag = val('--preset', undefined);
if (presetFlag && !/^(xl|lg|md|sm|xs)$/.test(presetFlag)) fail('--preset deve ser xl, lg, md, sm ou xs');
const ladoFlag = val('--lado', undefined);
const qualFlag = val('--qualidade', undefined);
const preset = loadThumbPreset(ROOT, {
  name: presetFlag,
  side: ladoFlag ? Number(ladoFlag) : undefined,
  quality: qualFlag ? Number(qualFlag) : undefined,
});
opts.lado = preset.side;
opts.qualidade = preset.quality;
if (has('--todas')) console.warn('aviso: --todas está obsoleta; use --forcar (mesmo efeito).');
if (!process.env.DATABASE_URL) fail('defina DATABASE_URL');
if (!(opts.lado >= 200 && opts.lado <= 1600)) fail('--lado fora de 200..1600');
if (!(opts.qualidade >= 30 && opts.qualidade <= 95)) fail('--qualidade fora de 30..95');

const kb = (n) => `${Math.round(n / 1024)} kB`;
const spec = thumbSpec(preset);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// A marca da medida exige a migration storage/0007; não roda DDL por conta própria.
const { rows: cols } = await client.query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'files' AND column_name IN ('thumb_spec', 'thumb_at')`
);
if (cols.length < 2) {
  await client.end();
  fail('faltam as colunas files.thumb_spec/thumb_at. Aplique db/extras/atualizar-storage-0007.sql (migration storage/0007) e rode de novo.');
}

// "Vale ter" miniatura: não-WebP, pesada (> minimoKb) ou com algum lado maior que a miniatura.
const VALE = `(mime_type <> 'image/webp' OR size_bytes > $2 OR width > $3 OR height > $3)`;
// Candidatas: sem miniatura e vale ter, OU com miniatura de outra medida/sem marca. --forcar ignora a marca.
const CANDIDATA = `(CASE WHEN $4::boolean THEN (thumb_content IS NOT NULL OR ${VALE})
       WHEN thumb_content IS NULL THEN ${VALE}
       ELSE thumb_spec IS DISTINCT FROM $1 END)`;
const params = [spec, opts.minimoKb * 1024, opts.lado, opts.forcar];

/** Bloco "Resumo": UMA consulta agregada sobre as imagens ativas. `nota` = linha sobre esta execução. */
async function resumo(nota) {
  const { rows: [c] } = await client.query(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE thumb_content IS NOT NULL AND thumb_spec = $1) AS na_medida,
            count(*) FILTER (WHERE thumb_content IS NOT NULL AND thumb_spec IS NOT NULL AND thumb_spec <> $1) AS desatualizada,
            count(*) FILTER (WHERE thumb_content IS NOT NULL AND thumb_spec IS NULL) AS sem_marca,
            count(*) FILTER (WHERE thumb_content IS NULL AND ${VALE}) AS sem_mini_vale,
            count(*) FILTER (WHERE thumb_content IS NULL AND NOT ${VALE}) AS sem_mini_dispensa
       FROM public.files
      WHERE active AND mime_type LIKE 'image/%'`,
    params.slice(0, 3)
  );
  console.log(
    `\nResumo (imagens ativas; spec configurado: ${spec}, preset ${preset.name})\n` +
      `  total de imagens ativas:         ${c.total}\n` +
      `  otimizadas (na medida ${spec}):  ${c.na_medida}\n` +
      `  desatualizadas (outra medida):   ${c.desatualizada}\n` +
      `  sem marca (miniatura sem spec):  ${c.sem_marca}\n` +
      `  sem miniatura mas valem ter:     ${c.sem_mini_vale}\n` +
      `  sem miniatura e dispensam:       ${c.sem_mini_dispensa}\n` +
      (nota ? `  ${nota}\n` : '') +
      `  (otimizadas = na medida + as que dispensam miniatura: pequenas e já em WebP leve)\n` +
      `Total de imagens otimizadas: ${Number(c.na_medida) + Number(c.sem_mini_dispensa)} de ${c.total}`
  );
  return c;
}

console.log(`preset ${preset.name} → ${spec}`);

if (opts.conferir) {
  // Somente relatório: nada é gerado nem gravado (sem sharp, sem ler `content`).
  const { rows: lista } = await client.query(
    `SELECT id, original_name, size_bytes, thumb_spec, (thumb_content IS NULL) AS sem_mini
       FROM public.files
      WHERE active AND mime_type LIKE 'image/%'
        AND ((thumb_content IS NOT NULL AND thumb_spec IS DISTINCT FROM $1) OR (thumb_content IS NULL AND ${VALE}))
      ORDER BY size_bytes DESC LIMIT 20`,
    params.slice(0, 3)
  );
  if (lista.length) {
    console.log('\nPrimeiras (maiores) a processar:');
    for (const r of lista) {
      console.log(`  ${r.id.slice(0, 8)} ${r.original_name.padEnd(34).slice(0, 34)} ${kb(r.size_bytes)}  spec atual: ${r.sem_mini ? '(sem miniatura)' : (r.thumb_spec ?? '(sem marca)')}`);
    }
  }
  const c = await resumo();
  const aProcessar = Number(c.desatualizada) + Number(c.sem_marca) + Number(c.sem_mini_vale);
  console.log(`${aProcessar} imagem(ns) seriam processadas por padrão (spec configurado: ${spec}).`);
  await client.end();
  process.exit(0);
}

// Candidatas SEM trazer bytea: o `content` só é lido por imagem, dentro do laço.
const { rows } = await client.query(
  `SELECT id, original_name, mime_type, size_bytes, width, height, thumb_size_bytes, thumb_spec
     FROM public.files
    WHERE active AND mime_type LIKE 'image/%' AND ${CANDIDATA}
    ORDER BY size_bytes DESC
    ${opts.limite ? 'LIMIT ' + opts.limite : ''}`,
  params
);

if (!rows.length) {
  console.log('nada a fazer: nenhuma imagem desatualizada ou sem miniatura.');
  await resumo('processadas nesta execução: 0');
  await client.end();
  process.exit(0);
}

console.log(
  `${opts.aplicar ? 'APLICANDO' : 'SIMULAÇÃO (nada será gravado)'} — ${rows.length} imagem(ns); preset ${preset.name}: miniatura ${opts.lado}px q${opts.qualidade}` +
    (opts.forcar ? ' (--forcar: ignora a marca)' : '') +
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
    const thumb = await makeThumb(sharp, buf, preset);

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
        `${r.mime_type.replace('image/', '').padEnd(4)} ${r.width}x${r.height} ${kb(r.size_bytes)} -> miniatura [${r.thumb_spec ?? 'sem marca'} → ${spec}] ${thumb.info.width}x${thumb.info.height} ${kb(thumb.data.length)}` +
        (full ? ` | original -> webp ${kb(full.data.length)}` : '')
    );

    if (opts.aplicar) {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.files
            SET thumb_content = $2, thumb_size_bytes = $3, thumb_width = $4, thumb_height = $5,
                thumb_spec = $6, thumb_at = now(), updated_at = now()
          WHERE id = $1`,
        [r.id, thumb.data, thumb.data.length, thumb.info.width, thumb.info.height, spec]
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
// Em --aplicar a consulta roda DEPOIS de gravar, então o total reflete o resultado.
await resumo(`${opts.aplicar ? 'gravadas' : 'seriam processadas'} nesta execução: ${feitas}${erros ? ` (${erros} com erro)` : ''}`);
await client.end();
process.exit(erros ? 1 : 0);
