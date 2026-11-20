import { NextRequest, NextResponse } from 'next/server';
import { parseLocationConfig, resolveLocation } from '@kizuna/core/server';
import { ipDetectionTarget } from '@kizuna/core/shared/location/ip-detect';
import cfg from '@/../kizuna.config.json';

/**
 * Geolocalização aproximada por IP — proxy server-side do ip-api.com.
 *
 * O IP do visitante vem do header do proxy (`x-forwarded-for` / `x-real-ip`); nunca do
 * client. Assim o IP não vaza pra um terceiro a partir do navegador e a resposta é
 * cacheável. Em dev (sem proxy) o IP é local e o ip-api devolve falha — o chamador
 * simplesmente cai no fluxo manual.
 *
 * A resposta também traz `location` (cidade já validada, ver `GET`), para o navegador não chamar
 * `/api/location/resolve` em série depois desta.
 */

const locationConfig = parseLocationConfig((cfg as { location?: unknown }).location);

type IpApiResponse = {
  status?: string;
  region?: string;
  regionName?: string;
  city?: string;
  countryCode?: string;
};

type IpLocationBody = {
  stateCode: string;
  stateName: string;
  cityName: string;
  countryCode: string;
};

type CacheEntry = { at: number; body: IpLocationBody };

const TTL_MS = 10 * 60_000;
const cache = new Map<string, CacheEntry>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || '';
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return false;
  }
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
  return true;
}

/** Consulta o ip-api (cache em memória por IP). `null` = sem resultado; `undefined` = falha. */
async function lookupIp(ip: string): Promise<IpLocationBody | null | undefined> {
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.body;
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=pt-BR&fields=status,regionName,region,city,countryCode`,
      { cache: 'no-store' }
    );
    if (!response.ok) return undefined;
    const data = (await response.json().catch(() => null)) as IpApiResponse | null;
    if (!data || data.status !== 'success') return null;
    const body: IpLocationBody = {
      stateCode: String(data.region ?? '').toUpperCase(),
      stateName: data.regionName ?? '',
      cityName: data.city ?? '',
      countryCode: String(data.countryCode ?? '').toUpperCase(),
    };
    cache.set(ip, { at: Date.now(), body });
    return body;
  } catch {
    return undefined;
  }
}

/**
 * Além do que o provedor devolveu, a resposta já traz `location`: a cidade validada contra a lista
 * do projeto (mesma regra do `useUserLocation` + `/api/location/resolve`). O navegador faz UMA ida
 * em vez de `ip` → `resolve` em série na 1ª visita. Se a validação falhar, a resposta sai como antes
 * (sem `location`) e o cliente cai no `resolve`.
 */
export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const body = isPublicIp(ip) ? await lookupIp(ip) : null;

  let location: Awaited<ReturnType<typeof resolveLocation>> | undefined;
  try {
    const target = ipDetectionTarget(body ?? null);
    location = await resolveLocation(locationConfig, {
      uf: target?.stateCode ?? '',
      city: target?.cityName ?? '',
    });
  } catch {
    location = undefined;
  }

  if (location !== undefined) {
    return NextResponse.json({ ...(body ?? {}), location });
  }

  // Sem a cidade resolvida: respostas de antes (o cliente segue para o `resolve`).
  if (body) return NextResponse.json(body);
  if (!isPublicIp(ip)) {
    return NextResponse.json(
      { message: 'IP nao identificavel para geolocalizacao.' },
      { status: 404 }
    );
  }
  if (body === null) {
    return NextResponse.json({ message: 'Localizacao por IP indisponivel.' }, { status: 404 });
  }
  return NextResponse.json(
    { message: 'Nao foi possivel consultar a localizacao por IP.' },
    { status: 502 }
  );
}
