import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARGOS, parseEscopo, parseMeta } from '../../src/lib/eleicao/normalize';

const dir = process.env.REAL_DIR;
describe.skipIf(!dir)('dados reais do worker', () => {
  const rd = (p: string) => JSON.parse(readFileSync(`${dir}/${p}`, 'utf8'));
  it('parseia meta, presidente/BR e os escopos de cada cargo', () => {
    const meta = parseMeta(rd('meta.json'));
    expect(meta?.ufs.length).toBeGreaterThan(20);
    const br = parseEscopo(rd('presidente/BR.json'));
    expect(br && 'candidatos' in br && br.candidatos.length).toBeGreaterThan(1);
    for (const cargo of CARGOS) {
      for (const uf of meta?.cargos[cargo]?.ufs ?? []) {
        const r = parseEscopo(rd(`${cargo}/${uf}.json`));
        expect(r).not.toBeNull();
      }
    }
  });
});
