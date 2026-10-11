import type { Metadata } from 'next';
import { StaticPage } from '@kizuna/core/client/components/pages/static-page';

// Página ESTÁTICA (server component). Complete com a identificação de quem edita o site (nome,
// empresa, e-mail de contato) — o revisor de anúncios valoriza saber quem está por trás do site.
const TITLE = 'Sobre o Bora Cuiabá';
const DESCRIPTION =
  'Conheça o Bora Cuiabá: eventos, lugares, cinema e dicas de lazer em Cuiabá e região.';

const SOBRE = `# Sobre o Bora Cuiabá

O **Bora Cuiabá** é um guia local de lazer, cultura e serviços em Cuiabá, Várzea Grande, Chapada dos Guimarães e região.

Nosso objetivo é reunir em um só lugar opções para quem quer descobrir o que fazer, conhecer novos lugares, acompanhar eventos e encontrar serviços na região.

## O que você encontra aqui

- **Eventos e programação:** descubra festas, shows, atividades e outras atrações da região.
- **Cinema:** consulte filmes em cartaz e informações sobre a programação das salas de cinema.
- **Lugares e serviços:** encontre estabelecimentos, profissionais e opções de lazer organizados por categorias e cidades.
- **Comunidade:** participe de votações, descubra destaques e interaja com as opções disponíveis na plataforma.

## Como funciona

Se você está procurando algo para fazer ou um serviço, pode explorar as categorias, consultar as publicações e entrar em contato diretamente com os responsáveis pelas opções divulgadas.

Se você oferece um serviço, administra um estabelecimento ou organiza eventos, pode criar uma conta e utilizar as funcionalidades disponíveis para divulgar suas atividades na plataforma.

## Nossos princípios

- **Clareza:** facilitar o acesso às informações e tornar a navegação simples.
- **Respeito:** promover uma experiência positiva para usuários, anunciantes e parceiros.
- **Privacidade:** tratar as informações pessoais conforme a legislação aplicável e nossa [Política de Privacidade](/privacidade).
- **Evolução:** aprimorar continuamente a plataforma a partir das necessidades da comunidade.

## Faça parte

O Bora Cuiabá está aqui para aproximar pessoas, lugares, experiências e oportunidades da nossa região.

Tem alguma sugestão, encontrou uma informação que precisa de atenção ou quer divulgar seu negócio? Acesse nossa página de [Contato](/contato).

Para conhecer as condições de utilização da plataforma, consulte também os [Termos de Uso](/termos).`;

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION };

export default function SobrePage() {
  return <StaticPage slug="sobre" title={TITLE} description={DESCRIPTION} content={SOBRE} />;
}
