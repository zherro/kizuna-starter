import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEscopo, parseMeta } from '../../src/lib/eleicao/normalize';

const dir = process.env.REAL_DIR;
describe.skipIf(!dir)('dados reais do worker', () => {
  const rd = (p: string) => JSON.parse(readFileSync(`${dir}/${p}`, 'utf8'));
  it('parseia meta, nacional e todas as UFs', () => {
    const meta = parseMeta(rd('meta.json'));
    expect(meta?.ufs.length).toBe(28);
    const nac = parseEscopo(rd('nacional.json'));
    expect(nac && 'candidatos' in nac && nac.candidatos.length).toBeGreaterThan(1);
    for (const uf of meta!.ufs) expect('candidatos' in (parseEscopo(rd(`uf/${uf}.json`)) as object)).toBe(true);
  });
});
