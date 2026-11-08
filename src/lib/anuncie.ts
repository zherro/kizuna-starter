// Conteúdo das páginas de captação de parceiros (/anuncie). Só texto e configuração: os blocos
// visuais vêm de `@kizuna/core/client/components/landing`. Regras: nada de número, prazo, preço
// ou promessa de resultado; o Bora divulga e leva ao link de quem vende.
import { whatsappLink } from '@kizuna/core/client/components/landing';

/** WhatsApp do Bora (só dígitos, com DDI: 5565…). [PREENCHER] — vazio abre o WhatsApp sem contato. */
export const WHATSAPP_NUMBER = '';

/** E-mail de contato, mostrado no fim das páginas. [PREENCHER] — vazio não mostra nada. */
export const CONTACT_EMAIL = '';

export const REGION_TEXT = 'Cuiabá, Várzea Grande e Chapada dos Guimarães';

export const COMMON_SUMMARY = `O Bora Cuiabá reúne eventos, cinema e lugares de ${REGION_TEXT} num só lugar.`;

export const BADGES = ['Anunciar é gratuito', 'O Bora só divulga'];

export const PILLARS = [
  { title: 'Eventos', text: 'O que acontece hoje e nos próximos dias.' },
  { title: 'Cinema', text: 'Os filmes em cartaz.' },
  { title: 'Lugares', text: 'Bares, parques e outros lugares da região.' },
];

export const PILLARS_INTRO =
  'A página /hoje mostra o que acontece hoje, nos próximos dias e o cinema em cartaz. Quem vende ingresso continua vendendo no próprio link.';

export type Point = { title: string; text: string };

export type Audience = {
  slug: string;
  /** Nome curto, usado nos cartões de /anuncie. */
  name: string;
  seoTitle: string;
  seoDescription: string;
  hook: string;
  eyebrow: string;
  problems: Point[];
  gains: Point[];
  steps: { title: string; text?: string }[];
  whatsappMessage: string;
  poster?: { title: string; quote: string; text: string };
};

const STEP_1 = { title: 'Fale com a gente', text: 'Toque no botão e mande um oi no WhatsApp.' };

