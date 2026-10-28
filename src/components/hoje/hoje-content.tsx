// Página "Hoje" (Server Component): só configura e monta — carregador e blocos vêm do core.
// Usada por /hoje (cidade padrão do projeto) e /{cidade}/hoje.
import { loadTodayFeed } from '@kizuna/core/server';
import type { RoutableCity } from '@kizuna/core/shared/city-routing/city-slug';
import { parseRegions, regionCitiesFor } from '@kizuna/core/shared/regions';
import { parseTodaySections } from '@kizuna/core/shared/today-config';
import { TodayEmpty, TodayHero, TodaySectionBlock } from '@kizuna/core/client/components/today';
import { WeatherWidget } from '@kizuna/core/client/components/weather/weather-widget';
import { AdSlot } from '@kizuna/core/client/ads';
import type { ServiceDetailConfig } from '@kizuna/core/client/components/services/detail';
import { trackRule } from '@/lib/analytics';
import { adsConfig } from '@/lib/ads';
import cfg from '@/../kizuna.config.json';

const regions = parseRegions((cfg as { regions?: unknown }).regions);
const sections = parseTodaySections((cfg as { today?: unknown }).today);
const serviceDetailConfig = (cfg as { serviceDetail?: ServiceDetailConfig }).serviceDetail ?? null;

export async function HojeContent({ city }: { city: RoutableCity | null }) {
  const now = new Date();
  const cityName = city?.name ?? 'Cuiabá';
  const feed = city
    ? await loadTodayFeed(sections, { now, cityIbge: city.ibge, cityIbges: regionCitiesFor(regions, city.ibge) })
    : await loadTodayFeed(sections, { now });

  const todayCity = city ? { name: city.name, state: city.state, ibge: city.ibge } : null;
  return (
    <>
      <TodayHero
        cityName={cityName}
        now={now}
        summary="Eventos, cinema, bares e passeios para aproveitar o dia, do que mais vale a pena ao resto."
        weather={cfg.weather ? <WeatherWidget forecastModal={false} /> : undefined}
      />
      {feed.length === 0 ? (
        <TodayEmpty href="/busca" />
      ) : (
        <div className="pb-14 sm:pb-16">
          {feed.map((section, index) => (
            <TodaySectionBlock
              key={section.id}
              section={section}
              detailConfig={serviceDetailConfig}
              city={todayCity}
              showCity
              impressionRule={trackRule('service', 'impression')}
              source="home"
              adSlot={
                index === 0 ? undefined : (
                  <AdSlot
                    slot="trilho-card"
                    inline
                    city={city?.name}
                    adsenseClient={adsConfig.adsenseClient}
                    maxPerPage={adsConfig.maxSlotsPerPage}
                  />
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
