#!/usr/bin/env node
// scripts/lugares-para-servicos.mjs
//
// Lê os artigos de lugares (content/lugares/<slug>/index.md + fotos em public/lugares/<slug>/) e
// GERA o SQL que os grava como anúncios (public.services) no banco do Kizuna:
// db/extras/lugares_import/lugares_NN.sql (3 lugares por arquivo, em ordem alfabética de slug).
// Não conecta em banco nenhum.
//
// De-para (regras, destinos e o que ficou sem destino): docs/integracoes/lugares-depara.md
//
// Uso:
//   node scripts/lugares-para-servicos.mjs                       # todos, status inicial 'pending'
//   node scripts/lugares-para-servicos.mjs --only lua-morena     # só um lugar
//   node scripts/lugares-para-servicos.mjs --status pending      # status no INSERT (pending|active|paused|archived)
//   node scripts/lugares-para-servicos.mjs --per-file 2          # quantos lugares por arquivo (padrão 3)
//   node scripts/lugares-para-servicos.mjs --out caminho.sql     # tudo num arquivo só (ex.: com --only)
//
// Depois, cada arquivo (são independentes e idempotentes; a ordem não importa):
//   for f in db/extras/lugares_import/*.sql; do node kizuna-core/cli db run "$f"; done

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'lugares');
const MEDIA_DIR = path.join(ROOT, 'public', 'lugares');
const OUT_DIR = path.join(ROOT, 'db', 'extras', 'lugares_import');
const FONTE = 'content/lugares';
const STATUSES = ['pending', 'active', 'paused', 'archived'];
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

// Mapeamento lugar → taxonomia (grupo / categoria / subcategorias). Justificativas no de-para.
// `tag` (opcional): tag de agrupamento gravada em extras.tags; sem ela vale o slug da 1ª subcategoria.
const TAXONOMIA = {
  'lua-morena': { grupo: 'lugares', categoria: 'vida-noturna', subs: ['casas-noturnas'] },
  'seu-francisco-cuiaba-porto': { grupo: 'lugares', categoria: 'vida-noturna', subs: ['bares'] },
  'arena-pantanal': { grupo: 'lugares', categoria: 'esporte', subs: ['estadios-e-arenas'] },
  'goiabeiras-shopping': { grupo: 'lugares', categoria: 'compras', subs: ['shoppings'] },
  'pantanal-shopping': { grupo: 'lugares', categoria: 'compras', subs: ['shoppings'] },
  'shopping-estacao-cuiaba': { grupo: 'lugares', categoria: 'compras', subs: ['shoppings'] },
  'shopping-tres-americas': { grupo: 'lugares', categoria: 'compras', subs: ['shoppings'] },
  'buffet-infantil-mundo-magico': { grupo: 'lugares', categoria: 'festas-e-eventos', subs: ['buffets-infantis'] },
  'espaco-art-festas-e-eventos': { grupo: 'lugares', categoria: 'festas-e-eventos', subs: ['casas-de-festas'] },
  'musiva-cuiaba': { grupo: 'lugares', categoria: 'vida-noturna', subs: ['casas-noturnas'] },
};

// Chaves do formulário `lugares` (db/extras/forms_seed_lugares.sql): gravadas em form_results.answers e
// repetidas em services.extras. O UPDATE remove todas antes de regravar (campo que saiu do artigo some).
const FORM_KEYS = ['horario', 'preco', 'gratuito', 'dicas_chegada', 'contato_telefone', 'contato_whatsapp', 'contato_instagram', 'site'];

// ---------------------------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { status: 'pending', only: null, out: null, perFile: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} precisa de um valor`);
      return v;
    };
    if (a === '--status') opts.status = next();
    else if (a === '--only') opts.only = next();
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--per-file') opts.perFile = Number(next());
    else if (a === '-h' || a === '--help') {
      console.log('uso: node scripts/lugares-para-servicos.mjs [--status pending|active|paused|archived] [--only <slug>] [--per-file N] [--out <arquivo.sql>]');
      process.exit(0);
    } else fail(`opção desconhecida: ${a}`);
  }
  if (!Number.isInteger(opts.perFile) || opts.perFile < 1) fail(`--per-file inválido: ${opts.perFile}`);
  if (!STATUSES.includes(opts.status)) fail(`--status inválido: ${opts.status} (use ${STATUSES.join(', ')})`);
  return opts;
}

