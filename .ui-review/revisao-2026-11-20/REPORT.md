# ui-review: boracuiaba.com (produção) — 20/11/2026
Mode: standard · detector `detect.js` (ui-review 1.2.0) rodado no navegador do app (agent-browser não instalado) ·
logado como usuário normal de teste · foco em celular (360x800), com tablet (768x1024) e laptop (1366x768) na home.

Páginas: home `/cuiaba-mt`, evento `/cuiaba-mt/anuncio/…` (Simplesmente Roupa Nova), `/busca`, `/anuncie`,
`/registre-se`, `/painel`, `/painel/minha-conta`, `/painel/meus-servicos/novo`.

## Resumo
- **broken: 3** · **degraded: 9** · **polish: 5**
- Sem rolagem lateral no celular, sem imagem quebrada, sem texto de exemplo vazando.
- Os problemas sérios são de fluxo (comprar ingresso, salvar perfil, anunciar) e o cabeçalho no tablet.

## Broken
| Página | Problema | Fonte | Correção |
|---|---|---|---|
| Home (tablet 768) | Cabeçalho estoura a tela: 8 links + clima + cidade + avatar não cabem; rolagem lateral, cidade cortada ("Cuiab"), "Meu Painel" em 2 linhas | `kizuna-core/src/client/components/topbar.tsx:116`, `:139`, `:187` | Trocar `md:` por `lg:` (nav completa só a partir de 1024 px) |
| Minha conta (celular) | Barra "Salvar / Descartar" (sticky) fica **atrás da barra inferior** enquanto a pessoa edita no meio da página; só aparece no fim | barra sticky do form de conta (core) | `bottom` da barra sticky = altura da nav inferior + safe-area |
| Minha conta | Mudar só o nome não salva: exige Estado e Cidade; aviso genérico "Revise os campos destacados" longe do campo editado | validação do form de conta (core) | Validar por seção, ou endereço opcional até anunciar; rolar até o 1º erro |

## Degraded
| Página | Problema | Fonte | Correção |
|---|---|---|---|
| Evento | Nenhum botão de compra: 13 faixas de preço listadas e a forma de comprar só aparece no texto ("Como comprar: WhatsApp …") | página de anúncio (core) | Botão fixo no rodapé: "Comprar ingresso" / "Chamar no WhatsApp" |
| Home (celular) | 1ª tela sem nenhum evento (só atalhos); busca no rodapé da 1ª dobra; página com 9 telas de altura (4 notícias ≈ 3 telas) | home do starter | Busca no topo, 1ª trilha de eventos na 1ª dobra, notícias em lista compacta |
| Cadastro | Botão "Continuar com Google" aparece depois (busca no navegador) e empurra o formulário | `kizuna-core/src/client/components/auth/social-login-buttons.tsx:70-86` | Reservar a altura ou renderizar no servidor |
| Cadastro / login | Anúncio do Google carregando nas telas de autenticação | layout de auth | Sem `AdSlot` nas rotas de auth |
| Divulgar | Clicar "Divulgar" leva a uma tela de níveis: precisa verificar e-mail + nome, foto e endereço antes de anunciar | `/painel/meus-servicos/novo` | Deixar criar o rascunho já e pedir os dados na publicação |
| /anuncie | Página de captação sem ação: único botão é "Veja o Bora funcionando"; sem WhatsApp (config `whatsapp` vazio) nem "Criar anúncio" | `kizuna.config.json` (anuncie.whatsapp) | Preencher o número; botão principal "Anunciar grátis" |
| Navegação | Mesma coisa com 5 nomes: Divulgar / Nova publicação / Meus anúncios / Minhas publicações / Meu painel; a barra inferior muda entre público e painel | nav inferior + menu do painel | Um nome só ("Anunciar" e "Meus anúncios") |
| Rodapé (todas) | Links com 20 px de altura (alvo de toque < 24 px) | rodapé (core) | `py-2` nos links |
| Busca | "trocar" cidade com 32x16 px; barra laranja de título sem texto acima das categorias | `/busca` | Botão maior; remover a barra vazia ou pôr o título |

## Polish
- Textos de 10–11 px: rótulos da barra inferior, "Acontece em"/"Entrada" no evento, badges "Eventos/Shows", "~" do seletor de cidade.
- Painel sem acentos: "Nivel", "Voce so", "anuncios", "Endereco", "Proximo".
- Saudação "Bora, Bs?" usa o começo do e-mail quando não há nome.
- Página do evento mostra o seletor como "Selecionar l…" em vez da cidade.
- Busca: "Eventos e cultura" fora de ordem de data (21/11, 10/12, 27/11) — a home já ordena.

## Não coberto
- iframes (anúncios do Google) e o widget da Cloudflare (desligado nesta revisão).
- Painel root e métricas: próximas etapas.
- Sem baseline em PNG (o navegador do app não tira print de página inteira); os relatórios antigos em `.ui-review/` não tinham baseline.
