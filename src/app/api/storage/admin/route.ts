import { createStorageAdminHandlers } from '@kizuna/core/server/storage-admin';

export const runtime = 'nodejs';
// Reotimizar um lote de imagens (sharp + bytea do banco) pode passar dos 10s padrão.
export const maxDuration = 60;

// Tela de storage do root (/painel/root/storage): lista imagens e reotimiza as existentes.
const handlers = createStorageAdminHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