function fail(msg) {
  console.error(`erro: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Frontmatter: subconjunto de YAML usado em content/ (chave: valor, aspas opcionais, listas com
// hífen, comentários com #).
// ---------------------------------------------------------------------------------------------
function splitFrontmatter(raw, file) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) fail(`${file}: frontmatter ausente`);
  return { fm: m[1], body: m[2] };
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('"')) {
    const end = findClosingQuote(v, '"');
    return v.slice(1, end).replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c);
  }
  if (v.startsWith("'")) {
    const end = findClosingQuote(v, "'");
    return v.slice(1, end).replace(/''/g, "'");
  }
  const bare = v.replace(/\s+#.*$/, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(bare)) return Number(bare);
  if (bare === 'true') return true;
  if (bare === 'false') return false;
  if (bare === 'null' || bare === '~') return null;
  return bare;
}

function findClosingQuote(v, q) {
  for (let i = 1; i < v.length; i++) {
    if (q === '"' && v[i] === '\\') { i++; continue; }
    if (v[i] === q) {
      if (q === "'" && v[i + 1] === "'") { i++; continue; }
      return i;
    }
  }
  fail(`aspas sem fechamento: ${v}`);
}

function parseFrontmatter(fm, file) {
  const data = {};
  let listKey = null;
  for (const line of fm.split('\n')) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s+-\s*(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(parseScalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) fail(`${file}: linha de frontmatter não reconhecida: ${line}`);
    const [, key, rest] = kv;
    if (rest.trim() === '' || rest.trim().startsWith('#')) {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(rest);
      listKey = null;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------------------------
// Imagens: mime pelo conteúdo, largura/altura pelo cabeçalho.
// ---------------------------------------------------------------------------------------------
function imageInfo(buf, file) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    fail(`${file}: JPEG sem SOF`);
  }
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { mime: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { mime: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.toString('ascii', 0, 3) === 'GIF') return { mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  fail(`${file}: formato de imagem não reconhecido`);
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const md5 = (text) => crypto.createHash('md5').update(text, 'utf8').digest('hex');

/** UUID determinístico (formato v5) a partir de um texto: mesma foto → mesmo id → idempotente. */
function stableUuid(seed) {
  const h = crypto.createHash('sha256').update(seed).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------------------------
// Endereço: "Rua, número, [complemento, ...] bairro, Cidade - UF"
// ---------------------------------------------------------------------------------------------
function parseEndereco(texto) {
  if (!texto) return null;
  const parts = texto.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts.pop() ?? '';
  const cm = /^(.*?)\s*[-–—\/]\s*([A-Za-z]{2})$/.exec(last);
  if (!cm) fail(`endereço sem "Cidade - UF" no fim: ${texto}`);
  const out = { street: null, number: null, complement: null, neighborhood: null, city: cm[1].trim(), state: cm[2].toUpperCase() };
  if (parts.length) out.street = parts.shift();
  if (parts.length && /^(\d+[A-Za-z]?|s\/n|sn)$/i.test(parts[0])) out.number = parts.shift();
  if (parts.length) out.neighborhood = parts.pop();
  if (parts.length) out.complement = parts.join(', ');
  return out;
}

// ---------------------------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------------------------
const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const qnum = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'NULL');
const qjson = (obj) => `${q(JSON.stringify(obj))}::jsonb`;
const qarr = (arr) => `ARRAY[${arr.map(q).join(', ')}]::text[]`;

/** Tag no formato de services.extras.tags: minúsculas, sem acento, kebab-case; `:` separa prefixo. */
function slugTag(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(':')
    .map((part) => part.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join(':');
}

/** `extras.vinculosTitulo`: texto aparado, 1 a 60 caracteres; o resto vira `undefined` (não grava). */
function vinculosTituloDe(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  return t && t.length <= 60 ? t : undefined;
}

/** extras.tags do lugar: agrupamento (TAXONOMIA.tag ou 1ª subcategoria), `local:<slug>` e as do
 * campo opcional `tags:` do frontmatter (lista ou texto separado por vírgula). Sem repetidas. */
function tagsDoLugar(slug, tax, fmTags) {
  const extra = Array.isArray(fmTags) ? fmTags : typeof fmTags === 'string' ? fmTags.split(',') : [];
  return [...new Set([tax.tag ?? tax.subs[0], `local:${slug}`, ...extra].map(slugTag).filter(Boolean))];
}

function clean(obj) {
  if (Array.isArray(obj)) {
    const a = obj.map(clean).filter((v) => v !== undefined);
    return a.length ? a : undefined;
  }
  if (obj && typeof obj === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(obj)) {
      const c = clean(v);
      if (c !== undefined) o[k] = c;
    }
    return Object.keys(o).length ? o : undefined;
  }
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === 'string') return obj.trim() === '' ? undefined : obj.trim();
  return obj;
}

// ---------------------------------------------------------------------------------------------
// Leitura de um lugar
// ---------------------------------------------------------------------------------------------
function readLugar(slug) {
  const rel = `content/lugares/${slug}/index.md`;
  const file = path.join(CONTENT_DIR, slug, 'index.md');
  const { fm, body } = splitFrontmatter(fs.readFileSync(file, 'utf8'), rel);
  const d = parseFrontmatter(fm, rel);
  for (const k of ['titulo', 'categoria', 'cidade', 'resumo', 'status', 'atualizado_em']) {
    if (d[k] === undefined || d[k] === '') fail(`${rel}: campo obrigatório ausente: ${k}`);
  }
  if ((typeof d.latitude === 'number') !== (typeof d.longitude === 'number')) fail(`${rel}: latitude e longitude devem vir juntas`);
  const tax = TAXONOMIA[slug];
  if (!tax) fail(`${rel}: lugar sem mapeamento de taxonomia em TAXONOMIA (scripts/lugares-para-servicos.mjs)`);

  const mediaDir = path.join(MEDIA_DIR, slug);
  const fotos = fs.existsSync(mediaDir)
    ? fs.readdirSync(mediaDir).filter((f) => IMAGE_EXT.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    : [];
  const mesAno = String(d.atualizado_em).slice(0, 7).replace('-', '/');
  const imagens = fotos.map((nome) => {
    const buf = fs.readFileSync(path.join(mediaDir, nome));
    const info = imageInfo(buf, `public/lugares/${slug}/${nome}`);
    const hash = sha256(buf);
    const id = stableUuid(`${FONTE}|${slug}|${nome}|${hash}`);
    const originalName = `${slug}-${nome}`;
    return {
      id,
      arquivo: `public/lugares/${slug}/${nome}`,
      originalName,
      storagePath: `service_image/${mesAno}/${id}-${originalName}`,
      size: buf.length,
      sha256: hash,
      hex: buf.toString('hex'),
      ...info,
    };
  });

  const creditos = typeof d.creditos === 'string' ? d.creditos.trim() : '';
  let descricao = body.trim();
  if (creditos) descricao += `\n\n${/^fotos\s*:/i.test(creditos) ? creditos : `Fotos: ${creditos}`}`;
  const titulo = String(d.titulo).trim();
  const endereco = parseEndereco(typeof d.endereco === 'string' ? d.endereco : null);

  // Respostas do formulário `lugares`: chaves planas; horário = lista de { texto }; gratuito só quando true.
  const answers = clean({
    horario: Array.isArray(d.horario) ? d.horario.map((h) => ({ texto: String(h) })) : undefined,
    preco: d.preco,
    gratuito: d.gratuito === true ? true : undefined,
    dicas_chegada: d.dicas_chegada,
    contato_telefone: d.telefone,
    contato_whatsapp: d.whatsapp,
    contato_instagram: d.instagram,
    site: d.site,
  }) ?? {};

  const extras = clean({
    origem: {
      fonte: FONTE,
      slug,
      arquivo: rel,
      atualizado_em: String(d.atualizado_em),
      status_artigo: d.status,
      categoria_artigo: d.categoria,
      cidade: d.cidade,
      titulo_md5: md5(titulo),
      descricao_md5: md5(descricao),
      fotos: imagens.map((i) => ({ arquivo: i.arquivo, sha256: i.sha256, fileId: i.id })),
    },
    resumo: d.resumo,
    endereco_texto: d.endereco,
    ...answers,
    creditos: creditos || undefined,
    tags: tagsDoLugar(slug, tax, d.tags),
    // Código do lugar: outros anúncios (eventos) o citam em `tags` e a tela de detalhe linka/lista.
    codigo: slug,
    // Título opcional do carrossel dos anúncios vinculados (frontmatter `vinculos_titulo`; máx. 60).
    vinculosTitulo: vinculosTituloDe(d.vinculos_titulo),
  });

  // O banco valida estas chaves (trigger do plugin services 0012): falhe aqui, antes do SQL.
  const tagsOk = Array.isArray(extras.tags) ? extras.tags : [];
  if (tagsOk.length > 10 || tagsOk.some((t) => !/^[a-z0-9][a-z0-9:._-]{0,59}$/.test(t))) {
    throw new Error(`${rel}: tags fora do padrão do banco (até 10; ^[a-z0-9][a-z0-9:._-]{0,59}$): ${JSON.stringify(tagsOk)}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(extras.codigo ?? '')) {
    throw new Error(`${rel}: slug fora do padrão de codigo (^[a-z0-9][a-z0-9._-]{0,59}$): ${extras.codigo}`);
  }

  const conhecidos = new Set(['titulo', 'categoria', 'cidade', 'resumo', 'status', 'atualizado_em', 'endereco', 'latitude', 'longitude', 'horario', 'telefone', 'instagram', 'site', 'preco', 'dicas_chegada', 'creditos', 'tags', 'vinculos_titulo', 'whatsapp', 'gratuito']);
  const naoMapeados = Object.keys(d).filter((k) => !conhecidos.has(k));
  if (naoMapeados.length) console.warn(`aviso: ${rel}: campos não mapeados (não gravados): ${naoMapeados.join(', ')}`);

  return { slug, rel, titulo, descricao, endereco, lat: d.latitude, lng: d.longitude, imagens, extras, answers, tax };
}

