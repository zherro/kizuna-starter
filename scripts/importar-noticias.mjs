#!/usr/bin/env node
// scripts/importar-noticias.mjs
//
// Lê as notícias de content/noticias/<slug>/index.html (frontmatter + texto em HTML puro, foto na
// mesma pasta) e as grava como anúncios do grupo `noticias` direto no banco (DATABASE_URL), no
// padrão de docs/integracoes/eventos-depara.md: services + files (com miniatura) +
// service_addresses + form_results (form `noticias`) + service_categories_sub.
//
// Regras (docs/integracoes/noticias.md):
// - Só entra notícia com `status: aprovado` no frontmatter (rascunho/revisao ficam de fora).
// - Índice por banco em content/noticias/_indice/<alvo>.json: o que já foi publicado ali e o hash
//   do arquivo. Notícia indexada e sem mudança no arquivo é pulada sem ler a foto nem o banco.
// - Notícia que já existe no banco é PULADA. Com --atualizar, só é regravada se o arquivo mudou E
//   se o anúncio no banco continua igual ao que foi importado (título, texto, categoria e capa) e
//   ativo: edição feita no painel, pausa ou arquivamento nunca são sobrescritos.
// - Nada é apagado: notícia removida da pasta (ou do banco) só é reportada.
//
// Uso:
//   DATABASE_URL=... node scripts/importar-noticias.mjs --alvo local --dry   # só mostra o que faria
//   DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod          # publica as novas
//   DATABASE_URL=... node scripts/importar-noticias.mjs --alvo prod --atualizar
//   ... --only <slug>                                                        # uma notícia só

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'noticias');
const INDEX_DIR = path.join(CONTENT_DIR, '_indice');
const FONTE = 'bora-redacao';
const GROUP = 'noticias';
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br']);
const STATUS_ARTIGO = ['rascunho', 'revisao', 'aprovado'];

const req = createRequire(path.join(ROOT, 'package.json'));
const sharp = req('sharp');
// `pg` é dependência do CLI do core (kizuna-core/cli), não do app.
const pg = createRequire(path.join(ROOT, 'kizuna-core', 'cli', 'package.json'))('pg');

