import { parseVocabularyConfig, setVocabulary } from '@kizuna/core/shared/vocabulary';
import cfg from '@/../kizuna.config.json';

/**
 * Vocabulário do `kizuna.config.json` (bloco `vocabulary`), validado — config inválida quebra o boot
 * com erro claro. Sem o bloco vale o contexto padrão do core (`publicacao`).
 *
 * Importar este módulo REGISTRA o vocabulário (side effect) para as telas do screen-engine, que
 * resolvem `"$vocab.<frase>"` no servidor: `app/painel/layout.tsx` o importa por isso. Componentes
 * do projeto (menu) usam o objeto exportado direto.
 */
export const vocabulary = parseVocabularyConfig((cfg as { vocabulary?: unknown }).vocabulary);

setVocabulary(vocabulary);
