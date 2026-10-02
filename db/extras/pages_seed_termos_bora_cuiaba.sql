-- db/extras/pages_seed_termos_bora_cuiaba.sql
--
-- Seed da página pública /termos (plugin pages) do Bora Cuiabá. O formulário de cadastro
-- (register-form) aponta para `/termos`, e o seed neutro do plugin só traz `termos-de-uso`,
-- então este arquivo publica o slug `termos` com texto específico do projeto.
--
-- Pré-requisitos: schema do core + plugin pages aplicados e um usuário root já cadastrado
-- (tenant_id/created_by vêm do primeiro root e do tenant dele, igual ao seed neutro de páginas;
-- sem root o INSERT vira no-op silencioso).
--
-- Idempotente: se o slug já existir, não sobrescreve (edições feitas no painel em
-- /painel/administracao/paginas são preservadas). Para forçar o texto deste arquivo, troque
-- DO NOTHING por DO UPDATE ou apague a página antes.
--
-- Aplicar:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/extras/pages_seed_termos_bora_cuiaba.sql
--   (Docker: docker exec -i <container> psql -U <user> -d <db> -v ON_ERROR_STOP=1 < db/extras/pages_seed_termos_bora_cuiaba.sql)

INSERT INTO public.pages (slug, title, description, content, status, active, tenant_id, created_by)
SELECT
    v.slug,
    v.title,
    v.description,
    v.content,
    'published',
    true,
    t.uid,
    u.uid
FROM (VALUES
    (
        'termos',
        'Termos de uso',
        'As regras para usar o Bora Cuiabá e as responsabilidades de cada parte.',
        $md$# Termos de uso

Estes termos regulam o uso do **Bora Cuiabá**. Ao acessar o site, criar uma conta ou
publicar um anúncio, você concorda com as condições abaixo. Leia com atenção.

## 1. O que é o Bora Cuiabá

O Bora Cuiabá é uma plataforma que reúne anúncios de serviços, eventos, cinema e
outras opções de lazer e consumo em Cuiabá, Várzea Grande, Chapada dos Guimarães e
região. Ela conecta quem procura a quem oferece, mas **não presta os serviços
anunciados** nem participa da negociação entre as partes.

## 2. Aceitação dos termos

O uso da plataforma implica a aceitação integral destes termos. Se você não
concorda com alguma disposição, não utilize os serviços oferecidos.

## 3. Cadastro e conta

Para anunciar, curtir, votar ou usar outros recursos é preciso criar uma conta com
informações verdadeiras, completas e atualizadas. Você é responsável por manter a
confidencialidade da sua senha e por tudo o que for feito na sua conta. Avise-nos
imediatamente se suspeitar de uso indevido.

A plataforma é destinada a maiores de 18 anos ou a menores devidamente assistidos
por seus responsáveis legais.

## 4. Regras para anúncios

Quem anuncia se compromete a:

- publicar apenas informações verdadeiras, atuais e que possa comprovar;
- usar textos e imagens próprios ou com autorização de quem detém os direitos;
- manter preço, horário, endereço e contato atualizados;
- não anunciar produtos ou serviços ilegais, enganosos ou que violem direitos de
  terceiros;
- não duplicar anúncios nem usar categorias ou cidades que não correspondam ao
  serviço.

Anúncios que descumprirem estas regras podem ser editados, ocultados ou removidos
sem aviso prévio, e a conta pode ser suspensa em caso de reincidência.

## 5. Conteúdo importado e informações de terceiros

Parte dos anúncios, como programação de cinema e eventos, é obtida de fontes
públicas e atualizada de forma automática. Fazemos o possível para manter os dados
corretos, mas horários, preços e disponibilidade podem mudar sem aviso. Confirme
sempre com o estabelecimento antes de se deslocar ou de contratar.

## 6. Responsabilidades

A negociação, a contratação, o pagamento e a execução dos serviços acontecem
diretamente entre usuário e anunciante, que são os únicos responsáveis por suas
informações, atos e compromissos. O Bora Cuiabá não garante a qualidade, a
segurança ou o resultado de qualquer serviço anunciado, nem responde por danos
decorrentes da relação entre as partes.

A plataforma pode ficar indisponível por manutenção ou por fatores fora do nosso
controle, e não garante funcionamento ininterrupto.

## 7. Eleição e interações da comunidade

Recursos como curtidas, votações e eleições de destaque devem ser usados de boa-fé.
É proibido manipular resultados com contas falsas, automações ou qualquer meio
fraudulento. Votos e interações suspeitos podem ser desconsiderados.

## 8. Conduta proibida

É vedado tentar comprometer a segurança ou o funcionamento da plataforma, coletar
dados de outros usuários de forma automatizada sem autorização, publicar conteúdo
ofensivo, discriminatório ou ilegal e se passar por outra pessoa ou empresa.

## 9. Propriedade intelectual

Marca, identidade visual, textos, layout e software do Bora Cuiabá são protegidos
e não podem ser copiados ou reutilizados sem autorização prévia. O conteúdo
publicado por cada usuário continua sendo de sua propriedade e responsabilidade;
ao publicá-lo, você nos autoriza a exibi-lo na plataforma e em suas divulgações.

## 10. Privacidade e dados pessoais

Tratamos os dados pessoais conforme a Lei Geral de Proteção de Dados (Lei
13.709/2018), apenas para operar a plataforma, autenticar usuários, exibir
anúncios e melhorar o serviço. Você pode solicitar a correção ou a exclusão dos
seus dados, inclusive a exclusão da conta, pelo painel ou pelos nossos canais de
atendimento.

## 11. Alterações nos termos

Estes termos podem ser atualizados a qualquer momento para refletir mudanças no
serviço ou na legislação. A versão vigente estará sempre nesta página, e o uso
continuado da plataforma após a alteração representa concordância com o novo texto.

## 12. Lei aplicável e foro

Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito
o foro da comarca de Cuiabá, Mato Grosso, para resolver qualquer controvérsia,
ressalvado o direito do consumidor de ajuizar ação em seu domicílio.

## 13. Contato

Dúvidas, denúncias de anúncios ou solicitações sobre seus dados podem ser enviadas
pelos canais de atendimento divulgados na plataforma, incluindo os chamados abertos
pelo painel.
$md$
    )
) AS v(slug, title, description, content)
JOIN LATERAL (
    SELECT uid FROM auth.users WHERE is_root = true ORDER BY created_at ASC LIMIT 1
) AS u(uid) ON true
JOIN LATERAL (
    SELECT tn.uid FROM auth.tenants tn WHERE tn.owner_uid = u.uid ORDER BY tn.created_at ASC LIMIT 1
) AS t(uid) ON true
ON CONFLICT ON CONSTRAINT pages_tenant_slug_unique DO NOTHING;

NOTIFY pgrst, 'reload schema';
