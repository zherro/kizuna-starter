import type { Metadata } from 'next';
import { StaticPage } from '@/components/static-page';

// Página ESTÁTICA (server component). Complete com a identificação de quem edita o site (nome,
// empresa, e-mail de contato) — o revisor de anúncios valoriza saber quem está por trás do site.
const TITLE = 'Sobre o Bora Cuiabá';
const DESCRIPTION =
  'Conheça o Bora Cuiabá: eventos, lugares, cinema e dicas de lazer em Cuiabá e região.';

const SOBRE = `O **Bora Cuiabá** é um guia local de lazer, cultura e serviços em Cuiabá, Várzea Grande,
Chapada dos Guimarães e região. Reunimos num só lugar os eventos, a programação de cinema, os
lugares para conhecer e as opções de quem oferece serviços na cidade.

## O que você encontra aqui

- **Eventos e programação:** o que está acontecendo na cidade, com data, local e detalhes.
- **Cinema:** filmes em cartaz e horários nas salas da região.
- **Lugares e serviços:** anúncios de estabelecimentos e profissionais, organizados por categoria
  e por cidade.
- **Eleição da comunidade:** votações para destacar os melhores lugares e serviços.

## Como funciona

Quem procura navega por categorias ou usa a busca, compara as opções e entra em contato direto
com o anunciante. Quem oferece um serviço ou evento cria uma conta, cadastra o anúncio com fotos
e descrição e acompanha tudo pelo painel.

## Nossos princípios

- **Informação clara:** dados atualizados e sem letras miúdas.
- **Respeito:** as mesmas regras para usuários, anunciantes e parceiros.
- **Segurança:** cuidado com seus dados, conforme a nossa
  [Política de privacidade](/privacidade) e os [Termos de uso](/termos).
- **Melhoria contínua:** ouvimos quem usa o site e evoluímos a partir disso.

## Fale com a gente

Sugestões, dúvidas, denúncias de anúncios ou interesse em divulgar o seu negócio: use a página
de [Contato](/contato). A equipe responde pelo painel.
`;

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION };

export default function SobrePage() {
  return <StaticPage slug="sobre" title={TITLE} description={DESCRIPTION} content={SOBRE} />;
}