export const AUDIENCES: Audience[] = [
  {
    slug: 'pousadas',
    name: 'Pousadas',
    seoTitle: 'Anuncie sua pousada no Bora Cuiabá',
    seoDescription:
      'Divulgue sua pousada no Bora Cuiabá: eventos, cinema e lugares num só lugar para o hóspede saber o que fazer hoje. Anunciar é gratuito.',
    hook: 'O hóspede pergunta: o que fazer hoje? Responda com o Bora Cuiabá.',
    eyebrow: 'Para pousadas',
    problems: [
      { title: 'Tem algo hoje?', text: 'Todo hóspede quer saber o que fazer na cidade, e rápido.' },
      { title: 'Informação espalhada', text: 'Agenda em vários sites e redes: difícil de achar e de confiar.' },
      { title: 'O Bora junta', text: 'Eventos, cinema e lugares num só lugar, sempre atualizado.' },
    ],
    gains: [
      { title: 'Recepção afiada', text: 'Escaneie o QR no balcão e mostre o que rola hoje em segundos.' },
      { title: 'Hóspede feliz', text: 'Programação resolvida deixa a estadia mais completa.' },
      { title: 'Visibilidade', text: 'Divulgue sua pousada para quem procura o que fazer na cidade.' },
    ],
    steps: [
      STEP_1,
      { title: 'Envie as infos', text: 'Nome, fotos, endereço e o que sua pousada oferece.' },
      { title: 'Apareça no Bora', text: 'A gente confere e publica. Anunciar é gratuito.' },
    ],
    whatsappMessage: 'Oi! Vi o Bora Cuiabá e quero anunciar minha pousada.',
    poster: {
      title: 'Cartaz de recepção',
      quote: 'O que fazer hoje em Cuiabá? Escaneie e veja os eventos, o cinema e os lugares do dia',
      text: 'Um cartaz para o balcão da recepção, apontando para a página /hoje do Bora.',
    },
  },
  {
    slug: 'bares',
    name: 'Bares',
    seoTitle: 'Anuncie seu bar no Bora Cuiabá',
    seoDescription:
      'Coloque seu bar e a programação de shows e eventos no Bora Cuiabá, na lista de quem quer sair hoje. Anunciar é gratuito.',
    hook: 'Seu bar na lista de quem quer sair hoje.',
    eyebrow: 'Para bares',
    problems: [
      { title: 'Onde eu vou?', text: 'Quem vai sair quer ver as opções do dia num só lugar.' },
      { title: 'Ninguém sabe', text: 'Show ou evento no bar perde público quando poucos ficam sabendo.' },
      { title: 'O Bora junta', text: 'Eventos, cinema e lugares de Cuiabá e região, com o que rola hoje.' },
    ],
    gains: [
      { title: 'Na hora certa', text: 'Apareça para quem procura o que fazer hoje e nos próximos dias.' },
      { title: 'Sua agenda', text: 'Divulgue os shows e eventos que acontecem no seu bar.' },
      { title: 'Visibilidade', text: 'Seu bar na lista de quem escolhe onde ir em Cuiabá e região.' },
    ],
    steps: [
      STEP_1,
      { title: 'Envie o bar', text: 'Nome, endereço, fotos e a programação.' },
      { title: 'Apareça no Bora' },
    ],
    whatsappMessage: 'Oi! Vi o Bora Cuiabá e quero anunciar meu bar.',
  },
  {
    slug: 'produtores-de-eventos',
    name: 'Produtores de eventos',
    seoTitle: 'Anuncie seu evento no Bora Cuiabá',
    seoDescription:
      'Divulgue seu evento no Bora Cuiabá: data, horário, local e link de compra numa página clara. O Bora divulga, você vende no seu link.',
    hook: 'Seu evento na agenda de quem quer sair hoje.',
    eyebrow: 'Para produtores de eventos',
    problems: [
      { title: 'Ser encontrado', text: 'Quem procura o que fazer hoje quer ver tudo num lugar só.' },
      { title: 'Divulgação solta', text: 'Evento bom perde força quando a informação está espalhada.' },
      { title: 'O Bora organiza', text: 'Data, horário, local e link de compra numa página clara.' },
    ],
    gains: [
      { title: 'Na agenda do dia', text: 'Aparece para quem busca o que fazer hoje e nos próximos dias.' },
      { title: 'Tudo organizado', text: 'Data, horário, local, preços e link de compra bem apresentados.' },
      { title: 'Venda no seu link', text: 'O Bora divulga e leva o público para o seu link de venda.' },
    ],
    steps: [
      STEP_1,
      { title: 'Envie o evento', text: 'Nome, data, horário, local, ingressos e imagem.' },
      { title: 'Apareça no Bora' },
    ],
    whatsappMessage: 'Oi! Vi o Bora Cuiabá e quero anunciar meu evento.',
  },
  {
    slug: 'guias-de-turismo',
    name: 'Guias de turismo',
    seoTitle: 'Anuncie seu passeio no Bora Cuiabá',
    seoDescription:
      'Guias e agências: divulgue seu passeio no Bora Cuiabá e tenha à mão o que fazer à noite, com eventos, cinema, bares e parques.',
    hook: 'E à noite, o que tem pra fazer? Tenha a resposta no Bora Cuiabá.',
    eyebrow: 'Para guias de turismo',
    problems: [
      { title: 'E à noite?', text: 'O grupo pergunta o que fazer depois do passeio.' },
      { title: 'Palpite não vale', text: 'Roteiro bom precisa de horário e local certos.' },
      { title: 'O Bora responde', text: 'Eventos, cinema, bares e parques de Cuiabá e região num só lugar.' },
    ],
    gains: [
      { title: 'Consulta rápida', text: 'Veja o que rola hoje e nos próximos dias, com horário e local.' },
      { title: 'Mais opções', text: 'Eventos, cinema, bares e parques para depois do passeio.' },
      { title: 'Visibilidade', text: 'Divulgue seu passeio ou agência para quem está na cidade.' },
    ],
    steps: [
      STEP_1,
      { title: 'Envie o passeio', text: 'Nome, descrição, fotos, ponto de encontro e contato.' },
      { title: 'Apareça no Bora' },
    ],
    whatsappMessage: 'Oi! Vi o Bora Cuiabá e quero anunciar meu passeio.',
  },
];

export const GENERIC_WHATSAPP_MESSAGE = 'Oi! Vi o Bora Cuiabá e quero anunciar.';

export const audienceHref = (slug: string) => `/anuncie/${slug}`;
export const findAudience = (slug: string) => AUDIENCES.find((a) => a.slug === slug);
export const whatsappFor = (message: string) => whatsappLink(WHATSAPP_NUMBER, message);

/** Caminhos de todas as páginas de captação (sitemap). */
export const ANUNCIE_PATHS = ['/anuncie', ...AUDIENCES.map((a) => audienceHref(a.slug))];
