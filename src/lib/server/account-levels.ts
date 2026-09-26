import type { AccountLevelsSetup } from '@kizuna/core/server';
import { accountLevelsConfig, CAPABILITIES } from '@/lib/account-levels';
import { getUserDataFieldsConfig } from '@/lib/server/user-data-fields-config';

/** Setup dos níveis para o servidor: config + capacidades + se o documento é exigido no perfil. */
export const accountLevelsSetup: AccountLevelsSetup = {
  config: accountLevelsConfig,
  capabilities: CAPABILITIES,
  documentRequired: async () => {
    const { documentField } = await getUserDataFieldsConfig();
    return documentField.visible && documentField.required;
  },
};
