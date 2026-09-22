import { NextRequest, NextResponse } from 'next/server';

/**
 * Geolocalização aproximada por IP — proxy server-side do ip-api.com.
 *
 * O IP do visitante vem do header do proxy (`x-forwarded-for` / `x-real-ip`); nunca do
 * client. Assim o IP não vaza pra um terceiro a partir do navegador e a resposta é
 * cacheável. Em dev (sem proxy) o IP é local e o ip-api devolve falha — o chamador
 * simplesmente cai no fluxo manual.
 */

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

export async function GET(request: NextRequest) {
  const ip = clientIp(request);

  if (!isPublicIp(ip)) {
    return NextResponse.json(
      { message: 'IP nao identificavel para geolocalizacao.' },
      { status: 404 }
    );
  }

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=pt-BR&fields=status,regionName,region,city,countryCode`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json(
        { message: 'Nao foi possivel consultar a localizacao por IP.' },
        { status: 502 }
      );
    }

    const data = (await response.json().catch(() => null)) as IpApiResponse | null;
    if (!data || data.status !== 'success') {
      return NextResponse.json({ message: 'Localizacao por IP indisponivel.' }, { status: 404 });
    }

    const body: IpLocationBody = {
      stateCode: String(data.region ?? '').toUpperCase(),
      stateName: data.regionName ?? '',
      cityName: data.city ?? '',
      countryCode: String(data.countryCode ?? '').toUpperCase(),
    };
    cache.set(ip, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { message: 'Nao foi possivel consultar a localizacao por IP.' },
      { status: 500 }
    );
  }
}
