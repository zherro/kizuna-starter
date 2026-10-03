import type { Metadata } from 'next';
import { StaticPage } from '@/components/static-page';

// Página ESTÁTICA (server component). Texto-modelo: revise com o responsável jurídico e preencha
// o contato do controlador de dados antes de publicar/pedir aprovação de anúncios.
const TITLE = 'Política de privacidade';
const DESCRIPTION =
  'Como o Bora Cuiabá coleta, usa e protege seus dados, e como lidamos com cookies e anúncios.';

const PRIVACIDADE = `Esta política explica quais dados o **Bora Cuiabá** coleta, para que os usa, com quem os
compartilha e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei
13.709/2018 — LGPD).

## 1. Dados que coletamos

- **Conta:** e-mail (ou telefone), nome de exibição e senha (guardada de forma criptografada).
  Se você entrar com o Google, recebemos nome e e-mail da sua conta Google.
- **Anúncios e perfil:** o que você publica (textos, fotos, preços, endereço e contatos que
  escolher divulgar) e preferências da conta.
- **Chamados e contato:** nome, e-mail, telefone (opcional), mensagem e imagens que você enviar
  pelo formulário de contato ou pelos chamados.
- **Localização aproximada:** a cidade que você escolhe no topo do site e, se não escolher, uma
  estimativa pelo endereço IP. Não usamos GPS sem a sua autorização.
- **Uso do site:** páginas visitadas, cliques e dados técnicos (navegador, dispositivo, IP),
  para segurança, estatísticas e melhoria do serviço.

## 2. Para que usamos

Criar e manter sua conta, exibir anúncios, responder chamados, prevenir fraudes e abuso, cumprir
obrigações legais, medir o uso do site e melhorar a experiência. Não vendemos seus dados.

## 3. Cookies e armazenamento local

Usamos cookies e armazenamento do navegador para:

- **Essenciais:** manter você logado (cookie de sessão) e proteger formulários.
- **Preferências:** lembrar cidade, tema e idioma.
- **Estatísticas:** entender como o site é usado.
- **Publicidade:** quando houver anúncios, parceiros como o Google usam cookies para exibi-los.

Você pode bloquear ou apagar cookies nas configurações do navegador; sem os essenciais, partes
do site (como o login) deixam de funcionar.

## 4. Publicidade e Google AdSense

O Bora Cuiabá pode exibir anúncios do Google AdSense. O Google, como fornecedor terceiro, usa
cookies para exibir anúncios com base em visitas anteriores a este e a outros sites. O uso de
cookies de publicidade permite que o Google e seus parceiros exibam anúncios para você com base
na sua navegação.

- Você pode desativar a publicidade personalizada em
  [Configurações de anúncios do Google](https://adssettings.google.com).
- Também pode optar por não receber anúncios personalizados de outros fornecedores em
  [www.aboutads.info](https://www.aboutads.info/choices/).
- Saiba como o Google usa dados de sites parceiros em
  [policies.google.com/technologies/partner-sites](https://policies.google.com/technologies/partner-sites).

## 5. Com quem compartilhamos

Compartilhamos dados apenas com prestadores necessários ao serviço, sob dever de proteção:

- hospedagem e infraestrutura do site;
- **Google** (login com Google e, quando houver, publicidade);
- **Cloudflare Turnstile** (verificação anti-robô em formulários);
- serviço de previsão do tempo (Open-Meteo), que recebe apenas a cidade exibida;
- serviço de otimização de imagens enviadas.

Também podemos divulgar dados por obrigação legal ou ordem de autoridade. As informações que
você publica num anúncio ficam visíveis a qualquer visitante.

## 6. Por quanto tempo guardamos

Enquanto a conta existir e pelo prazo necessário para cumprir obrigações legais ou resolver
disputas. Ao excluir a conta, ela é desativada e os dados de login são removidos; registros que a
lei exige manter, e chamados de suporte, podem ser preservados pelo prazo legal.

## 7. Seus direitos (LGPD)

Você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou
exclusão, portabilidade, informação sobre compartilhamento e revogação de consentimento. A
exclusão da conta pode ser feita por você em **Minha conta**, no painel. Para os demais pedidos,
use a página de [Contato](/contato).

## 8. Segurança

Adotamos medidas técnicas e organizacionais para proteger os dados: senhas criptografadas,
conexão segura (HTTPS), controle de acesso por conta e bloqueio de tentativas abusivas de login.
Nenhum sistema é totalmente invulnerável; avise-nos se suspeitar de uso indevido da sua conta.

## 9. Menores de idade

A plataforma é destinada a maiores de 18 anos ou a menores assistidos pelos responsáveis. Não
coletamos dados de crianças de forma intencional; se identificarmos, removeremos.

## 10. Alterações

Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A versão vigente
fica sempre nesta página, com a data da última atualização abaixo.

## 11. Contato

Dúvidas ou pedidos sobre seus dados: [Entrar em Contato](/contato).

*Última atualização: outubro de 2026.*
`;

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION };

export default function PrivacidadePage() {
  return (
    <StaticPage slug="privacidade" title={TITLE} description={DESCRIPTION} content={PRIVACIDADE} />
  );
}
