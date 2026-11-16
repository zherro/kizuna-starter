import { describe, expect, it } from 'vitest';
import type { ServiceResult } from '@kizuna/core/client/components/search/search-types';
import { sortByEventDay } from './ordered-rail';

const ev = (title: string, event_start: string | null, expires_at: string | null = null) =>
  ({ title, event_start, expires_at }) as unknown as ServiceResult;

describe('sortByEventDay', () => {
  it('põe os eventos do mais cedo ao mais tarde (caso da home de 15/11)', () => {
    const items = [
      ev('Charlie Brown Jr', '2027-03-13T20:00'),
      ev('Show de dezembro', '2026-12-05T21:00'),
      ev('MC Kekel', '2026-11-19T22:00'),
      ev('Outro de dezembro', '2026-12-01'),
    ];
    expect(sortByEventDay(items).map((s) => s.title)).toEqual([
      'MC Kekel',
      'Outro de dezembro',
      'Show de dezembro',
      'Charlie Brown Jr',
    ]);
  });

  it('usa o dia do expires_at quando não há event_start, e manda sem data para o fim', () => {
    const items = [
      ev('Sem data', null, null),
      ev('Pelo vencimento', null, '2026-11-20T23:00:00-04:00'),
      ev('Com início', '2026-11-18T19:00'),
    ];
    expect(sortByEventDay(items).map((s) => s.title)).toEqual(['Com início', 'Pelo vencimento', 'Sem data']);
  });

  it('no mesmo dia ordena pela hora e não muta a entrada', () => {
    const items = [ev('22h', '2026-11-21T22:00'), ev('18h', '2026-11-21T18:00')];
    const copy = [...items];
    expect(sortByEventDay(items).map((s) => s.title)).toEqual(['18h', '22h']);
    expect(items).toEqual(copy);
  });
});
