# ui-review: /painel/meus-servicos/[id] — passo "Onde você atende" (evento) — 2026-11-06
Mode: standard (navegador embutido + detect.js do ui-review 1.2.0; agent-browser não instalado) · mobile 360x800 e laptop 1366x768

## Resumo
9 achados corrigidos, nenhum pendente. Endereço agora é só o resumo; edição no painel
(lateral no desktop, tela cheia com rodapé fixo no mobile).

## Corrigidos
| Sev | Onde | Problema | Correção |
|---|---|---|---|
| broken | painel, mobile | Lista de Cidade/UF abria para baixo e sumia atrás do rodapé fixo | Campo focado é centralizado na área rolável + folga no fim (`EditAddressDrawer`) |
| degraded | console | "Cannot update a component while rendering AddressForm" — `onChange` dentro do updater do `setState` | `updateAddress` usa ref do último valor e chama `onChange` fora do updater |
| degraded | painel | Título trocava de "Adicionar" para "Editar endereço" enquanto digitava o CEP | Título fixado na abertura |
| degraded | passo | Com 1 endereço (evento): apelido, selo Principal, lixeira e "Limite de endereços atingido" sem função | `maxAddresses <= 1` → só o resumo |
| degraded | passo | Aviso amarelo de campos faltando aparecia antes de qualquer interação, e repetia o que o card diz | Só após começar a preencher; com endereço único quem avisa é o card |
| degraded | passo | Título "Endereços de atendimento / Marque um como principal" em evento | `labels.addressesTitle/Hint` do grupo eventos no kizuna.config.json |
| polish | painel | "Sem CEP? Informar latitude e longitude": alvo de toque 231x16 | `min-h-9` |
| polish | painel | CEP opcional (evento) mas o CEP vinha antes da busca | Busca primeiro quando o CEP é opcional |

| polish | `Field` | Inputs Endereço/Número/Complemento/Bairro sem nome acessível (label sem `htmlFor`) | `useId` + `htmlFor`/`id` no `Field` |

## Pendente
Nenhum.

## Não coberto
- Preenchimento pelo "Local do evento": o banco local não tem lugar com endereço cadastrado.
- Consulta de CEP: `/api/location/cep` não respondeu localmente (o formulário mostrou a mensagem certa de serviço indisponível).

## Console / rede
- Sem erros do componente após a correção. 502 em `/api/location/resolve` e 500 em `/api/weather` são do ambiente local, sem relação.
