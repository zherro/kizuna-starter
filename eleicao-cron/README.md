# eleicao-cron

Worker que, a cada `INTERVAL_SECONDS` (padrao 30), espelha o resultado de
Presidente do TSE para JSON normalizado em `/data`. Sem banco.

## Saida

- `meta.json`: `status` (`ok` ou `aguardando`), `atualizadoEm`, `tse` (`dg`, `hg`), `turno`, `eleicao`, `ambiente`, `ufs`.
- `nacional.json`: escopo `BR`.
- `uf/SP.json`, `uf/ZZ.json` (exterior) etc.: uma por UF (27 UFs mais `ZZ`).

Cada arquivo traz `totalizacao` e `candidatos` ordenados por votos. Escrita
atomica (tmp + rename), so reescreve quando o conteudo muda. Se o TSE falhar
(404 ou erro), o ultimo arquivo bom e mantido. Sem nenhum dado ainda, so o
`meta.json` com `status: "aguardando"`.

## Uso

    cp .env.example .env
    docker compose up -d --build

## Fonte (TSE)

Ciclo e codigo da eleicao federal (`tp == "8"`) sao descobertos em
`{TSE_BASE_URL}/{TSE_AMBIENTE}/comum/config/ele-c.json`; nada e fixo.

- Simulado (padrao): `https://resultados-sim.tse.jus.br` + `simulado/simulado2026`.
- Producao: `https://resultados.tse.jus.br` + ambiente oficial. **Valide a URL e o
  ambiente no DevTools (aba Network) do painel de resultados do TSE** antes de usar.

## Compartilhar o volume com o Next

Use um bind mount no `docker-compose.yml` (`- ./data:/data`) e aponte o Next
para o mesmo diretorio do host:

    ELEICAO_DATA_PATH=/caminho/absoluto/eleicao-cron/data

Com volume nomeado, monte `eleicao-data` (somente leitura) no container do Next.

## Testes

    pip install requests pytest
    python -m pytest -q
