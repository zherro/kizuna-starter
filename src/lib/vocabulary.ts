import { parseVocabularyConfig, setVocabulary } from '@kizuna/core/shared/vocabulary';
import cfg from '@/../kizuna.config.json';

/**
 * Vocabulário do `kizuna.config.json` (bloco `vocabulary`), validado — config inválida quebra o boot
 * com erro claro. Sem o bloco vale o contexto padrão do core (`publicacao`).
 *
 * No Bora o item é "Anúncio" e o mesmo destino tem um nome só em todo lugar (barra inferior, menu
 * do painel, títulos): "Anunciar" para criar e "Meus anúncios" para listar. Esse padrão entra aqui
 * por baixo da config: `terms`/`phrases` do `kizuna.config.json` continuam valendo por cima.
 *
 * Importar este módulo REGISTRA o vocabulário (side effect) para as telas do screen-engine, que
 * resolvem `"$vocab.<frase>"` no servidor: `app/painel/layout.tsx` o importa por isso. Componentes
 * do projeto (menu) usam o objeto exportado direto.
 */
const BORA_VOCABULARY = {
  terms: { item: { singular: 'Anúncio', plural: 'Anúncios', gender: 'm' } },
  phrases: { new: 'Anunciar', manage: 'Meus anúncios' },
} as const;

type RawVocabulary = { terms?: { item?: object }; phrases?: object } & Record<string, unknown>;

function withBoraDefaults(raw: RawVocabulary | undefined): RawVocabulary {
  const own = raw ?? {};
  return {
    ...own,
    terms: { item: { ...BORA_VOCABULARY.terms.item, ...own.terms?.item } },
    phrases: { ...BORA_VOCABULARY.phrases, ...own.phrases },
  };
}

export const vocabulary = parseVocabularyConfig(
  withBoraDefaults((cfg as { vocabulary?: RawVocabulary }).vocabulary)
);

setVocabulary(vocabulary);
