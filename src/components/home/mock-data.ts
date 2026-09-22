import {
  Baby,
  Car,
  Dog,
  GraduationCap,
  Laptop,
  Leaf,
  Paintbrush,
  Scissors,
  Sparkles,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';

type IconType = ComponentType<{ className?: string }>;

export type HomeCategory = {
  slug: string;
  label: string;
  count: number;
  Icon: IconType;
};

// Placeholder catalog — the home is presentational for now. Counts and slugs are
// illustrative; category cards link to /busca with a free-text query until real
// category ids are wired.
export const HOME_CATEGORIES: HomeCategory[] = [
  { slug: 'reformas-e-reparos', label: 'Reformas e reparos', count: 128, Icon: Wrench },
  { slug: 'aulas-particulares', label: 'Aulas particulares', count: 94, Icon: GraduationCap },
  { slug: 'limpeza', label: 'Limpeza', count: 76, Icon: Sparkles },
  { slug: 'fretes-e-mudanca', label: 'Fretes e mudança', count: 52, Icon: Truck },
  { slug: 'eletrica', label: 'Elétrica', count: 41, Icon: Zap },
  { slug: 'pintura', label: 'Pintura', count: 38, Icon: Paintbrush },
  { slug: 'beleza', label: 'Beleza', count: 63, Icon: Scissors },
  { slug: 'pets', label: 'Pets', count: 29, Icon: Dog },
  { slug: 'jardinagem', label: 'Jardinagem', count: 22, Icon: Leaf },
  { slug: 'cuidadores', label: 'Cuidadores', count: 18, Icon: Baby },
  { slug: 'tecnologia', label: 'Tecnologia', count: 44, Icon: Laptop },
  { slug: 'automotivo', label: 'Automotivo', count: 31, Icon: Car },
];

export type HomePro = {
  name: string;
  trade: string;
  area: string;
  blurb: string;
  rating: number;
  reviews: number;
  availableToday: boolean;
  skills?: string[];
};

export const HOME_PROS: HomePro[] = [
  {
    name: 'Marina Alves',
    trade: 'Diarista',
    area: 'Vila Mariana, SP',
    blurb:
      'Faxina pesada, pós-obra e organização de armários. Levo o material e trabalho com produtos sem cheiro forte.',
    rating: 4.9,
    reviews: 32,
    availableToday: true,
    skills: ['Faxina pesada', 'Passar roupa', 'Organização', 'Pós-obra'],
  },
  {
    name: 'Rodrigo Pinto',
    trade: 'Eletricista',
    area: 'Santo Amaro',
    blurb: 'Instalação, quadro de luz e tomada. Orçamento na hora.',
    rating: 4.8,
    reviews: 58,
    availableToday: false,
  },
  {
    name: 'Cláudia Reis',
    trade: 'Professora de matemática',
    area: 'Online e Butantã',
    blurb: 'Reforço do fundamental ao ENEM, no seu ritmo.',
    rating: 5.0,
    reviews: 21,
    availableToday: true,
  },
  {
    name: 'Jonas Ferreira',
    trade: 'Fretes',
    area: 'Zona Sul',
    blurb: 'Mudança pequena e retirada de entulho.',
    rating: 4.7,
    reviews: 44,
    availableToday: false,
  },
  {
    name: 'Aline Souza',
    trade: 'Manicure',
    area: 'Saúde',
    blurb: 'Atendimento em domicílio, horário flexível.',
    rating: 4.9,
    reviews: 73,
    availableToday: false,
  },
  {
    name: 'Pedro Nunes',
    trade: 'Pintor',
    area: 'Ipiranga',
    blurb: 'Parede, textura e forro. Trabalho limpo e no prazo.',
    rating: 4.8,
    reviews: 26,
    availableToday: false,
  },
];
