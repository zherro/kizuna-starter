import type { Metadata } from 'next';
import { StaticPage } from '@kizuna/core/client/components/pages/static-page';

// Página ESTÁTICA (texto no código, sem banco). O formulário de cadastro aponta para /termos; esta
// pasta existe para a rota estática vencer o `[cidade]`, senão "termos" seria lido como slug de
// cidade e daria 404. Para editar o texto, mude TERMOS abaixo.
const TITLE = 'Termos de uso';
const DESCRIPTION = 'As regras para usar o Bora Cuiabá e as responsabilidades de cada parte.';

const TERMOS = `# Termos de Uso

Estes Termos de Uso regulam o acesso e a utilização do **Bora Cuiabá**. Ao acessar ou utilizar a plataforma, o usuário declara estar ciente das condições aqui estabelecidas e da legislação aplicável.

## 1. Sobre a plataforma

O Bora Cuiabá é uma plataforma digital destinada à divulgação e consulta de informações sobre serviços, eventos, cinema, lazer, estabelecimentos e outras opções disponíveis em Cuiabá, Várzea Grande, Chapada dos Guimarães e região.

A plataforma atua como um ambiente de divulgação e conexão entre usuários e anunciantes, podendo disponibilizar conteúdos próprios, informações de terceiros e funcionalidades de interação.

Salvo quando expressamente indicado, o Bora Cuiabá não é responsável pela prestação dos serviços, realização dos eventos ou execução das atividades divulgadas por terceiros.

## 2. Aceitação e utilização

Ao utilizar a plataforma, o usuário concorda com estes Termos de Uso e se compromete a observar a legislação aplicável e as regras de utilização dos serviços.

Caso não concorde com as condições estabelecidas, deverá deixar de utilizar as funcionalidades correspondentes.

## 3. Cadastro e conta

Algumas funcionalidades podem exigir cadastro ou autenticação.

O usuário compromete-se a fornecer informações adequadas e atualizadas, manter a segurança de suas credenciais e utilizar sua conta de forma responsável.

O usuário é responsável pelas atividades realizadas por meio de sua conta, observadas as circunstâncias e responsabilidades previstas na legislação aplicável. Suspeitas de acesso indevido devem ser comunicadas pelos canais de atendimento.

A utilização de determinadas funcionalidades poderá estar sujeita a requisitos específicos de idade, autorização ou outras condições legais.

## 4. Publicações e anúncios

Os usuários que publicarem conteúdos na plataforma são responsáveis pelas informações fornecidas e comprometem-se a:

- Disponibilizar informações lícitas, corretas e compatíveis com o conteúdo anunciado.
- Possuir os direitos ou as autorizações necessários para utilizar textos, imagens, marcas e demais materiais publicados.
- Manter as informações relevantes atualizadas sempre que necessário.
- Respeitar os direitos de terceiros e a legislação aplicável.
- Não utilizar a plataforma para práticas fraudulentas, enganosas, abusivas ou ilícitas.

O Bora Cuiabá poderá adotar medidas relacionadas a conteúdos ou contas que apresentem indícios de irregularidade, violem estes termos ou representem riscos à plataforma ou a terceiros. Essas medidas poderão incluir solicitação de ajustes, restrição de funcionalidades, ocultação ou remoção de conteúdo e suspensão de acesso, conforme o caso e a legislação aplicável.

## 5. Informações e conteúdos de terceiros

A plataforma poderá apresentar informações provenientes de fontes públicas, parceiros, estabelecimentos, organizadores e outros terceiros, incluindo dados sobre eventos, programação, horários, preços, locais e disponibilidade.

Embora possam ser adotadas medidas para manter essas informações atualizadas, não é possível garantir que todos os dados estejam sempre completos, corretos ou atualizados em tempo real.

O usuário deverá verificar informações relevantes diretamente com o respectivo estabelecimento, anunciante ou organizador antes de tomar decisões, realizar deslocamentos ou contratar serviços.

## 6. Relações entre usuários e anunciantes

As informações divulgadas na plataforma destinam-se a facilitar a descoberta de serviços, estabelecimentos, eventos e outras oportunidades.

Quando houver negociação, contratação ou prestação de serviços por terceiros, as condições específicas da relação deverão ser verificadas diretamente entre os envolvidos.

O Bora Cuiabá não garante a disponibilidade, a qualidade, a adequação ou o resultado dos produtos, serviços e atividades divulgados por terceiros. Sua atuação e eventual responsabilidade serão determinadas conforme as funcionalidades efetivamente oferecidas e a legislação aplicável.

A plataforma poderá passar por manutenções, atualizações ou interrupções decorrentes de fatores técnicos, operacionais ou externos. Não há garantia de disponibilidade contínua e ininterrupta.

## 7. Interações e participação da comunidade

A plataforma poderá disponibilizar recursos como curtidas, votações, avaliações, eleições de destaque ou outras formas de participação.

Essas funcionalidades deverão ser utilizadas de maneira legítima e de boa-fé. É vedada a manipulação fraudulenta de resultados, inclusive por meio de contas falsas, automações indevidas ou outros mecanismos destinados a comprometer a integridade das interações.

Interações que apresentem indícios de irregularidade poderão ser analisadas e desconsideradas, conforme as características da funcionalidade e as regras aplicáveis.

## 8. Condutas proibidas

O usuário compromete-se a não utilizar a plataforma para:

- Praticar atos ilícitos ou violar direitos de terceiros.
- Publicar conteúdos fraudulentos, abusivos ou incompatíveis com estes termos.
- Tentar comprometer a segurança, a integridade ou o funcionamento dos serviços.
- Acessar áreas ou informações sem a devida autorização.
- Coletar ou utilizar dados de outros usuários de maneira ilícita ou não autorizada.
- Usar indevidamente identidades, marcas ou informações de terceiros.
- Interferir de forma abusiva na utilização da plataforma por outras pessoas.

A violação destas regras poderá resultar na adoção de medidas compatíveis com a natureza da ocorrência, observados os direitos envolvidos e a legislação aplicável.

## 9. Propriedade intelectual

A marca Bora Cuiabá, sua identidade visual, seus elementos gráficos, software, layout e demais materiais próprios são protegidos pela legislação aplicável e não podem ser utilizados de forma não autorizada.

Os usuários permanecem responsáveis pelos conteúdos que publicam e devem possuir os direitos necessários para sua utilização.

Ao publicar conteúdo na plataforma, o usuário autoriza sua utilização não exclusiva, na medida necessária à disponibilização, operação, divulgação e promoção dos serviços do Bora Cuiabá, respeitados os direitos aplicáveis e a finalidade da publicação.

Essa autorização não implica transferência da titularidade do conteúdo ao Bora Cuiabá. O usuário deverá comunicar eventuais questões relacionadas aos direitos sobre materiais publicados pelos canais de atendimento.

## 10. Privacidade e dados pessoais

O tratamento de dados pessoais relacionado à utilização da plataforma observará a legislação aplicável, especialmente a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).

As informações poderão ser utilizadas para disponibilizar funcionalidades, administrar contas, prestar atendimento, proteger os serviços e cumprir obrigações legais, entre outras finalidades legítimas descritas na Política de Privacidade.

Para obter informações sobre o tratamento de dados pessoais e exercer os direitos previstos na legislação, consulte a [Política de Privacidade](/privacidade) ou utilize os canais de atendimento da plataforma.

## 11. Alterações e disponibilidade dos serviços

O Bora Cuiabá poderá modificar, atualizar, ampliar ou descontinuar funcionalidades, conteúdos e recursos da plataforma, observadas as obrigações legais aplicáveis.

Estes termos poderão ser atualizados para refletir mudanças nos serviços ou na legislação. A versão vigente será disponibilizada nesta página, acompanhada da respectiva data de atualização.

Quando necessário, alterações relevantes poderão ser comunicadas por meios adequados.

## 12. Contato

Dúvidas, solicitações, denúncias ou comunicações relacionadas à utilização da plataforma poderão ser encaminhadas pelos canais de atendimento disponibilizados pelo Bora Cuiabá, incluindo a página de [Contato](/contato).`;

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION };

export default function TermosPage() {
  return <StaticPage slug="termos" title={TITLE} description={DESCRIPTION} content={TERMOS} />;
}
