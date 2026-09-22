import { serverFetchResource } from '@/lib/server/postgrest-crud';

type SystemConfigRow = { key: string; value: Record<string, unknown> };

/**
 * Server-side read of the `app_preferences.fab_visible` `auth.system_config` key that drives
 * whether `kizuna-core`'s `PreferencesFab` (the floating theme/language/color button) renders —
 * see `src/app/layout.tsx`, which fetches this once, server-side, before deciding whether to mount
 * the button at all (so a hidden button never even reaches the client bundle's render tree).
 *
 * `system_config` read RLS is open to both `auth_user` and `anon` (see
 * kizuna-core/plugins/system_config/0001_system_config.sql), so this never needs an auth header.
 * Defaults to visible (`true`) on any failure — including a fresh database that hasn't run
 * `db/extras/system_config_seed.sql` yet — so the button never disappears waiting on config that
 * isn't there.
 */
export async function getAppPreferencesFabVisible(): Promise<boolean> {
  try {
    const rows = await serverFetchResource<SystemConfigRow>('system_config', {
      key: 'app_preferences.fab_visible',
    });

    const value = rows[0]?.value;
    return typeof value?.visible === 'boolean' ? value.visible : true;
  } catch {
    return true;
  }
}
