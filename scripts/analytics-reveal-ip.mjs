#!/usr/bin/env node
// scripts/analytics-reveal-ip.mjs
//
// Decifra o IP gravado em analytics_events.ip (cifrado com APP_ENCRYPTION_KEY).
// Uso (Node 22.6+; o flag deixa o Node importar o .ts do core):
//   node --experimental-strip-types scripts/analytics-reveal-ip.mjs <token>
//
// A chave vem do ambiente ou do .env do projeto (APP_ENCRYPTION_KEY, ou PGRST_JWT_SECRET de onde
// ela é derivada). Imprime SÓ o IP; token inválido / chave errada → sai com código 1 sem imprimir
// nada do token. Nada é gravado nem logado. Quem roda tem acesso ao dado sensível (LGPD).

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = (process.argv[2] ?? '').trim();
if (!token) {
  console.error('uso: node --experimental-strip-types scripts/analytics-reveal-ip.mjs <token>');
  process.exit(2);
}

const { readDotEnv } = await import(pathToFileURL(path.join(ROOT, 'kizuna-core', 'cli', 'lib', 'dotenv.mjs')).href);
for (const key of ['APP_ENCRYPTION_KEY', 'PGRST_JWT_SECRET', 'JWT_SECRET']) {
  if (!process.env[key]) {
    const v = readDotEnv(ROOT, key);
    if (v) process.env[key] = v;
  }
}

let decryptValue;
try {
  ({ decryptValue } = await import(pathToFileURL(path.join(ROOT, 'kizuna-core', 'src', 'server', 'app-crypto.ts')).href));
} catch {
  console.error('não consegui importar o app-crypto.ts: use Node 22.6+ com --experimental-strip-types.');
  process.exit(2);
}

let ip = null;
try {
  ip = decryptValue('analytics-ip', token);
} catch (err) {
  console.error(String(err?.message ?? 'falha ao decifrar')); // ex.: chave ausente — a mensagem não contém o token
  process.exit(2);
}
if (!ip) {
  console.error('token inválido, adulterado ou cifrado com outra chave.');
  process.exit(1);
}
console.log(ip);
