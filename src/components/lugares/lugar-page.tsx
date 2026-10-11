import { AtSign, Banknote, Clock, Globe, MapPin, Navigation, Phone, type LucideIcon } from 'lucide-react';
import { AdPhotoMosaic } from '@kizuna/core/client/components/services/detail/ad-photo-mosaic';
import {
  ArticleBody,
  ArticleCredits,
  ArticleHeader,
  ArticleLayout,
  DirectionsCard,
  FactSheet,
  LocationMap,
  QuickActions,
} from '@kizuna/core/client/components/content';
import type { LugarActionKind, LugarFactKey, LugarView } from '@/lib/lugares';

const FACT_ICONS: Record<LugarFactKey, LucideIcon> = {
  endereco: MapPin,
  horario: Clock,
  telefone: Phone,
  site: Globe,
  instagram: AtSign,
  preco: Banknote,
};

const ACTION_ICONS: Record<LugarActionKind, LucideIcon> = {
  rota: Navigation,
  ligar: Phone,
  site: Globe,
};

/** Só compõe os blocos do core com os dados do lugar; cada bloco some sozinho quando não há dado. */
export function LugarPage({ view }: { view: LugarView }) {
  // Sem nenhum dado de lateral, o `aside` nem é passado (senão o desktop reservaria a coluna vazia).
  const hasAside = view.facts.length > 0 || view.destination !== null || view.address !== null || view.tips !== null;

  const aside = (
    <>
      <FactSheet
        rows={view.facts.map((f) => ({
          icon: FACT_ICONS[f.key],
          label: f.label,
          value: f.value,
          href: f.href,
        }))}
      />
      {view.destination ? (
        <LocationMap lat={view.destination.lat} lng={view.destination.lng} title={view.title} />
      ) : null}
      <div id="como-chegar" className="scroll-mt-24">
        <DirectionsCard destination={view.destination} address={view.address} tips={view.tips} />
      </div>
    </>
  );

  return (
    <ArticleLayout
      header={<ArticleHeader kicker={view.kicker} title={view.title} summary={view.summary} updatedAt={view.updatedAt} />}
      media={view.photos.length > 0 ? <AdPhotoMosaic photos={view.photos} alt={view.title} /> : null}
      actions={
        view.actions.length > 0 ? (
          <QuickActions
            actions={view.actions.map((a) => ({
              label: a.label,
              href: a.href,
              icon: ACTION_ICONS[a.kind],
              external: a.external,
            }))}
          />
        ) : undefined
      }
      aside={hasAside ? aside : undefined}
      footer={view.credits ? <ArticleCredits text={view.credits} /> : null}
    >
      <ArticleBody markdown={view.body} />
    </ArticleLayout>
  );
}