// ---------------------------------------------------------------------------------------------
// Geração do SQL
// ---------------------------------------------------------------------------------------------
function sqlLugar(l, n, status) {
  const tag = `$lugar_${n}$`;
  const files = l.imagens
    .map(
      (i) => `  INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, width, height, purpose, content, active)
  VALUES (${q(i.id)}, v_root, v_tenant, ${q(i.originalName)}, ${q(i.storagePath)}, ${q(i.mime)}, ${i.size}, ${i.width}, ${i.height}, 'service_image',
          decode('${i.hex}', 'hex'), true)
  ON CONFLICT (id) DO UPDATE SET active = true, updated_at = now();`
    )
    .join('\n');
  const e = l.endereco;
  const hasCoords = typeof l.lat === 'number' && typeof l.lng === 'number' && !(l.lat === 0 && l.lng === 0);
  const block = `
-- ${l.titulo} (${l.rel}) — ${l.imagens.length} foto(s)
DO ${tag}
DECLARE
  c_slug      constant text   := ${q(l.slug)};
  c_extras    constant jsonb  := ${qjson(l.extras)};
  c_titulo    constant text   := ${q(l.titulo)};
  c_descricao constant text   := ${q(l.descricao)};
  c_images    constant text[] := ${qarr(l.imagens.map((i) => i.id))};
  c_subs      constant text[] := ${qarr(l.tax.subs)};
  c_answers   constant jsonb  := ${qjson(l.answers)};
  c_form_keys constant text[] := ${qarr(FORM_KEYS)};
  v_root uuid; v_tenant uuid; v_group bigint; v_cat bigint; v_form text; v_form_id bigint; v_form_ver int; v_form_schema jsonb;
  v_sid bigint; v_old jsonb; v_old_titulo text; v_old_desc text;
  v_old_import text[]; v_kept text[]; v_images jsonb; v_cover text; v_ibge text; v_missing text[];
BEGIN
  SELECT u.uid, t.uid INTO v_root, v_tenant
  FROM (SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at LIMIT 1) u
  JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'lugares: sem usuário root/tenant'; END IF;

  SELECT g.id, c.id, NULLIF(c.form_key, '') INTO v_group, v_cat, v_form
  FROM public.categories c JOIN public.categories_group g ON g.id = c.category_group_id
  WHERE g.slug = ${q(l.tax.grupo)} AND c.slug = ${q(l.tax.categoria)};
  IF v_cat IS NULL THEN RAISE EXCEPTION 'lugares/%: categoria ${l.tax.grupo}/${l.tax.categoria} não existe (rode o seed de taxonomia)', c_slug; END IF;
  IF v_form IS NULL THEN
    RAISE NOTICE 'lugares/%: a categoria não tem form_key (rode db/extras/forms_seed_lugares.sql); horário/contato só em services.extras', c_slug;
  ELSE
    SELECT id, version, schema INTO v_form_id, v_form_ver, v_form_schema
    FROM public.forms WHERE tenant_id = v_tenant AND form_key = v_form AND active;
    IF v_form_id IS NULL THEN RAISE EXCEPTION 'lugares/%: formulário % não existe no tenant', c_slug, v_form; END IF;
  END IF;

  SELECT array_agg(s) INTO v_missing FROM unnest(c_subs) s
  WHERE NOT EXISTS (SELECT 1 FROM public.categories_sub cs WHERE cs.slug = s AND cs.category_id = v_cat);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'lugares/%: subcategoria(s) % não existem sob ${l.tax.categoria}', c_slug, v_missing; END IF;

  -- Fotos (id determinístico pelo conteúdo: rodar de novo não duplica)
${files || '  -- (sem fotos)'}

  -- Serviço existente? (chave: extras.origem.fonte + slug; inclui inativo, que não é reativado)
  SELECT id, extras, title, description INTO v_sid, v_old, v_old_titulo, v_old_desc
  FROM public.services
  WHERE tenant_id = v_tenant AND extras->'origem'->>'fonte' = ${q(FONTE)} AND extras->'origem'->>'slug' = c_slug
  ORDER BY id LIMIT 1;

  -- Imagens: as do artigo primeiro; as que alguém subiu pelo painel continuam depois
  SELECT coalesce(array_agg(x), '{}') INTO v_old_import
  FROM (SELECT f->>'fileId' AS x FROM jsonb_array_elements(coalesce(v_old->'origem'->'fotos', '[]'::jsonb)) f) y;
  SELECT coalesce(array_agg(x ORDER BY o), '{}') INTO v_kept
  FROM jsonb_array_elements_text(coalesce(v_old->'images', '[]'::jsonb)) WITH ORDINALITY AS a(x, o)
  WHERE x <> ALL(v_old_import) AND x <> ALL(c_images);
  v_images := to_jsonb(c_images || v_kept);
  v_cover := CASE
    WHEN v_old->>'coverFileId' IS NOT NULL AND v_old->>'coverFileId' <> ALL(v_old_import)
         AND (c_images || v_kept) @> ARRAY[v_old->>'coverFileId'] THEN v_old->>'coverFileId'
    ELSE (c_images || v_kept)[1] END;

  -- Foto que saiu do artigo: desativa o arquivo antigo
  UPDATE public.files SET active = false, updated_at = now()
  WHERE id::text = ANY(v_old_import) AND id::text <> ALL(c_images) AND active;

  IF v_sid IS NULL THEN
    INSERT INTO public.services
      (title, category_group_id, category_id, description, starting_price, price_unit, status,
       service_location, extras, tenant_id, created_by, active)
    VALUES (c_titulo, v_group, v_cat, c_descricao, 0, 'quote', ${q(status)}::public.service_status,
            'no_estabelecimento',
            c_extras || jsonb_strip_nulls(jsonb_build_object('images', CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images END, 'coverFileId', v_cover)),
            v_tenant, v_root, true)
    RETURNING id INTO v_sid;
    RAISE NOTICE 'lugares/%: inserido (service id %)', c_slug, v_sid;
  ELSE
    -- Título/descrição só mudam se ninguém os editou desde o último import (md5 guardado em extras.origem)
    UPDATE public.services SET
      title = CASE WHEN v_old->'origem'->>'titulo_md5' IS NULL OR md5(v_old_titulo) = v_old->'origem'->>'titulo_md5'
                   THEN c_titulo ELSE title END,
      description = CASE WHEN v_old->'origem'->>'descricao_md5' IS NULL OR md5(coalesce(v_old_desc, '')) = v_old->'origem'->>'descricao_md5'
                         THEN c_descricao ELSE description END,
      category_group_id = v_group, category_id = v_cat,
      extras = (extras - 'origem' - 'resumo' - 'endereco_texto' - 'contato' - c_form_keys
                       - 'creditos' - 'tags' - 'codigo' - 'vinculosTitulo' - 'images' - 'coverFileId')
               || jsonb_set(c_extras, '{origem}', (c_extras->'origem')
                    || jsonb_build_object(
                         'titulo_md5', CASE WHEN v_old->'origem'->>'titulo_md5' IS NULL OR md5(v_old_titulo) = v_old->'origem'->>'titulo_md5'
                                            THEN c_extras->'origem'->>'titulo_md5' ELSE v_old->'origem'->>'titulo_md5' END,
                         'descricao_md5', CASE WHEN v_old->'origem'->>'descricao_md5' IS NULL OR md5(coalesce(v_old_desc, '')) = v_old->'origem'->>'descricao_md5'
                                               THEN c_extras->'origem'->>'descricao_md5' ELSE v_old->'origem'->>'descricao_md5' END))
               || jsonb_strip_nulls(jsonb_build_object('images', CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images END, 'coverFileId', v_cover)),
      updated_at = now()
    WHERE id = v_sid;
    RAISE NOTICE 'lugares/%: atualizado (service id %)', c_slug, v_sid;
  END IF;

  -- Endereço (apaga os do anúncio e grava um, principal)
  DELETE FROM public.service_addresses WHERE service_id = v_sid;
${
  e
    ? `  BEGIN
    SELECT lc.id::text INTO v_ibge FROM public.location_city lc JOIN public.location_state ls ON ls.id = lc.state_id
    WHERE lower(lc.name) = lower(${q(e.city)}) AND upper(ls.code) = ${q(e.state)} LIMIT 1;
  EXCEPTION WHEN undefined_table THEN v_ibge := NULL;
  END;
  IF v_ibge IS NULL THEN RAISE NOTICE 'lugares/%: cidade % / % sem código IBGE em location_city', c_slug, ${q(e.city)}, ${q(e.state)}; END IF;
  INSERT INTO public.service_addresses
    (service_id, label, street, number, complement, neighborhood, city, state, city_ibge,
     latitude, longitude, is_primary, tenant_id, created_by, active)
  VALUES (v_sid, c_titulo, ${q(e.street)}, ${q(e.number)}, ${q(e.complement)}, ${q(e.neighborhood)}, ${q(e.city)}, ${q(e.state)}, v_ibge,
          ${hasCoords ? qnum(l.lat) : 'NULL'}, ${hasCoords ? qnum(l.lng) : 'NULL'}, true, v_tenant, v_root, true);`
    : `  -- (artigo sem endereço)`
}

  -- Respostas do formulário (mesmas chaves de extras)
  IF v_form_id IS NOT NULL THEN
    INSERT INTO public.form_results
      (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
    VALUES (v_form_id, v_form, v_sid::text, 'service', v_form_ver, v_form_schema, c_answers, v_root, v_tenant)
    ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET
      answers = EXCLUDED.answers, version = EXCLUDED.version, schema_snapshot = EXCLUDED.schema_snapshot,
      form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now();
  END IF;

  -- Subcategorias
  DELETE FROM public.service_categories_sub scs USING public.categories_sub cs
  WHERE scs.service_id = v_sid AND cs.id = scs.category_sub_id
    AND (cs.category_id <> v_cat OR cs.slug <> ALL(c_subs));
  INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
  SELECT v_sid, v_group, v_cat, cs.id, v_tenant, v_root
  FROM public.categories_sub cs WHERE cs.category_id = v_cat AND cs.slug = ANY(c_subs)
  ON CONFLICT (service_id, category_sub_id) DO NOTHING;
END
${tag};
`;
  if (block.split(tag).length !== 3) fail(`${l.rel}: o texto contém o delimitador ${tag}`);
  return block;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let slugs = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT_DIR, d.name, 'index.md')))
    .map((d) => d.name)
    .sort();
  if (opts.only) {
    if (!slugs.includes(opts.only)) fail(`--only: lugar não encontrado: ${opts.only}`);
    slugs = [opts.only];
  }
  const lugares = slugs.map(readLugar);

  const chunks = [];
  if (opts.out) chunks.push({ file: opts.out, lugares });
  else {
    for (let k = 0; k < lugares.length; k += opts.perFile) {
      const n = String(chunks.length + 1).padStart(2, '0');
      chunks.push({ file: path.join(OUT_DIR, `lugares_${n}.sql`), lugares: lugares.slice(k, k + opts.perFile) });
    }
    // Arquivos de uma geração anterior com mais lugares: some com eles (não apaga o resto do diretório).
    if (fs.existsSync(OUT_DIR) && !opts.only) {
      const keep = new Set(chunks.map((c) => path.basename(c.file)));
      for (const f of fs.readdirSync(OUT_DIR)) {
        if (/^lugares_\d+\.sql$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));
      }
    }
  }

  for (const chunk of chunks) {
    const rel = path.relative(ROOT, chunk.file).split(path.sep).join('/');
    const fotos = chunk.lugares.reduce((n, l) => n + l.imagens.length, 0);
    const header = `-- ${rel}
-- GERADO por scripts/lugares-para-servicos.mjs — não edite à mão; rode o script de novo.
-- De-para: docs/integracoes/lugares-depara.md
--
-- Grava artigos de content/lugares/ como anúncios (public.services) no tenant do usuário root:
-- ${chunk.lugares.map((l) => l.slug).join(', ')} — ${fotos} foto(s). Status no INSERT: '${opts.status}' (o dono aprova no painel).
-- Idempotente: o anúncio é achado por extras.origem (fonte = '${FONTE}', slug); rodar de novo
-- atualiza, não duplica. Fotos têm id determinístico pelo conteúdo (sha256).
-- Uma transação por arquivo: qualquer erro desfaz o arquivo inteiro. Os arquivos são independentes.
--
-- Pré-requisitos: core + plugins instalados, root cadastrado, grupo "lugares" na taxonomia
-- (db/extras/taxonomy_seed_bora_cuiaba.sql ou, em banco com anúncios, db/extras/lugares_grupo_migracao.sql),
-- formulário db/extras/forms_seed_lugares.sql e, para o código IBGE, db/extras/location_seed_bora_cuiaba.sql.
-- Atenção: depois deste import existem serviços, e o seed de taxonomia (destrutivo) passa a abortar.
--
-- Aplicar:
--   node kizuna-core/cli db run ${rel}          (usa $DATABASE_URL; ou --db-url <url>)
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${rel}

BEGIN;
`;
    const body = chunk.lugares.map((l, i) => sqlLugar(l, i + 1, opts.status)).join('');
    const sql = `${header}${body}\nCOMMIT;\n`;
    fs.mkdirSync(path.dirname(chunk.file), { recursive: true });
    fs.writeFileSync(chunk.file, sql, 'utf8');
    console.log(`gerado ${rel}: ${chunk.lugares.length} lugar(es), ${fotos} foto(s), ${(sql.length / 1024 / 1024).toFixed(1)} MB`);
    for (const l of chunk.lugares) {
      console.log(`  ${l.slug.padEnd(30)} ${l.tax.categoria}/${l.tax.subs.join('+')}  fotos=${l.imagens.length}  endereco=${l.endereco ? 'sim' : 'não'}  coords=${typeof l.lat === 'number' ? 'sim' : 'não'}`);
    }
  }
}

main();
