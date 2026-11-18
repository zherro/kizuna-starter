# Entrar com Bora Cuiabá (SSO do Atlas)

O Atlas funciona sozinho (cadastro próprio). Quando a instalação dele liga este provedor, o botão
"Entrar com Bora Cuiabá" leva a pessoa até aqui, o Bora confirma quem ela é e devolve um **token
curto assinado**. Não há cookie compartilhado: funciona em qualquer domínio.

## Fluxo

1. Atlas `GET /api/v1/auth/bora/start` → redireciona para
   `<Bora>/api/auth/atlas-sso?state=<aleatório>&return=<callback do Atlas>`.
2. `src/app/api/auth/atlas-sso/route.ts`:
   - `return` tem que ser **igual** a uma entrada de `ATLAS_SSO_ALLOWED_RETURNS` (senão 400;
     sem open redirect). `state` é opaco (16–128 caracteres seguros).
   - Sem sessão do Bora → `/login?returnTo=<esta rota>` e volta aqui depois do login.
   - Com sessão → JWT HS256 assinado com `ATLAS_SSO_SECRET`: `iss:"bora"`, `aud:"atlas"`,
     `exp` = 60 s, `jti` único, `sub` (user_id), `email`, `email_verified`, `name`.
   - Redireciona 302 para `return?token=...&state=...`.
3. O Atlas confere `state`, assinatura, `iss/aud/exp`, usa o `jti` uma única vez e abre a sessão
   local dele. Perfil e papéis ficam no Atlas; o Bora só informa identidade.

## De onde vêm os dados

- `email`: `login` da sessão (contas com login por e-mail). Conta sem e-mail (ex.: só telefone) →
  400 com mensagem clara.
- `email_verified`: **somente** `auth.users.email_verified_at`, lido no servidor com o
  `service_role` (`POSTGREST_SERVICE_TOKEN`) pelo `user_id` da sessão. Vale `true` apenas se a
  conta está ativa, não excluída, o `login` da linha é o e-mail do token e `email_verified_at`
  é um instante válido. Nulo, linha ausente, erro de consulta ou `POSTGREST_SERVICE_TOKEN`
  ausente = `false` (o Atlas então não vincula conta existente nem cria conta nova).
- **Por que não `fun_auth__account_facts()`**: ela devolve `email_verified_at OR
  user_data.email_verified`, e `public.user_data` é gravável pelo próprio usuário. Quem cadastrasse
  `login=vitima@gmail.com` e marcasse `user_data.email_verified=true` sairia com
  `email_verified:true` e poderia assumir a conta Atlas da vítima. Nunca use `user_data` para isso.
- `email` do token = `login` da conta (nunca outro campo). O header leva `typ:"JWT"` e o payload
  `nbf` = `iat`; o Atlas rejeita tokens sem `typ:"JWT"` ou com `nbf` no futuro.

## Limites conhecidos

- **Logout, troca de senha e desativação no Bora NÃO propagam ao Atlas.** O Bora só emite o token
  no momento do login; depois disso a sessão do Atlas é independente e vive 24 h. Para cortar o
  acesso de alguém de imediato, desative/revogue a conta também no Atlas.
- Use um `ATLAS_SSO_SECRET` **por instalação** (um para cada par Bora/Atlas). Segredo
  compartilhado entre instalações permite que um Bora forje identidade em outro Atlas.

## Variáveis

| Variável | O que é |
| --- | --- |
| `ATLAS_SSO_SECRET` | Segredo **dedicado**, ≥ 32 caracteres, igual ao do Atlas. **Nunca** use o `PGRST_JWT_SECRET`. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ATLAS_SSO_ALLOWED_RETURNS` | URLs exatas de callback, separadas por vírgula. Ex.: `https://atlas.exemplo.com/api/v1/auth/bora/callback`. |

Sem as duas, a rota responde 503 e o fluxo fica desligado.

## Código

- `src/lib/server/atlas-sso.ts`: allowlist, validação do `state`, emissão do token (testado em
  `atlas-sso.test.ts`).
- `src/app/api/auth/atlas-sso/route.ts`: a rota.
