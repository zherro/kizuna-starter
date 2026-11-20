import { absoluteUrl, stripHtml, type SeoSite, type ServiceDetailData } from '@kizuna/core/server';

/**
 * JSON-LD `Event` do detalhe de um evento — só com dado real do anúncio (nada inventado):
 * - datas: sessões do formulário (`answers.sessoes[].data/hora_inicio/hora_fim`), senão
 *   `answers.data_inicio`/`data_fim`, senão `services.expires_at` ("Acontece em", cuja hora é a de
 *   início; 23:59 = dia sem hora). Sem nenhuma data, não há `Event` (`null`).
 * - local: o lugar vinculado (`venue`), senão o endereço primário, sempre com a cidade do anúncio.
 * - oferta: entrada franca (`gratuito`) = preço 0; valores dos ingressos (1 = `Offer`, vários =
 *   `AggregateOffer`); senão o "a partir de" do anúncio. Sem valor, sem `offers`.
 */

type Answers = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^\d{2}:\d{2}$/;

/** Deslocamento do fuso em `at` no formato `-04:00` (Intl, sem tabela fixa). */
export function zoneOffset(timeZone: string, at: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

/** `AAAA-MM-DD` + `HH:MM` (hora local do evento) → ISO 8601 com fuso; sem hora, só a data. */
function localDateTime(day: string, hour: string | null, timeZone: string): string {
  if (!hour || !HOUR.test(hour)) return day;
  return `${day}T${hour}:00${zoneOffset(timeZone, new Date(`${day}T12:00:00Z`))}`;
}

function addDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Datas do evento; `null` se o anúncio não tem nenhuma. */
export function eventDates(
  answers: Answers | null | undefined,
  expiresAt: string | null | undefined,
  timeZone: string
): { startDate: string; endDate?: string } | null {
  const sessions = (Array.isArray(answers?.sessoes) ? answers.sessoes : [])
    .map((s) => (s && typeof s === 'object' ? (s as Answers) : {}))
    .map((s) => ({ day: str(s.data), start: str(s.hora_inicio), end: str(s.hora_fim) }))
    .filter((s): s is { day: string; start: string | null; end: string | null } => Boolean(s.day && DAY.test(s.day)))
    .sort((a, b) => (a.day + (a.start ?? '')).localeCompare(b.day + (b.start ?? '')));

  if (sessions.length > 0) {
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const startDate = localDateTime(first.day, first.start, timeZone);
    let endDate: string | undefined;
    if (last.end && HOUR.test(last.end)) {
      // `fim` menor ou igual ao início = termina no dia seguinte (contrato do importador).
      const endDay = last.start && last.end <= last.start ? addDay(last.day) : last.day;
      endDate = localDateTime(endDay, last.end, timeZone);
    } else if (last.day !== first.day) {
      endDate = last.day;
    }
    return { startDate, ...(endDate ? { endDate } : {}) };
  }

  // Campos `datetime` do formulário: `AAAA-MM-DDTHH:MM` sem fuso (hora local).
  const parseLocal = (v: string | null) => {
    const m = v?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
    return m ? localDateTime(m[1], m[2] ?? null, timeZone) : null;
  };
  const start = parseLocal(str(answers?.data_inicio));
  if (start) {
    const end = parseLocal(str(answers?.data_fim));
    return { startDate: start, ...(end ? { endDate: end } : {}) };
  }

  if (expiresAt) {
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) return null;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value])
    );
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = `${parts.hour}:${parts.minute}`;
    return { startDate: hour === '23:59' ? day : localDateTime(day, hour, timeZone) };
  }
  return null;
}

/** Oferta a partir dos dados reais; `undefined` quando não há valor nenhum. */
export function eventOffers(
  answers: Answers | null | undefined,
  fallbackPrice: number | null,
  url: string
): Record<string, unknown> | undefined {
  const ticketUrl = str(answers?.link_ingresso);
  const offerUrl = ticketUrl && /^https?:\/\//i.test(ticketUrl) ? ticketUrl : url;
  const base = { priceCurrency: 'BRL', url: offerUrl };
  if (answers?.gratuito === true) return { '@type': 'Offer', price: 0, ...base };

  const prices = (Array.isArray(answers?.ingressos) ? answers.ingressos : [])
    .map((i) => (i && typeof i === 'object' ? Number((i as Answers).valor) : NaN))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (prices.length > 0) {
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    return low === high
      ? { '@type': 'Offer', price: low, ...base }
      : { '@type': 'AggregateOffer', lowPrice: low, highPrice: high, offerCount: prices.length, ...base };
  }
  return fallbackPrice && fallbackPrice > 0 ? { '@type': 'Offer', price: fallbackPrice, ...base } : undefined;
}

export function eventJsonLd(
  site: SeoSite,
  data: ServiceDetailData,
  opts: { path: string; photos: string[]; timeZone: string }
): Record<string, unknown> | null {
  const { service } = data;
  const answers = (data.extraFields?.answers ?? null) as Answers | null;
  const dates = eventDates(answers, service.expiresAt ?? null, opts.timeZone);
  if (!dates) return null;

  const url = absoluteUrl(site, opts.path);
  const rawAddress = data.venue?.address ?? data.location?.address ?? null;
  // Endereço que é só "Cidade - UF" / "Cidade/UF" não é rua: fica só a cidade no PostalAddress.
  const onlyCity =
    rawAddress && data.city
      ? rawAddress.replace(/\s*[-/,]\s*/g, '|').toLowerCase() === `${data.city.name}|${data.city.state}`.toLowerCase()
      : false;
  const streetAddress = onlyCity ? null : rawAddress;
  const placeName = data.venue?.title ?? data.location?.label ?? streetAddress ?? data.city?.name ?? null;
  const location =
    placeName || data.city
      ? {
          '@type': 'Place',
          name: placeName ?? undefined,
          address: {
            '@type': 'PostalAddress',
            ...(streetAddress ? { streetAddress } : {}),
            ...(data.city ? { addressLocality: data.city.name, addressRegion: data.city.state } : {}),
            addressCountry: 'BR',
          },
          ...(data.location?.lat != null && data.location?.lng != null
            ? { geo: { '@type': 'GeoCoordinates', latitude: data.location.lat, longitude: data.location.lng } }
            : {}),
        }
      : undefined;
  const organizer = str(answers?.realizador);
  const fallbackPrice = service.priceUnit !== 'quote' ? service.startingPrice : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: service.title,
    // A descrição revisada vem em Markdown leve (**negrito**, listas): sai como texto puro.
    description: stripHtml(service.description?.replace(/[*_`#]+/g, ''), 300),
    url,
    ...dates,
    ...(location ? { eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location } : {}),
    image: opts.photos.length > 0 ? opts.photos.slice(0, 3).map((p) => absoluteUrl(site, p)) : undefined,
    offers: eventOffers(answers, fallbackPrice, url),
    organizer: organizer ? { '@type': 'Organization', name: organizer } : undefined,
  };
}
