import { createImageOptimizeHandler } from '@kizuna/core/server/image';

export const runtime = 'nodejs';

// API de otimização de imagens (sharp): multipart { file, preset? } → WebP otimizado.
export const POST = createImageOptimizeHandler({ maxFileSizeMb: 20 });
