---
name: criar-depara
description: Use ao criar ou atualizar um de-para de importação (crawler/robô → banco do Kizuna) para uma categoria nova, ou ao mudar schema, seed, taxonomia ou formulário que já tem de-para. O de-para é o documento que outra IA/robô segue para inserir anúncios direto no Postgres.
---

# Criar um de-para de importação

## Overview

Um **de-para** é o documento em `docs/integracoes/<categoria>-depara.md` que diz a um robô (crawler Python + IA) **onde gravar cada campo** de um payload no banco e **em que ordem**. Modelo de referência, sempre atual: `docs/integracoes/cinema-depara.md`. Copie a estrutura dele; não invente outra.

O robô só sabe o que está no documento. Escreva **o que fazer**, não porquê nem histórico: sem log de validação, sem "resolvido", sem legenda de status.

## Quando usar

- Categoria nova com crawler/importador (ex.: eventos, restaurantes, hotéis).
- Mudou algo que o de-para cita: coluna de `services`, `service_addresses`, `forms_seed_*`, taxonomia, migration, regra de subcategoria. **Atualize o de-para no mesmo trabalho.**

## Passos

### 1. Entenda o contrato de entrada
Peça o contrato do payload (lista de campos com caminho, tipo, obrigatório, origem). Sem ele não há de-para. Identifique: 1 arquivo = 1 anúncio? chave natural de idempotência (`origem.*`)? campos derivados/fixos?

### 2. Decida o destino de cada campo
Ordem de preferência (leia o esquema real em `kizuna-core/plugins/*/*.sql`, nunca de memória):

| O dado é... | Destino |
|---|---|
| título, descrição, preço, status, criação, validade | colunas de `public.services` (`title`, `description`, `starting_price`, `price_unit`, `status`, `created_at`, `expires_at`) |
| endereço(s) | `public.service_addresses` (N por serviço, um `is_primary`) |
| imagens | `public.files` (`purpose='service_image'`, bytes em `content`) + `services.extras.images`/`coverFileId`. URL externa não funciona |
| contato, detalhes, listas (sessões etc.) | formulário dinâmico da categoria: `public.forms` (`form_key`) + `public.form_results.answers` (chaves planas; listas usam o tipo `list`) |
| grupo, categoria, subcategoria | taxonomia (`categories_group`, `categories`, `categories_sub`) + `service_categories_sub` |
| rastreio da fonte | `services.extras.origem` (chave de idempotência) |

Se **não há lugar**, não improvise: registre em "Sem destino" e avise a pessoa. Se falta coluna/tabela, isso é migration no core (`kizuna-core/plugins/<p>/NNNN_*.sql`), fora do de-para.

### 3. Formulário da categoria
Campos sem coluna própria viram um formulário em `kizuna-core/db/extras/forms_seed_<categoria>.sql` (modelo: `forms_seed_cinema.sql`), com `categories.form_key` apontando para ele. Chaves planas `snake_case` (`contato_*`, `detalhes_*`), listas com `type: 'list'`. Opções de `multiselect` vivem no `schema`; o robô lê as opções de lá.

### 4. Escreva o documento
Estrutura fixa (igual ao `cinema-depara.md`):

1. **Regras** curtas: conexão como superuser, sem JWT (defaults de `tenant_id`/`created_by` vêm NULL → sempre informar), passos idempotentes, transação opcional, não rodar seeds/migrations, `form_results` gravado direto (não usar `fn_form_result_upsert`).
2. **Fase 1: verificação prévia** (antes de qualquer arquivo): contexto (root/tenant, grupo/categoria/subs, formulário); varredura dos JSONs (valores distintos, cidades→IBGE, **campos não mapeados**); comparação com o banco; inserir taxonomia faltante **sempre com `active=false`**; relatório único e **parar** até a pessoa ativar na UI (`/painel/taxonomia/arvore`); checagem de pendentes (0 = liberar). O robô nunca ativa, edita nem apaga taxonomia. Opções novas do formulário só são reportadas.
3. **Fase 2: inserção por arquivo**: tabela de de-para (campo → destino → conversão), regras de conversão do `answers`, subcategorias, e queries numeradas na ordem: serviço existente? → imagens → inserir/atualizar serviço → endereço → `form_results` → subcategorias.
4. **Sem destino**: o que ficou de fora.

Regras de conversão que sempre valem: omitir `null`/vazio/`[]`; números como JSON number; booleanos só quando `true`; arrays normalizados contra as opções do `schema` (sem caixa/acento); sessões/itens de lista sem campo obrigatório são descartados; `moeda` só validada.

### 5. Valide em Postgres antes de entregar
Use subagentes. Postgres 16 descartável em Docker (`--rm`), instalar `kizuna-core/sql/*.sql` e os plugins na ordem de `kizuna.plugins.json`; criar roles `anon`, `auth_user`, `authenticator` antes; root via `auth.fun_auth__signup_bootstrap`; depois os seeds (taxonomia, depois formulário). Rodar a Fase 1 e a Fase 2 com um payload real de amostra **duas vezes** (insert e update, sem duplicar), mais um arquivo com valor novo, cidade sem IBGE e campo desconhecido para provar o relatório. Derrubar o container. **Não registre o log da validação no documento**; diga o que ficou sem teste na resposta ao usuário.

### 6. Feche
- Adicione o documento ao índice `docs/integracoes/README.md`.
- Se mudou seed/migration, alinhe `db/extras/pendentes_*.sql` (update do banco existente) e `db/public.sql` (`node db/build.mjs`), e o `kizuna.lock` quando o core mudar.
- **Não commite** sem o usuário pedir.

## Armadilhas (já aconteceram)

- Defaults de `tenant_id`/`created_by`/`uid` dependem de JWT: em conexão direta vêm NULL e o insert falha.
- `fn_form_result_upsert` também depende de JWT; o robô grava em `form_results` direto (`ON CONFLICT (tenant_id, domain, reference_id)`).
- O seed de taxonomia é **destrutivo** (clear-all) e aborta se houver `services`; rodar taxonomia **antes** do seed do formulário (o clear-all zera `categories.form_key`).
- A busca só considera itens de taxonomia com `active=true`; item pendente não vaza para o público.
- Anúncio com `expires_at` no passado some da busca e do swipe; `NULL` = sem validade.
- `validate()` do form builder não confere as opções de `multiselect`: a normalização é do robô.
- Um slug de taxonomia repetido sob outro pai não é inserido (`ON CONFLICT DO NOTHING`) e a checagem não avisa.
