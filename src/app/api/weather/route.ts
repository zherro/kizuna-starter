import { NextResponse } from 'next/server';
import cfg from '@/../kizuna.config.json';
import type { WeatherCity, WeatherConfig, WeatherResponse } from '@kizuna/core/client/components/weather/types';

// Plugin weather — clima atual + dias passados/futuros das cidades do bloco
// "weather" do kizuna.config.json. Provedor: Open-Meteo (grátis, sem chave);
// uma única chamada traz todas as cidades. Cache no servidor por `cacheSeconds`.
export const revalidate = 900;

type OpenMeteo = {
  current: { temperature_2m: number; weather_code: number; is_day: number };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

export async function GET() {
  const w = (cfg as { weather?: WeatherConfig }).weather;
  if (!w?.cities?.length) {
    return NextResponse.json({ error: 'weather não configurado' }, { status: 404 });
  }

  const cities: WeatherCity[] = w.cities;
  const params = new URLSearchParams({
    latitude: cities.map((c) => c.latitude).join(','),
    longitude: cities.map((c) => c.longitude).join(','),
    timezone: w.timezone ?? 'auto',
    past_days: String(w.pastDays ?? 1),
    forecast_days: String(w.forecastDays ?? 7),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  const apiUrl = w.apiUrl ?? 'https://api.open-meteo.com/v1/forecast';

  const res = await fetch(`${apiUrl}?${params}`, {
    next: { revalidate: w.cacheSeconds ?? revalidate },
  });
  if (!res.ok) return NextResponse.json({ error: 'falha ao buscar clima' }, { status: 502 });

  const raw = (await res.json()) as OpenMeteo | OpenMeteo[];
  const list = Array.isArray(raw) ? raw : [raw];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: w.timezone });

  const body: WeatherResponse = {
    rotateSeconds: w.rotateSeconds ?? 5,
    today,
    cities: list.map((data, i) => ({
      name: cities[i].name,
      current: {
        temperature: Math.round(data.current.temperature_2m),
        code: data.current.weather_code,
        isDay: data.current.is_day === 1,
      },
      daily: data.daily.time.map((date, d) => ({
        date,
        code: data.daily.weather_code[d],
        max: Math.round(data.daily.temperature_2m_max[d]),
        min: Math.round(data.daily.temperature_2m_min[d]),
        rain: data.daily.precipitation_probability_max[d] ?? 0,
      })),
    })),
  };
  return NextResponse.json(body);
}
