import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Mesmos aliases do tsconfig.json, para testar rotas (route handlers) que usam `@/` e `@kizuna/core`.
// Objeto simples (sem `defineConfig`): o vitest roda via npx e não está nas dependências do starter.
export default {
  // O tsconfig do Next deixa o JSX em `preserve`; os testes de componente (.tsx) do starter precisam
  // do runtime automático (o core já usa `react-jsx` no tsconfig dele).
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: /^@kizuna\/core\/(.*)$/, replacement: path.resolve(root, 'kizuna-core/src/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(root, 'src/$1') },
    ],
  },
};
