# Métricas: dispositivo, região e IP (design)

Data: 2026-10-26. Plugin afetado: `analytics` (kizuna-core) e o projeto `kizuna-starter`.

## Intenção

Hoje cada evento de métrica guarda só anúncio, tipo, origem, id anônimo do dia e tempo em tela.
Queremos saber de que aparelho e de que região vêm os acessos, e guardar o IP como dado sensível,
para auditoria e antifraude futura. O painel de métricas é **exclusivo do root** (permissão
`analytics/view`, que nenhum papel recebe por padrão).

## Objetivos

1. Gravar em cada evento a categoria do aparelho (`mobile`, `tablet`, `desktop`) e a região
   aproximada (cidade e UF).
2. Gravar o IP do visitante, controlado por flag no `kizuna.config.json`, com opção de cifrar de
   forma reversível.
3. Mostrar no `/painel/metricas` três blocos novos: "Dispositivos", "Onde estão seus visitantes" e
   "Acessos por IP" (número de acessos por IP, com o IP mascarado).
4. Nada disso aparece para anunciante. Liberar o painel a eles depois é conceder a permissão, sem
   mudar código.

## Não objetivos

- Mostrar o IP inteiro em qualquer tela. O root vê só o IP mascarado.
- Visão global da plataforma (a leitura continua limitada ao tenant do anúncio, por RLS).
- Preencher eventos antigos: ficam sem dispositivo, região e IP.
- Guardar user-agent, tela, SO ou navegador.

## Antiobjetivos (seria falha, mesmo funcionando)

- O IP inteiro aparecer em qualquer resposta da API de leitura, inclusive para o root ou para o
  dono do anúncio. Só a forma mascarada e a chave de agrupamento são legíveis.
- Cifrar com uma chave que o banco conheça (o banco nunca recebe a chave).
- Quebrar a regra atual de uma linha por visitante, anúncio, evento e dia.

## Decisões do usuário

- Guardar o IP (não só hash). Tratado como dado sensível.
- O root vê o número de acessos por IP, com o IP mascarado.
- Uma flag no `kizuna.config.json` define se o IP é gravado cifrado, com chave que permita
  decifrar depois.

## Desenho (parte minha, para aprovar)

### Configuração

Bloco `analytics.collect` (todos opcionais; sem o bloco, valem os padrões):

| Campo | Padrão | Efeito |
|---|---|---|
| `device` | `true` | grava a categoria do aparelho |
| `region` | `true` | grava cidade e UF aproximadas |
| `ip` | `true` | grava o IP |
| `encryptIp` | `true` | cifra o IP (AES-256-GCM, reversível) antes de gravar |
| `ipRetentionDays` | `30` | depois disso o campo do IP é zerado; `0` = nunca zera |

A cifra reaproveita o módulo `src/server/app-crypto.ts` e a chave `APP_ENCRYPTION_KEY` já usada
pelo app. Hoje esse módulo só sela tokens com validade; será preciso uma função de cifra sem
validade (mesmo algoritmo, sem expiração). O token cifrado é aleatório a cada gravação, então o IP
cifrado não serve para agrupar nem deduplicar. Trocar ou perder a chave torna os IPs já gravados
ilegíveis.

### Caminho de gravação

Hoje o cliente chama `POST /api/resources/fn_analytics_track` direto, sem passar por código nosso,
então o IP nunca chega. Passa a existir `POST /api/analytics/track` no servidor:

1. Recebe do cliente os mesmos campos de hoje, mais `device`.
2. Lê o IP dos headers (`x-forwarded-for`, `x-real-ip`).
3. Descobre a região: primeiro headers da plataforma, se existirem (por exemplo
   `x-vercel-ip-city`); se não, o lookup por IP que já existe em `/api/location/ip`, com cache em
   memória por IP.
4. Cifra o IP se `encryptIp` estiver ligado e chama a função do banco com tudo.

O cliente passa a chamar essa rota nova. A rota antiga continua aceita (sem device, região e IP),
para clientes em cache.

### Banco (migração nova no plugin `analytics`)

Colunas novas em `analytics_events`, todas anuláveis, com CHECK de formato:

