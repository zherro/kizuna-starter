import { defineCapabilities, parseAccountLevelsConfig } from '@kizuna/core/shared/account-levels';
import cfg from '@/../kizuna.config.json';

/** Níveis do kizuna.config.json, validados (config inválida quebra o boot com erro claro). */
export const accountLevelsConfig = parseAccountLevelsConfig(
  (cfg as { accountLevels?: unknown }).accountLevels
);

/**
 * O QUE CADA NÍVEL LIBERA — fonte única. Ação → key do nível mínimo (de accountLevels.levels).
 * Para mudar uma regra, mude aqui. Ação que não está aqui exige só estar logado.
 * Key inexistente quebra o dev/build na hora (defineCapabilities).
 */
export const CAPABILITIES = defineCapabilities(accountLevelsConfig, {
  like: 'conta',
  save: 'conta',
  review: 'contato',
  comment: 'contato',
  'service.create': 'perfil',
  'event.create': 'perfil',
  sell: 'identidade',
});

export type Capability = keyof typeof CAPABILITIES;
