-- Gerado de kizuna-core/plugins/storage/0007_storage_thumb_spec.sql (storage 1.5.0 -> 1.6.0).
-- Marca de qual medida gerou cada miniatura de public.files: thumb_spec (ex.: '360q60') e thumb_at.
-- APLIQUE ANTES de subir o código/scripts que gravam essas colunas (regerar-miniaturas.mjs e os
-- importadores exigem; o upload do app tolera a ausência).
-- Só adiciona 2 colunas nulas (sem DEFAULT, sem reescrever a tabela): instantâneo e idempotente.
-- Desfazer: ALTER TABLE public.files DROP COLUMN thumb_spec, DROP COLUMN thumb_at;
-- Aplicar (DBeaver: selecione tudo e rode como script, Alt+X) ou:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/atualizar-storage-0007.sql
BEGIN;

ALTER TABLE public.files ADD COLUMN IF NOT EXISTS thumb_spec text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS thumb_at timestamptz;

INSERT INTO auth.plugin_registry (name, version)
VALUES ('storage', '1.6.0')
ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência (deve listar thumb_spec e thumb_at):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'files' AND column_name IN ('thumb_spec', 'thumb_at');