| Coluna | Conteúdo | Legível pela API |
|---|---|---|
| `device` | `mobile`, `tablet` ou `desktop` | sim |
| `region_city`, `region_uf` | cidade e UF (UF com 2 letras) | sim |
| `ip_masked` | IP truncado: IPv4 sem o último octeto (`187.12.45.•`), IPv6 só os 3 primeiros grupos | sim |
| `ip_key` | HMAC-SHA256 do IP com chave derivada da `APP_ENCRYPTION_KEY`; mesmo IP, mesma chave | sim |
| `ip` | IP inteiro, cifrado se `encryptIp` | **não** |

`ip_key` existe porque o IP cifrado é aleatório a cada gravação e não agrupa. Com a chave
determinística o painel conta acessos por IP exato e mostra só o `ip_masked`. Sem a chave do
servidor, `ip_key` não permite recuperar nem testar IPs.

O `GRANT SELECT` hoje é da tabela inteira. Passa a ser **por coluna, sem `ip`**, para que nenhum
perfil que leia pela API consiga o IP inteiro. A função de gravação ganha parâmetros novos, opcionais.

Retenção do IP: se `pg_cron` existir, agenda um `UPDATE ... SET ip = NULL, ip_masked = NULL,
ip_key = NULL` para linhas mais antigas que `ipRetentionDays`. O delete de 400 dias da linha inteira continua.

### Leitura do IP

Não há tela para o IP inteiro. Quem precisar decifrar usa uma função de servidor (`revealAnalyticsIp`) chamada por
script ou CLI com acesso ao banco e à chave. É decisão do usuário ter essa via; o desenho só a
deixa possível.

### Painel

Em `/painel/metricas`, três blocos no padrão do bloco de origens, reutilizáveis no core:

- "Dispositivos": proporção de mobile, tablet e desktop no período, com a contagem de views.
- "Onde estão seus visitantes": top cidades e UFs. Quando só se sabe a UF, entra como UF.

- "Acessos por IP": ranking com o IP mascarado, número de acessos (views) e de visitantes-dia no
  período, agrupado por `ip_key`. Dois IPs diferentes com o mesmo mascarado aparecem em linhas
  separadas. Serve para ver picos suspeitos de um mesmo IP.

Agregação no cliente, como as demais métricas. Eventos sem o dado ficam como "Não informado".

### Cliente

A classificação do aparelho sai de `navigator.userAgent` e da largura da tela, no mesmo lugar do
filtro de robôs (`visitor.ts`). Só a categoria é enviada; o user-agent não sai do navegador.

## Limites assumidos

- Região por IP é aproximada, às vezes só a UF. Em desenvolvimento, sem proxy, vem vazia.
- O ip-api.com gratuito é só HTTP, tem limite de 45 consultas por minuto e termos de uso não
  comerciais. Por isso o cache e a preferência pelos headers da plataforma. Se o tráfego crescer,
  trocar de provedor ou usar a base de uma CDN.
- Atrás de proxy, o IP vem de `x-forwarded-for`, que pode ser forjado (já registrado na avaliação
  de segurança). Serve para métrica, não para decisão de segurança.

## LGPD (a confirmar com quem trata o dado)

IP é dado pessoal. Falta definir base legal, texto na política de privacidade e prazo. O padrão de
30 dias para o IP é minha sugestão. Hoje o IP do OTP em `auth` também fica gravado sem prazo
definido; fora deste escopo, mas vale tratar junto.

## Deixado ao construtor

- Nome exato dos parâmetros da função e da migração (`0003_...`).
- Se o IP entra por uma função só chamada pelo servidor (preferível: anônimo não consegue forjar o
  campo chamando a RPC direto) ou pela mesma função pública validada por CHECK. Depende de haver
  um papel de serviço no banco; se não houver, usar a função pública e documentar o risco.
- Forma do bloco de UI, seguindo o fluxo de feature de UI do projeto (subagentes, frontend-design
  e ui-review).
- Testes: classificação de aparelho, cifra e decifra do IP, rota com e sem headers, agregação por
  aparelho, região e IP, máscara de IPv4 e IPv6, e a prova de que o `ip` inteiro não sai em
  nenhuma leitura.
