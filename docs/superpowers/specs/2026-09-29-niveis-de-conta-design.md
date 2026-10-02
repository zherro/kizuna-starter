# Níveis de conta — revisão do onboarding (design)

Data: 2026-09-29 · Status: aprovado em conversa

## Objetivo

Dar ao usuário um guia único e fácil para evoluir a conta: um card de nível no painel, uma
barreira padronizada para telas que exigem nível, e um nível novo ganho por ação (publicar o
primeiro anúncio). Segue o padrão OLX: email + celular verificados antes de anunciar.

## 1. Escada de níveis

| Nível | Chave        | Requisito                          | Libera                      |
|-------|--------------|------------------------------------|-----------------------------|
| 1     | `conta`      | `authenticated`                    | curtir, salvar              |
| 2     | `contato`    | `contact_verified` (email E celular) | avaliar, comentar         |
| 3     | `perfil`     | `profile_complete`                 | criar anúncio, criar evento |
| 4     | `anunciante` | `listing_published` (novo)         | selo "Anunciante"           |
| 5     | `identidade` | `identity_verified` (desligado)    | vender (em breve)           |

Níveis continuam sequenciais: nível N exige 1..N cumpridos.

### Mudanças no core (`src/shared/account-levels`)

- `contact_verified` passa a exigir `emailVerified && phoneVerified`. `missing` lista cada item
  separado: "Verificar email", "Verificar celular".
- `REQUIREMENT_IDS` ganha `listing_published`.
- `AccountFacts` ganha `listings: { published: number; pending: number }`.
- `listing_published`: cumprido com `published >= 1`. Se `published === 0 && pending >= 1`,
  `missing = ['Anuncio em analise']`; senão `missing = ['Publicar seu primeiro anuncio']`.
- Ações ganham rótulo humano num mapa separado (`ACTION_LABELS` no projeto, passado como
  `labels` no `AccountLevelsSetup`); `defineCapabilities` não muda. Helper novo
  `unlocksByLevel(capabilities, labels)` → `{ [levelKey]: rótulos }`, devolvido também por
  `GET /api/account/level` como `unlocks`.

### Fonte do dado (plugin services)

- Migração `plugins/services/0006_services_account_facts.sql`: função
  `public.fun_services__my_listing_counts()` → `{ published, pending }` do usuário logado
  (`created_by = auth.fun_auth_user_id()`). `published` = status `active` ou `paused`;
  `pending` = status `pending`. `SECURITY INVOKER`, `GRANT EXECUTE` para `auth_user`.
- O `auth` do core não depende do plugin: `getAccountFacts` só chama a RPC se algum nível
  habilitado usa `listing_published`. Falha/ausência da função → `{0,0}` (fecha, não abre).

### Config (`kizuna.config.json` do starter e `starter/` do core)

- Adiciona o nível `anunciante` (level 4, `href: /painel/meus-servicos/novo`).
- `identidade` vira level 5.
- Descrição do nível 2 atualizada para "email e celular".

## 2. Card de nível no painel (`AccountLevelCard`, core)

Topo de `/painel`, substitui o `OnboardingBanner`.

- Cabeçalho: "Nível X de N · <título>" + barra segmentada (um segmento por nível; "em breve"
  esmaecido).
- Próximo passo: título do próximo nível, lista do que falta, um botão direto. Verificar
  celular abre inline (reusa `PhoneLoginForm` com `purpose="verify_phone"`); os
  demais usam o `href` do nível. (Email inline fica para o plano 2 — ver "Dependência".)
- "O que você libera": rótulos das ações que o próximo nível destrava.
- Estados: anúncio em análise → mensagem de espera, sem botão; tudo completo → card compacto
  com selo.
- Link "Ver todos os níveis" → `/painel/onboarding`.
- Usa `useAccountLevel({ initial })` com status calculado no servidor (sem piscar).

## 3. Barreira padronizada (`RequireLevel`, core)

Server component exportado de `@kizuna/core/server`:

```tsx
<RequireLevel setup={accountLevelsSetup} action="service.create">
  <ServicoWizardPage />
</RequireLevel>
```

- Sem sessão → `redirect('/login?returnTo=' + encodeURIComponent(returnTo))` (a página passa
  `returnTo`; o login já respeita `?returnTo=` local).
- Ação liberada → renderiza `children`.
- Bloqueada → `LevelBlockedScreen` (client) na mesma URL:
  - Título com o rótulo da ação ("Para publicar anúncios, falta pouco").
  - Checklist dos níveis até o exigido: feitos com check, pendentes com o que falta.
  - Um botão para o primeiro passo pendente; verificações de contato inline.
  - Ao atingir o nível exigido, `router.refresh()` → conteúdo liberado na mesma URL.
  - Link secundário "Ver todos os níveis".
- `/painel/meus-servicos/[serviceId]` usa `RequireLevel` só quando `serviceId === 'novo'`;
  sai o `redirect('/painel/onboarding?acao=...')`.
- `LevelGate` client (botão "Novo") continua como UX; a barreira real é o `RequireLevel`.

## 4. Limpeza

- Remover `src/components/onboarding-banner.tsx`, `src/components/painel-wrapper.tsx` e o uso
  em `src/app/painel/page.tsx`.
- `src/app/api/onboarding/progress/route.ts` fica: é arquivo gerenciado do plugin onboarding
  (`kizuna.lock`) e a rota de verify-code ainda grava progresso nela.
- `/painel/onboarding` continua (escada completa), usando os rótulos novos.

## 5. Testes e verificação

`kizuna-core/src/shared/account-levels/account-levels.test.ts`:

- `contact_verified`: só email → falta "Verificar celular"; só celular → falta email; ambos → ok.
- `listing_published`: 0/0, 0 publicados com 1 pendente, 1 publicado.
- Cadeia de 5 níveis com o 5 desligado: máximo alcançável é 4.
- `canDo('service.create')` no nível 2 → `pending` = [perfil].
- `defineCapabilities` com objeto `{ level, label }` e com string.

Verificação manual: `tsc`, `npm run build`, e no navegador — conta nova em
`/painel/meus-servicos/novo` vê a tela de bloqueio; completando os passos cai no wizard; com
anúncio aprovado o card mostra nível 4.

## Dependência: verificação de email (spec própria)

Hoje não há verificação de email utilizável para cadastro por senha: não existe rota
`request-code`, `EmailVerificationPage` não é usada, e o código fica em
`user_data.email_verification_code`, legível pelo próprio usuário via RLS. Só login social marca
`email_verified_at`. Com `contact_verified` exigindo email E celular, esses usuários travam no
nível 1 até existir um fluxo seguro (padrão do OTP 0114: hash do código + JWT com `purpose`
assinado pelo servidor). Isso é o plano 2. Neste plano, o passo "Verificar email" do card e da
tela de bloqueio só aparece como pendente, sem botão inline.

## Fora do escopo

- Verificação de identidade (nível 5).
- Provedor de SMS real. Pré-requisito de produção: com `otp.enabled: false` ninguém passa do
  nível 1. Em dev, o provedor `log` imprime o código no log do servidor.
- Reescrever os demais cards de exemplo do dashboard.
