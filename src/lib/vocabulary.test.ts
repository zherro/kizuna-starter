import { describe, expect, it } from 'vitest';
import { vocabulary } from './vocabulary';

// Um nome só no Bora: "Anunciar" cria, "Meus anúncios" lista (barra inferior, menu e telas do painel).
describe('vocabulário do Bora', () => {
  it('chama o item de anúncio e usa os nomes únicos de criar e listar', () => {
    expect(vocabulary.item).toEqual({ singular: 'Anúncio', plural: 'Anúncios', gender: 'm' });
    expect(vocabulary.phrases.new).toBe('Anunciar');
    expect(vocabulary.phrases.mine).toBe('Meus anúncios');
    expect(vocabulary.phrases.manage).toBe('Meus anúncios');
    expect(vocabulary.phrases.noneRegistered).toBe('Nenhum anúncio cadastrado ainda.');
  });
});
