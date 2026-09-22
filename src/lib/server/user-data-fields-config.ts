import { serverFetchResource } from '@/lib/server/postgrest-crud';
import {
  DEFAULT_USER_DATA_FIELDS_CONFIG,
  type UserDataBirthDateFieldConfig,
  type UserDataDocumentFieldConfig,
  type UserDataFieldsConfig,
} from '@kizuna/core/client/components/onboarding/user-data-form';

type SystemConfigRow = { key: string; value: Record<string, unknown> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDocumentFieldConfig(value: unknown): UserDataDocumentFieldConfig {
  const fallback = DEFAULT_USER_DATA_FIELDS_CONFIG.documentField;
  if (!isPlainObject(value)) return fallback;

  const mask = value.mask === 'cpf' || value.mask === 'cnpj' ? value.mask : 'cpf_cnpj';

  return {
    visible: typeof value.visible === 'boolean' ? value.visible : fallback.visible,
    required: typeof value.required === 'boolean' ? value.required : fallback.required,
    mask,
    warning: typeof value.warning === 'string' && value.warning.trim() ? value.warning : null,
  };
}

function parseBirthDateFieldConfig(value: unknown): UserDataBirthDateFieldConfig {
  const fallback = DEFAULT_USER_DATA_FIELDS_CONFIG.birthDateField;
  if (!isPlainObject(value)) return fallback;

  return {
    visible: typeof value.visible === 'boolean' ? value.visible : fallback.visible,
    required: typeof value.required === 'boolean' ? value.required : fallback.required,
  };
}

/**
 * Server-side read of the two `auth.system_config` keys that drive
 * `kizuna-core/src/client/components/onboarding/user-data-form.tsx` (`AccountForm`) — used by
 * `app/painel/minha-conta/page.tsx` to fetch the config once, server-side, and pass it down as a
 * prop (RSC pattern already used by `app/painel/administracao/plugins/page.tsx`), instead of the
 * client form fetching it itself on every mount.
 *
 * `system_config` read RLS is open to both `auth_user` and `anon` (see
 * kizuna-core/plugins/system_config/0001_system_config.sql), so this never needs an auth header.
 * Falls back to `DEFAULT_USER_DATA_FIELDS_CONFIG` (everything visible, nothing required) on any
 * failure — including a fresh database that hasn't run `db/extras/system_config_seed.sql` yet —
 * so the account form never breaks waiting on config that isn't there.
 */
export async function getUserDataFieldsConfig(): Promise<UserDataFieldsConfig> {
  try {
    const [documentRows, birthDateRows] = await Promise.all([
      serverFetchResource<SystemConfigRow>('system_config', { key: 'user_data.document_field' }),
      serverFetchResource<SystemConfigRow>('system_config', {
        key: 'user_data.birth_date_field',
      }),
    ]);

    return {
      documentField: parseDocumentFieldConfig(documentRows[0]?.value),
      birthDateField: parseBirthDateFieldConfig(birthDateRows[0]?.value),
    };
  } catch {
    return DEFAULT_USER_DATA_FIELDS_CONFIG;
  }
}
