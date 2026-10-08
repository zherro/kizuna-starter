// Gera os três scripts consolidados do banco deste projeto:
//
//   db/auth.sql    → schema do CORE (kizuna-core/sql/*.sql): auth, RBAC, plugin_registry,
//                    login/signup, roles do PostgREST.
//   db/public.sql  → migrations de TODOS os plugins de kizuna.plugins.json, na ordem da lista
//                    (que já está em ordem de dependência), incluindo os seeds que os plugins
//                    trazem (ex.: pages/0002_pages_seed.sql).
//   db/reseed.sql  → seeds do projeto que dependem do root (páginas, cidades, taxonomia, forms);
//                    rodar depois do 1º cadastro.
//
//   node db/build.mjs
//
// A fonte da verdade continua sendo kizuna-core/sql e kizuna-core/plugins/<n>/NNNN_*.sql —
// os .sql daqui são só concatenação. Regenere sempre que o core ou a lista de plugins mudar.
//
// Aplicar em base LIMPA, nesta ordem:
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/auth.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/public.sql
//   (cadastrar o 1º usuário em /registre-se → vira root)
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/reseed.sql
// (nem todo .sql de origem é idempotente; numa base já provisionada use
//  `node kizuna-core/cli db migrate`, que aplica só o que falta.)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { listMigrationFiles } from '../kizuna-core/cli/lib/migrations.mjs';

const dbDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(dbDir, '..');
const coreDir = join(projectDir, 'kizuna-core');

const rel = (f) => relative(projectDir, f).replaceAll('\\', '/');

function section(title) {
  return `\n\n-- ${'='.repeat(95)}\n-- ${title}\n-- ${'='.repeat(95)}\n\n`;
}

function concat(files) {
  return files
    .map((f) => section(rel(f)) + readFileSync(f, 'utf8').replace(/\s*$/, '') + '\n')
    .join('');
}

function header(title, lines) {
  return [
    `-- ${title}`,
    '-- GERADO por db/build.mjs — NÃO edite à mão. Regenere: node db/build.mjs',
    ...lines.map((l) => `-- ${l}`),
    '',
  ].join('\n');
}

// --- auth: core ----------------------------------------------------------------------------
const coreFiles = listMigrationFiles(coreDir, 'core');
writeFileSync(
  join(dbDir, 'auth.sql'),
  header('Bora Cuiabá — schema do CORE (auth + RBAC + plugin_registry)', [
    'Aplicar PRIMEIRO, em base limpa:',
    '  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/auth.sql',
    `Arquivos: ${coreFiles.length} (kizuna-core/sql)`,
  ]) + concat(coreFiles)
);

// --- public: plugins -----------------------------------------------------------------------
const { plugins } = JSON.parse(readFileSync(join(projectDir, 'kizuna.plugins.json'), 'utf8'));

let body = '';
let count = 0;
const summary = [];
for (const name of plugins) {
  const files = listMigrationFiles(coreDir, name);
  if (!files.length) throw new Error(`plugin sem migrations: ${name} (kizuna-core/plugins/${name})`);
  body += section(`PLUGIN: ${name}  (${files.length} arquivo${files.length > 1 ? 's' : ''})`);
  body += concat(files);
  count += files.length;
  summary.push(`${name} (${files.length})`);
}

writeFileSync(
  join(dbDir, 'public.sql'),
  header('Bora Cuiabá — migrations + seeds de TODOS os plugins', [
    'Aplicar DEPOIS do db/auth.sql, em base limpa:',
    '  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/public.sql',
    'Ordem = kizuna.plugins.json (ordem de dependência).',
    `Plugins: ${summary.join(', ')}`,
  ]) + body
);

// --- reseed: dados que dependem do root -----------------------------------------------------
// Os seeds abaixo resolvem tenant/created_by pelo primeiro root: rodados antes do cadastro dele
// viram no-op. Ordem obrigatória: taxonomia antes dos formulários (o clear-all dela zera
// categories.form_key, que os seeds de formulário preenchem).
const reseedFiles = [
  'kizuna-core/plugins/pages/0002_pages_seed.sql',
  'db/extras/location_seed_bora_cuiaba.sql',
  'db/extras/taxonomy_seed_bora_cuiaba.sql',
  'kizuna-core/db/extras/forms_seed_cinema.sql',
  'db/extras/forms_seed_eventos.sql',
  'db/extras/forms_seed_noticias.sql',
].map((f) => join(projectDir, f));

writeFileSync(
  join(dbDir, 'reseed.sql'),
  header('Bora Cuiabá — seeds do projeto (rodar DEPOIS do 1º cadastro, que vira root)', [
    'Aplicar depois de db/auth.sql + db/public.sql e do cadastro do root em /registre-se:',
    '  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/reseed.sql',
    'DESTRUTIVO: taxonomia e formulários são apagados e recriados; ABORTA se já existir',
    'qualquer anúncio/demanda ou resposta de formulário (cada arquivo roda na sua transação).',
    'Sem root cadastrado, ABORTA logo no início (nada é aplicado).',
    `Arquivos: ${reseedFiles.map(rel).join(', ')}`,
  ]) +
    `
DO $root$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE is_root = true) THEN
    RAISE EXCEPTION 'nenhum usuario root: cadastre o 1o usuario em /registre-se antes do reseed';
  END IF;
END
$root$;
` +
    concat(reseedFiles)
);

console.log(`db/auth.sql    — ${coreFiles.length} arquivos do core`);
console.log(`db/public.sql  — ${count} arquivos de ${plugins.length} plugins`);
console.log(`db/reseed.sql  — ${reseedFiles.length} seeds do projeto`);
