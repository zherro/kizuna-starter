// MANAGED (dono: base). Ponto de acesso do projeto ao registro de telas de painel.
// v1: apenas re-exporta do core. Plugins habilitados registram suas telas mutando
// `KIZUNA_SCREEN_REGISTRY` no import do fragmento `registry/<plugin>.ts` do core —
// este arquivo NÃO é editado por plugin.
export {
  KIZUNA_SCREEN_REGISTRY,
  type KizunaScreenEntry,
} from '@kizuna/core/client/components/screen-engine/kizuna-screen-registry';
