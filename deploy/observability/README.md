# Observabilidade — Loki + Grafana

Coleta o stdout/stderr de **todos os containers** do servidor e deixa pesquisável no Grafana.

```
containers → Alloy (lê via docker.sock) → Loki (guarda 30 dias) → Grafana (tela)
```

## Subir no Dokploy

1. **Create Service → Compose**, com o repositório e o caminho `deploy/observability/docker-compose.yml`.
2. **Environment:** copie o `.env.example` e troque a senha.
3. **Domains:** aponte, por exemplo, `logs.seudominio.com.br` para o serviço **grafana**, porta **3000**.
   Loki e Alloy não recebem domínio.
4. Deploy. A rede externa `kizuna_net` precisa existir, a mesma dos outros composes.

A fonte de dados Loki já vem provisionada. Não é preciso expor mais nada: o Grafana fala com
o Loki pela rede interna.

* **Dashboards → Kizuna → "Kizuna — Visão geral"**: contadores de login, lockout, captcha e
  e-mail, volume e erros por serviço, e painéis de log com filtro por serviço e texto.
* **Explore → Loki**: consultas livres (exemplos abaixo).

O dashboard vem de `grafana/dashboards/kizuna-overview.json`. Pode ser editado na interface, mas
para manter a alteração exporte o JSON (Share → Export) e sobrescreva o arquivo.

## Consultas úteis (LogQL)

```logql
{compose_service="app"}                                  # tudo do app
{compose_service="app"} |= "[auth.forgot]"               # recuperar senha
{compose_service="app"} |= "email_failed"                # falhas de SMTP
{compose_service="app"} |= "captcha_failed"              # captcha recusado
{compose_service="app", stream="stderr"}                 # só erros (console.error/warn)
sum by (compose_service) (count_over_time({stream="stderr"}[5m]))   # volume de erros
```

Quando o app passar a logar em JSON, vão funcionar também `| json | level="error"` e o label
`level`.

## Ajustes

* **Retenção:** `retention_period` em `loki-config.yml` (padrão `720h`, 30 dias).
* **Versões:** as imagens estão fixadas. Para atualizar, troque as tags no compose.
* **Recursos:** o stack todo usa cerca de 300–500 MB de RAM.
* **Segurança:** o Alloy monta `/var/run/docker.sock` em modo somente leitura para descobrir os
  containers. O Grafana fica com cadastro público e acesso anônimo desligados.
