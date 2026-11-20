import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const resolveLocation = vi.fn();
vi.mock('@kizuna/core/server', () => ({
  parseLocationConfig: () => ({ outsideList: 'default', defaultCityIbge: '5103403' }),
  resolveLocation: (...args: unknown[]) => resolveLocation(...args),
}));

import { GET } from './route';

const CUIABA = { stateCode: 'MT', stateName: 'Mato Grosso', cityId: 5103403, cityName: 'Cuiabá' };

function req(ip?: string) {
  return new NextRequest('http://localhost/api/location/ip', {
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });
}

beforeEach(() => {
  resolveLocation.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/location/ip — já devolve a cidade resolvida', () => {
  it('IP do Brasil: resolve com a UF/cidade do provedor e devolve `location`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'success',
            region: 'MT',
            regionName: 'Mato Grosso',
            city: 'Cuiabá',
            countryCode: 'BR',
          })
        )
      )
    );
    resolveLocation.mockResolvedValue(CUIABA);
    const res = await GET(req('200.1.2.3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ stateCode: 'MT', countryCode: 'BR', location: CUIABA });
    expect(resolveLocation).toHaveBeenCalledWith(expect.anything(), { uf: 'MT', city: 'Cuiabá' });
  });

  it('IP estrangeiro: resolve como São Paulo (a regra do cliente)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', region: 'CA', city: 'X', countryCode: 'US' }))
      )
    );
    resolveLocation.mockResolvedValue(CUIABA);
    const res = await GET(req('8.8.4.4'));
    expect((await res.json()).location).toEqual(CUIABA);
    expect(resolveLocation).toHaveBeenCalledWith(expect.anything(), { uf: 'SP', city: 'São Paulo' });
  });

  it('IP local (dev): 200 com a cidade padrão, sem consultar o provedor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    resolveLocation.mockResolvedValue(CUIABA);
    const res = await GET(req('127.0.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ location: CUIABA });
    expect(f).not.toHaveBeenCalled();
    expect(resolveLocation).toHaveBeenCalledWith(expect.anything(), { uf: '', city: '' });
  });

  it('validação falhou: resposta de antes, sem `location` (cliente cai no resolve)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    resolveLocation.mockRejectedValue(new Error('db'));
    const res = await GET(req('127.0.0.1'));
    expect(res.status).toBe(404);
    expect(await res.json()).not.toHaveProperty('location');
  });
});
