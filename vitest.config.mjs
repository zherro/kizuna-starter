import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Mesmos aliases do tsconfig.json, para testar rotas (route handlers) que usam `@/` e `@kizuna/core`.
// Objeto simples (sem `defineConfig`): o vitest roda via npx e não está nas dependências do starter.
export default {
  resolve: {
    alias: [
      { find: /^@kizuna\/core\/(.*)$/, replacement: path.resolve(root, 'kizuna-core/src/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(root, 'src/$1') },
    ],
  },
};