function fail(msg) {
  console.error(`erro: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { alvo: null, dry: false, atualizar: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--alvo') opts.alvo = argv[++i];
    else if (a === '--dry') opts.dry = true;
    else if (a === '--atualizar') opts.atualizar = true;
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('uso: node scripts/importar-noticias.mjs --alvo <nome> [--dry] [--atualizar] [--only <slug>]');
      process.exit(0);
    } else fail(`argumento desconhecido: ${a}`);
  }
  if (!opts.alvo || !/^[a-z0-9-]+$/.test(opts.alvo)) fail('informe --alvo (ex.: local, prod) — nome do índice deste banco');
  if (!process.env.DATABASE_URL) fail('defina DATABASE_URL');
  return opts;
}

// ---------------------------------------------------------------------------------------------
// Frontmatter: mesmo subconjunto de YAML de content/lugares (chave: valor, aspas opcionais,
// listas com hífen, comentários com #).
// ---------------------------------------------------------------------------------------------
function splitFrontmatter(raw, file) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) fail(`${file}: frontmatter ausente`);
  return { fm: m[1], body: m[2] };
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

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('"')) return v.slice(1, findClosingQuote(v, '"')).replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c);
  if (v.startsWith("'")) return v.slice(1, findClosingQuote(v, "'")).replace(/''/g, "'");
  const bare = v.replace(/\s+#.*$/, '').trim();
  if (bare === 'null' || bare === '~') return null;
  return bare;
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
// Leitura e validação de uma notícia
// ---------------------------------------------------------------------------------------------
const sha256 = (...parts) => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p ?? '');
  return h.digest('hex');
};

/** Hash do que o painel deixa editar: se mudar no banco, alguém editou depois da importação. */
const hashEditavel = (s) =>
  sha256(s.title ?? '', '\n', s.description ?? '', '\n', String(s.category_id ?? ''), '\n', s.cover ?? '', '\n', s.expires ?? '');

/** `expira_em` (hora de Cuiabá) → ISO com fuso; `expires` é o mesmo instante em segundos, como o banco devolve. */
function validade(d) {
  if (!d.expira_em) return { iso: null, expires: '' };
  const iso = `${d.expira_em}:00-04:00`;
  return { iso, expires: String(Math.floor(Date.parse(iso) / 1000)) };
}

function checkHtml(slug, html) {
  const problems = [];
  for (const m of html.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) problems.push(`tag <${tag}>`);
    if (/\s(style|class)=/i.test(m[2])) problems.push(`atributo em <${tag}>`);
  }
  if (/^\s*#{1,6}\s|\*\*|\]\(http/m.test(html)) problems.push('marcação Markdown');
  if (!html.trim().startsWith('<p>')) problems.push('não começa com <p>');
  if (problems.length) fail(`${slug}: HTML inválido (${[...new Set(problems)].join(', ')})`);
}

function readNoticia(slug) {
  const dir = path.join(CONTENT_DIR, slug);
  const file = path.join(dir, 'index.html');
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const raw = fs.readFileSync(file);
  const { fm, body } = splitFrontmatter(raw.toString('utf8'), rel);
  const d = parseFrontmatter(fm, rel);
  for (const k of ['titulo', 'categoria', 'status', 'data_publicacao', 'cidade', 'uf']) {
    if (d[k] == null || d[k] === '') fail(`${rel}: falta "${k}"`);
  }
  if (!STATUS_ARTIGO.includes(d.status)) fail(`${rel}: status "${d.status}" (use ${STATUS_ARTIGO.join(', ')})`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(d.data_publicacao))) fail(`${rel}: data_publicacao no formato AAAA-MM-DDTHH:MM`);
  if (d.expira_em && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(d.expira_em))) fail(`${rel}: expira_em no formato AAAA-MM-DDTHH:MM`);
  const html = body.trim();
  return { slug, dir, rel, raw, d, html };
}

function fotoDe(n) {
  const nome = n.d.foto_arquivo || fs.readdirSync(n.dir).filter((f) => IMAGE_EXT.test(f)).sort()[0];
  if (!nome) fail(`${n.rel}: sem foto na pasta`);
  const file = path.join(n.dir, nome);
  if (!fs.existsSync(file)) fail(`${n.rel}: foto_arquivo "${nome}" não existe`);
  return { nome, buf: fs.readFileSync(file) };
}

function fontesDe(d) {
  // Cada item: "Nome | https://url" (url opcional). Só http/https.
  return (Array.isArray(d.fontes) ? d.fontes : []).map((item) => {
    const [nome, url] = String(item).split('|').map((s) => s.trim());
    return url && /^https?:\/\//i.test(url) ? { nome, url } : { nome };
  }).filter((f) => f.nome);
}

async function optimize(buf, file) {
  const meta = await sharp(buf, { failOn: 'error' }).metadata().catch(() => null);
  if (!meta?.width) fail(`${file}: não é imagem`);
  const full = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(buf).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { full, thumb };
}

// ---------------------------------------------------------------------------------------------
// Índice por banco
// ---------------------------------------------------------------------------------------------
function dbFingerprint(url) {
  const u = new URL(url);
  return sha256(`${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, '')}`).slice(0, 16);
}

function loadIndex(alvo, fingerprint) {
  const file = path.join(INDEX_DIR, `${alvo}.json`);
  if (!fs.existsSync(file)) return { file, data: { banco: fingerprint, noticias: {} } };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.banco && data.banco !== fingerprint) {
    fail(`o índice "${alvo}" é de outro banco (DATABASE_URL não bate com ${path.relative(ROOT, file)}). Confira --alvo.`);
  }
  data.banco = fingerprint;
  data.noticias ??= {};
  return { file, data };
}

function saveIndex(index) {
  fs.mkdirSync(path.dirname(index.file), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(index.data.noticias).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(index.file, `${JSON.stringify({ ...index.data, noticias: sorted }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------------------------
/** Tudo o que precisa bater com o banco antes de gravar (roda também no --dry). */
function validar(ctx, n) {
  const { d } = n;
  const cat = ctx.categorias.get(d.categoria);
  if (!cat) fail(`${n.rel}: categoria "${d.categoria}" não existe ou não é do grupo ${GROUP}`);
  const sub = d.subcategoria ? ctx.subcategorias.get(`${d.categoria}/${d.subcategoria}`) : null;
  if (d.subcategoria && !sub) fail(`${n.rel}: subcategoria "${d.subcategoria}" inativa ou de outra categoria`);
  const ibge = ctx.cidades.get(`${norm(d.cidade)}/${String(d.uf).toUpperCase()}`);
  if (!ibge) fail(`${n.rel}: cidade "${d.cidade}/${d.uf}" sem código IBGE em location_city`);
  checkHtml(n.slug, n.html);
  return { cat, sub, ibge };
}

async function gravar(client, ctx, form, n, existing) {
  const { d, slug } = n;
  const one = async (sql, params) => (await client.query(sql, params)).rows[0];
  const { cat, sub, ibge } = validar(ctx, n);

  const foto = fotoDe(n);
  const { full, thumb } = await optimize(foto.buf, `${n.rel} (${foto.nome})`);

  await client.query('BEGIN');
  try {
    const name = `${slug}.jpg`;
    let fileRow = await one(`SELECT id FROM public.files WHERE tenant_id = $1 AND purpose = 'service_image' AND active
      AND original_name = $2 AND size_bytes = $3 LIMIT 1`, [ctx.tenant_uid, name, full.data.length]);
    if (!fileRow) {
      const id = crypto.randomUUID();
      const now = new Date();
      const storagePath = `service_image/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${id}-${name}`;
      await client.query(`INSERT INTO public.files (id, uid, tenant_id, original_name, storage_path, mime_type, size_bytes, width, height,
          purpose, content, thumb_content, thumb_size_bytes, thumb_width, thumb_height, optimized_at, active)
        VALUES ($1,$2,$3,$4,$5,'image/jpeg',$6,$7,$8,'service_image',$9,$10,$11,$12,$13,now(),true)`,
        [id, ctx.root_uid, ctx.tenant_uid, name, storagePath, full.data.length, full.info.width, full.info.height, full.data,
         thumb.data, thumb.data.length, thumb.info.width, thumb.info.height]);
      fileRow = { id };
    }

    const title = String(d.titulo).trim();
    const description = n.html;
    const fim = validade(d);
    const fontes = fontesDe(d);
    const credito = Object.fromEntries(Object.entries({
      autor: d.foto_autor, licenca: d.foto_licenca, licenca_url: d.foto_licenca_url,
      pagina_origem: d.foto_origem, alt: d.foto_alt, legenda: d.foto_legenda,
    }).filter(([, v]) => typeof v === 'string' && v.trim()));
    const extras = {
      origem: {
        fonte: FONTE, id_evento: slug, arquivo: n.rel, cidade_ibge: ibge,
        hash_importado: hashEditavel({ title, description, category_id: cat.id, cover: fileRow.id, expires: fim.expires }),
        importado_em: new Date().toISOString(),
      },
      images: [fileRow.id],
      coverFileId: fileRow.id,
      ...(Object.keys(credito).length ? { imagem_credito: credito } : {}),
      ...(fontes.length ? { fontes } : {}),
    };

    let serviceId;
    if (existing) {
      serviceId = existing.id;
      await client.query(`UPDATE public.services SET title = $1, category_group_id = $2, category_id = $3, description = $4,
          extras = (extras - 'origem' - 'images' - 'coverFileId' - 'imagem_credito' - 'fontes') || $5::jsonb,
          expires_at = $7::timestamptz, updated_at = now()
        WHERE id = $6`, [title, cat.group_id, cat.id, description, JSON.stringify(extras), serviceId, fim.iso]);
    } else {
      serviceId = (await one(`INSERT INTO public.services (title, category_group_id, category_id, description, starting_price,
          price_unit, status, service_location, extras, expires_at, tenant_id, created_by, created_at, active)
        VALUES ($1,$2,$3,$4,0,'quote','active',NULL,$5::jsonb,$9::timestamptz,$6,$7,$8::timestamptz,true) RETURNING id`,
        [title, cat.group_id, cat.id, description, JSON.stringify(extras), ctx.tenant_uid, ctx.root_uid, `${d.data_publicacao}:00${ctx.offset}`, fim.iso])).id;
    }

    // Endereço: a cidade da notícia (é o que a põe no filtro de cidade da home e da busca).
    await client.query(`DELETE FROM public.service_addresses WHERE service_id = $1`, [serviceId]);
    await client.query(`INSERT INTO public.service_addresses (service_id, label, city, state, city_ibge, is_primary, tenant_id, created_by, active)
      VALUES ($1,$2,$3,$4,$5,true,$6,$7,true)`, [serviceId, d.cidade, d.cidade, String(d.uf).toUpperCase(), ibge, ctx.tenant_uid, ctx.root_uid]);

    const principal = fontes[0];
    const answers = Object.fromEntries(Object.entries({
      data_publicacao: d.data_publicacao, autor: d.autor, fonte: principal?.nome, link: principal?.url,
    }).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
    await client.query(`INSERT INTO public.form_results (form_id, form_key, reference_id, domain, version, schema_snapshot, answers, submitted_by, tenant_id)
      VALUES ($1,'noticias',$2::text,'service',$3,$4::jsonb,$5::jsonb,$6,$7)
      ON CONFLICT (tenant_id, domain, reference_id) DO UPDATE SET answers = EXCLUDED.answers, version = EXCLUDED.version,
        schema_snapshot = EXCLUDED.schema_snapshot, form_id = EXCLUDED.form_id, form_key = EXCLUDED.form_key, updated_at = now()`,
      [form.id, String(serviceId), form.version, JSON.stringify(form.schema), JSON.stringify(answers), ctx.root_uid, ctx.tenant_uid]);

    await client.query(`DELETE FROM public.service_categories_sub WHERE service_id = $1`, [serviceId]);
    if (sub) {
      await client.query(`INSERT INTO public.service_categories_sub (service_id, category_group_id, category_id, category_sub_id, tenant_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (service_id, category_sub_id) DO NOTHING`,
        [serviceId, cat.group_id, cat.id, sub, ctx.tenant_uid, ctx.root_uid]);
    }
    await client.query('COMMIT');
    return serviceId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------
const opts = parseArgs(process.argv.slice(2));
if (!fs.existsSync(CONTENT_DIR)) fail(`pasta ${path.relative(ROOT, CONTENT_DIR)} não existe`);
const slugs = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(CONTENT_DIR, e.name, 'index.html')))
  .map((e) => e.name)
  .filter((s) => !opts.only || s === opts.only)
  .sort();
if (opts.only && slugs.length === 0) fail(`--only ${opts.only}: notícia não encontrada`);

const index = loadIndex(opts.alvo, dbFingerprint(process.env.DATABASE_URL));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const ctx = (await client.query(`SELECT u.uid AS root_uid, t.uid AS tenant_uid
  FROM (SELECT uid FROM auth.users WHERE is_root ORDER BY created_at LIMIT 1) u
  JOIN LATERAL (SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at LIMIT 1) t ON true`)).rows[0];
if (!ctx) fail('banco sem usuário root/tenant');
const form = (await client.query(`SELECT id, version, schema FROM public.forms WHERE tenant_id = $1 AND form_key = 'noticias' AND active`, [ctx.tenant_uid])).rows[0];
if (!form) fail('formulário noticias ausente (rode db/extras/forms_seed_noticias.sql)');
ctx.offset = '-04:00'; // data_publicacao é hora de Cuiabá (America/Cuiaba, sem horário de verão)
ctx.categorias = new Map((await client.query(`SELECT c.slug, c.id, c.category_group_id AS group_id FROM public.categories c
  JOIN public.categories_group g ON g.id = c.category_group_id AND g.active AND g.slug = $1 WHERE c.active`, [GROUP])).rows.map((r) => [r.slug, r]));
ctx.subcategorias = new Map((await client.query(`SELECT c.slug AS cat, cs.slug, cs.id FROM public.categories_sub cs
  JOIN public.categories c ON c.id = cs.category_id JOIN public.categories_group g ON g.id = c.category_group_id AND g.slug = $1
  WHERE cs.active`, [GROUP])).rows.map((r) => [`${r.cat}/${r.slug}`, r.id]));
ctx.cidades = new Map((await client.query(`SELECT lc.id::text AS ibge, lc.name, upper(ls.code) AS uf
  FROM public.location_city lc JOIN public.location_state ls ON ls.id = lc.state_id`)).rows.map((r) => [`${norm(r.name)}/${r.uf}`, r.ibge]));

// Uma consulta só: o que esta fonte já gravou neste banco (inclusive inativo), com o necessário
// para saber se foi editado no painel.
const noBanco = new Map((await client.query(`SELECT s.id, s.status, s.active, s.title, s.description, s.category_id,
    s.extras->>'coverFileId' AS cover, s.extras->'origem'->>'id_evento' AS slug,
    coalesce(floor(extract(epoch FROM s.expires_at))::bigint::text, '') AS expires, s.extras->'origem'->>'hash_importado' AS hash_importado
  FROM public.services s WHERE s.tenant_id = $1 AND s.extras->'origem'->>'fonte' = $2`, [ctx.tenant_uid, FONTE])).rows.map((r) => [r.slug, r]));

const resultado = [];
const conta = {};
const marca = (slug, acao, detalhe = '') => {
  resultado.push({ slug, acao, detalhe });
  conta[acao] = (conta[acao] ?? 0) + 1;
};

try {
  for (const slug of slugs) {
    const n = readNoticia(slug);
    if (n.d.status !== 'aprovado') { marca(slug, 'fora', `status ${n.d.status}`); continue; }
    const fim = validade(n.d);
    if (fim.iso && Date.parse(fim.iso) <= Date.now()) { marca(slug, 'vencida', `expira_em ${n.d.expira_em} já passou`); continue; }

    const foto = fotoDe(n);
    const hashArquivo = sha256(n.raw, foto.buf);
    const idx = index.data.noticias[slug];
    const atual = noBanco.get(slug);

    if (atual) {
      if (idx?.hash_arquivo === hashArquivo) { marca(slug, 'pulada', 'já publicada, arquivo sem mudança'); continue; }
      if (!idx) {
        // Está no banco mas não no índice (índice novo ou importada por outro meio): só indexa.
        // Conta como publicada nesta versão do arquivo: daqui em diante só uma mudança no arquivo a
        // faz entrar em --atualizar (e a proteção contra edição no painel continua valendo).
        index.data.noticias[slug] = { service_id: Number(atual.id), hash_arquivo: hashArquivo, indexada_em: new Date().toISOString() };
        if (!opts.atualizar) { marca(slug, 'pulada', 'já estava no banco; registrada no índice'); continue; }
      }
      if (!opts.atualizar) { marca(slug, 'pulada', 'arquivo mudou — use --atualizar para regravar'); continue; }
      if (!atual.active || atual.status !== 'active') { marca(slug, 'protegida', `está ${atual.active ? atual.status : 'inativa'} no banco`); continue; }
      if (!atual.hash_importado || hashEditavel(atual) !== atual.hash_importado) {
        marca(slug, 'protegida', 'editada no painel depois da importação (ou importada sem hash)');
        continue;
      }
      if (opts.dry) { validar(ctx, n); await optimize(foto.buf, `${n.rel} (${foto.nome})`); marca(slug, 'atualizaria'); continue; }
      const id = await gravar(client, ctx, form, n, atual);
      index.data.noticias[slug] = { service_id: Number(id), hash_arquivo: hashArquivo, publicada_em: idx?.publicada_em ?? new Date().toISOString(), atualizada_em: new Date().toISOString() };
      marca(slug, 'atualizada', `service ${id}`);
      continue;
    }

    if (idx) { marca(slug, 'ausente', 'está no índice mas não no banco (apagada?) — remova do índice para recriar'); continue; }
    if (opts.dry) { validar(ctx, n); await optimize(foto.buf, `${n.rel} (${foto.nome})`); marca(slug, 'inseriria'); continue; }
    const id = await gravar(client, ctx, form, n, null);
    index.data.noticias[slug] = { service_id: Number(id), hash_arquivo: hashArquivo, publicada_em: new Date().toISOString() };
    marca(slug, 'inserida', `service ${id}`);
  }
} finally {
  await client.end();
  if (!opts.dry) saveIndex(index);
}

// O que o índice tem e a pasta não (arquivo apagado ou renomeado): só avisa, nada é removido.
if (!opts.only) {
  for (const slug of Object.keys(index.data.noticias)) {
    if (!slugs.includes(slug)) marca(slug, 'sem-arquivo', 'no índice, mas sem pasta em content/noticias');
  }
}

for (const r of resultado.filter((r) => r.acao !== 'pulada' || r.detalhe !== 'já publicada, arquivo sem mudança')) {
  console.log(`${r.acao.padEnd(12)} ${r.slug}${r.detalhe ? ` — ${r.detalhe}` : ''}`);
}
console.log(`\n${opts.dry ? '[dry] ' : ''}alvo ${opts.alvo}: ${Object.entries(conta).map(([k, v]) => `${v} ${k}`).join(', ') || 'nada a fazer'}`);
if (!opts.dry) console.log(`índice: ${path.relative(ROOT, index.file)}`);
