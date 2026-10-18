# Pendências

Lista unificada do que falta fazer. Última revisão: 2026-10-18.
Ao concluir um item, remova-o daqui.

## Segurança (bloqueia produção)

Detalhes em [`kizuna-core/docs/manutencao/avaliacao-seguranca.md`](../../kizuna-core/docs/manutencao/avaliacao-seguranca.md):
os 9 bloqueadores foram corrigidos em 18/10/2026 — falta aplicar as migrations, trocar o segredo JWT e
religar o PostgREST local em 127.0.0.1 (seção "Para fechar"). Abertos: 12 médios e os baixos.

## Documentação

1. Escrever documentação retroativa curta (decisão + como funciona) para o que foi entregue sem design:
   busca estilo OLX, eventos por grupo, regiões, tags/vínculos, verificação de e-mail, login Google One Tap,
   miniaturas/otimização de imagem no storage, revisão por IA e a casca do swipe no core.

## IA (`ai_assistant`)

Detalhes em [`kizuna-core/docs/manutencao/todo-ai.md`](../../kizuna-core/docs/manutencao/todo-ai.md).

2. Structured output no `OpenAiProvider`.
3. Tabela `ai_assistant_usage` para telemetria.
4. Rate-limit persistente (hoje em memória).
5. `/api/ai/criar-anuncio` devolve 503 em vez de 429 no rate-limit.
6. `GET /api/ai/contexts`, para a tela não usar `AI_CONTEXTS` fixo.
7. Seletor de modelo em lista quando houver mais de um provider.
8. Streaming das respostas.
9. Contexto de atendimento ao cliente (integrar `messaging`).
10. Aprovar/rejeitar revisão de texto, aplicando `revised_text` no anúncio.

## Agenda (v2)

11. "Ver todos os eventos" na página do lugar.
12. Busca indexando `artistas[]`.
