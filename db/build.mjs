// Gera os dois scripts consolidados do banco deste projeto:
//
//   db/auth.sql    → schema do CORE (kizuna-core/sql/*.sql): auth, RBAC, plugin_registry,
//                    login/signup, roles do PostgREST.
//   db/public.sql  → migrations de TODOS os plugins de kizuna.plugins.json, na ordem da lista
//                    (que já está em ordem de dependência), incluindo os seeds que os plugins
//                    trazem (ex.: pages/0002_pages_seed.sql).
//
//   node db/build.mjs
//
// A fonte da verdade continua sendo kizuna-core/sql e kizuna-core/plugins/<n>/NNNN_*.sql —
// os .sql daqui são só concatenação. Regenere sempre que o core ou a lista de plugins mudar.
//
// Aplicar em base LIMPA, nesta ordem:
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/auth.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/public.sql
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

console.log(`db/auth.sql    — ${coreFiles.length} arquivos do core`);
console.log(`db/public.sql  — ${count} arquivos de ${plugins.length} plugins`);
