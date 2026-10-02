"""Espelha o resultado de Presidente do TSE para JSON normalizado em DATA_DIR."""
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

log = logging.getLogger("eleicao-cron")

UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
       "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]
EXTERIOR = "ZZ"
TIMEOUT = 10
MAX_THREADS = 4
USER_AGENT = "eleicao-cron/1.0 (espelho de resultados TSE; kizuna)"


class NotFound(Exception):
    pass


def cfg():
    return {
        "base": os.environ.get("TSE_BASE_URL", "https://resultados-sim.tse.jus.br").rstrip("/"),
        "ambiente": os.environ.get("TSE_AMBIENTE", "simulado/simulado2026").strip("/"),
        "interval": int(os.environ.get("INTERVAL_SECONDS", "30")),
        "data": os.environ.get("DATA_DIR", "/data"),
    }


def fetch_json(session, url):
    r = session.get(url, timeout=TIMEOUT)
    if r.status_code == 404:
        raise NotFound(url)
    r.raise_for_status()
    return json.loads(r.content.decode("utf-8-sig"))


# ---------- descoberta ----------

def discover(config_json):
    """Candidatos (ciclo, cd, turno) da eleicao federal (tp == 8), turno mais alto primeiro."""
    cands = []
    for pl in config_json.get("pl", []):
        ciclo = pl.get("c")
        for e in pl.get("e", []):
            if str(e.get("tp")) != "8":
                continue
            turno = int(e.get("t") or 1)
            cands.append((ciclo, str(e["cd"]), turno))
            cdt2 = str(e.get("cdt2") or "")
            if cdt2 and not any(str(x.get("cd")) == cdt2 for x in pl.get("e", [])):
                cands.append((ciclo, cdt2, 2))
    cands.sort(key=lambda c: (c[0] or "", c[2]), reverse=True)
    return cands


# ---------- normalizacao ----------

def _num(v):
    """'123' -> 123 ; '7,53' -> 7.53 ; vazio -> None."""
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        pass
    try:
        return float(str(v).replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _iter_partidos(cargo):
    # Real: carg[].agr[].par[].cand[]; tolera tambem carg[].par[].cand[]
    for par in cargo.get("par", []) or []:
        yield par
    for agr in cargo.get("agr", []) or []:
        for par in agr.get("par", []) or []:
            yield par


def _eleito(c):
    # 'e' tambem vale 's' para "2o turno"; so conta se o status diz Eleito.
    st = (c.get("st") or "").strip().lower()
    return c.get("e") == "s" and st.startswith("eleito")


def normalize(raw, escopo):
    cands = []
    for cargo in raw.get("carg", []):
        for par in _iter_partidos(cargo):
            for c in par.get("cand", []) or []:
                pct = _num(c.get("pvapn"))
                if pct is None:
                    pct = _num(c.get("pvap"))
                cands.append({
                    "seq": int(c.get("seq") or 0),
                    "numero": str(c.get("n", "")),
                    "nome": c.get("nmu") or c.get("nm") or "",
                    "partido": par.get("sg") or None,
                    "votos": int(_num(c.get("vap")) or 0),
                    "percentual": round(float(pct), 2) if pct is not None else 0.0,
                    "situacao": c.get("st") or "",
                    "eleito": _eleito(c),
                })
    cands.sort(key=lambda x: (-x["votos"], x["seq"]))
    s, v = raw.get("s") or {}, raw.get("v") or {}
    nulos = _num(v.get("tvn"))
    if nulos is None:
        nulos = _num(v.get("vn"))
    return {
        "escopo": escopo,
        "turno": int(raw.get("t") or 1),
        "tse": {"dg": raw.get("dg"), "hg": raw.get("hg")},
        "totalizacao": {
            "pctSecoes": _num(s.get("pstn")),
            "votosValidos": _num(v.get("vv")),
            "brancos": _num(v.get("vb")),
            "nulos": nulos,
        },
        "candidatos": cands,
    }


# ---------- escrita ----------

def write_if_changed(path, obj):
    """Escrita atomica (tmp + os.replace); so escreve se mudou. Retorna True se escreveu."""
    data = (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    try:
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return True


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------- ciclo ----------

def file_url(c, ciclo, cd, uf):
    return f"{c['base']}/{c['ambiente']}/{ciclo}/{cd}/dados/{uf}/{uf}-c0001-e{int(cd):06d}-u.json"


def run_cycle(session, c):
    data = c["data"]
    meta_path = os.path.join(data, "meta.json")
    has_good = os.path.exists(os.path.join(data, "nacional.json"))

    def waiting(reason):
        log.warning("sem dados do TSE ainda: %s", reason)
        if not has_good:
            write_if_changed(meta_path, {"status": "aguardando", "atualizadoEm": None,
                                         "tse": None, "turno": None, "eleicao": None,
                                         "ambiente": c["ambiente"], "ufs": []})
        return False

    try:
        conf = fetch_json(session, f"{c['base']}/{c['ambiente']}/comum/config/ele-c.json")
    except NotFound as e:
        return waiting(e)
    except Exception as e:
        log.error("falha ao buscar config: %s (mantendo ultimo arquivo bom)", e)
        return False

    nacional = chosen = None
    for ciclo, cd, turno in discover(conf):
        try:
            raw = fetch_json(session, file_url(c, ciclo, cd, "br"))
        except NotFound:
            continue
        except Exception as e:
            log.error("falha no nacional (%s): %s", cd, e)
            return False
        nacional, chosen = raw, (ciclo, cd, turno)
        break
    if nacional is None:
        return waiting("nacional 404 / eleicao federal nao encontrada")

    ciclo, cd, turno = chosen
    nac = normalize(nacional, "BR")
    write_if_changed(os.path.join(data, "nacional.json"), nac)

    def one(uf):
        try:
            raw = fetch_json(session, file_url(c, ciclo, cd, uf.lower()))
            write_if_changed(os.path.join(data, "uf", f"{uf}.json"), normalize(raw, uf))
            return uf
        except NotFound:
            log.info("UF %s sem arquivo (404)", uf)
        except Exception as e:
            log.error("UF %s falhou: %s", uf, e)
        return None

    with ThreadPoolExecutor(max_workers=MAX_THREADS) as ex:
        results = list(ex.map(one, UFS + [EXTERIOR]))
    ok = [u for u in results if u]
    # UF que falhou agora mas ja tem arquivo bom continua listada
    ufs = [u for u in UFS + [EXTERIOR]
           if u in ok or os.path.exists(os.path.join(data, "uf", f"{u}.json"))]
    write_if_changed(meta_path, {
        "status": "ok", "atualizadoEm": now_iso(),
        "tse": nac["tse"], "turno": nac["turno"], "eleicao": cd,
        "ambiente": c["ambiente"], "ufs": ufs,
    })
    log.info("ciclo ok: eleicao=%s turno=%s ufs=%d", cd, turno, len(ok))
    return True


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    c = cfg()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    once = "--once" in sys.argv
    log.info("iniciando: %s/%s -> %s a cada %ss", c["base"], c["ambiente"], c["data"], c["interval"])
    while True:
        t0 = time.time()
        try:
            run_cycle(session, c)
        except Exception:
            log.exception("erro inesperado no ciclo")
        if once:
            return
        time.sleep(max(1, c["interval"] - (time.time() - t0)))


if __name__ == "__main__":
    main()
