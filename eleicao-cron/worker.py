"""Espelha resultados do TSE (presidente, governador, senador...) para JSON normalizado em DATA_DIR.

Um unico loop, sem threads, processa uma FILA DE TAREFAS (uma por vez): cada tarefa busca um
arquivo do TSE (dados de um cargo/escopo ou a foto de um candidato), normaliza e grava de forma
atomica. Falha em uma tarefa nao bloqueia as demais (backoff exponencial por tarefa).
"""
import json
import os
import shutil
import signal
import sys
import time
from datetime import datetime, timezone

import requests

UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
       "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]
EXTERIOR = "ZZ"
NACIONAL = "BR"
USER_AGENT = "eleicao-cron/2.0 (espelho de resultados TSE; kizuna)"

BACKOFF_BASE = 30
BACKOFF_MAX = 600
STATUS_EVERY = 10      # s: status.json (e meta.json, se so o horario mudou)
SUMMARY_EVERY = 60     # s: linha "resumo:"
FOTO_LAYER = 99        # fotos: sempre depois de qualquer cargo


class NotFound(Exception):
    """HTTP 404: arquivo ainda nao publicado / inexistente para o escopo."""


class FetchTimeout(Exception):
    pass


class FetchError(Exception):
    pass


class Cargo:
    def __init__(self, name, code, tp, escopos, interval_env, interval_default,
                 enabled=True, foto_uf=None, overrides=None, fotos=True, deputado=False):
        self.name = name                    # chave em meta.json e nome da pasta de saida
        self.code = code                    # cargo no nome do arquivo do TSE (c0001...)
        self.tp = tp                        # tipo da eleicao no ele-c.json (8 federal, 1 estadual)
        self.escopos = escopos              # escopos (arquivos) que existem para o cargo
        self.interval_env = interval_env
        self.interval_default = interval_default
        self.enabled = enabled              # padrao quando a env CARGOS nao esta definida
        self.foto_uf = foto_uf              # pasta de fotos fixa (presidente usa "br")
        self.overrides = overrides or {}    # escopo -> codigo do cargo (DF: distrital c0008)
        self.fotos = fotos                  # False: o worker nao baixa fotos (o site busca no TSE)
        self.deputado = deputado            # saida com `coligacao` por candidato e `cargoNome`

    @property
    def num(self):
        return str(int(self.code[1:]))      # c0003 -> "3" (carg[].cd e abr[].cp[].cd)

    def code_for(self, escopo):
        return self.overrides.get(escopo, self.code)

    def num_for(self, escopo):
        return str(int(self.code_for(escopo)[1:]))


# A ordem aqui e a PRIORIDADE (menor indice = roda antes).
REGISTRY = [
    Cargo("presidente", "c0001", "8", [NACIONAL] + UFS + [EXTERIOR],
          "INTERVAL_PRESIDENTE", 30, True, foto_uf="br"),
    Cargo("governador", "c0003", "1", list(UFS), "INTERVAL_GOVERNADOR", 60, True),
    Cargo("senador", "c0005", "1", list(UFS), "INTERVAL_SENADOR", 60, True),
    # Deputados: arquivos grandes (~0.5MB) e ~18 mil fotos; o site busca a foto no TSE sob demanda.
    # Desligue com CARGOS=presidente,governador,senador. O DF elege Deputado DISTRITAL (c0008).
    Cargo("deputado-federal", "c0006", "1", list(UFS), "INTERVAL_DEPUTADOS", 300, True,
          fotos=False, deputado=True),
    Cargo("deputado-estadual", "c0007", "1", list(UFS), "INTERVAL_DEPUTADOS", 300, True,
          overrides={"DF": "c0008"}, fotos=False, deputado=True),
]
BY_NAME = {c.name: c for c in REGISTRY}


def _int_env(name, default):
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


def enabled_cargos(raw=None):
    """Cargos ligados: env CARGOS (lista) ou, sem ela, os `enabled` do registro. Ordem = prioridade."""
    if raw is None or not raw.strip():
        return [c for c in REGISTRY if c.enabled]
    want = {x.strip().lower().replace("_", "-") for x in raw.split(",") if x.strip()}
    return [c for c in REGISTRY if c.name in want]


def cfg():
    cargos = enabled_cargos(os.environ.get("CARGOS"))
    return {
        "base": os.environ.get("TSE_BASE_URL", "https://resultados-sim.tse.jus.br").rstrip("/"),
        "ambiente": os.environ.get("TSE_AMBIENTE", "simulado/simulado2026").strip("/"),
        "data": os.environ.get("DATA_DIR", "/data"),
        "cargos": cargos,
        "intervals": {c.name: _int_env(c.interval_env, c.interval_default) for c in cargos},
        "timeout": _int_env("REQUEST_TIMEOUT", 10),
        "pause_ms": _int_env("REQUEST_PAUSE_MS", 200),
        "notfound_retry": _int_env("NOTFOUND_RETRY", 120),
        "foto_retry": _int_env("FOTO_404_RETRY", 3600),
        "discovery_wait": _int_env("DISCOVERY_WAIT", 60),
        "discovery_every": _int_env("DISCOVERY_INTERVAL", 300),
    }


# ---------- HTTP ----------

class Fetcher:
    def __init__(self, session, timeout=10):
        self.session = session
        self.timeout = timeout

    def get(self, url):
        try:
            r = self.session.get(url, timeout=self.timeout)
        except requests.exceptions.Timeout as e:
            raise FetchTimeout(str(e))
        except requests.exceptions.RequestException as e:
            raise FetchError(str(e)[:120])
        if r.status_code == 404:
            raise NotFound(url)
        if r.status_code >= 400:
            raise FetchError(f"HTTP {r.status_code}")
        return r.content


# ---------- descoberta ----------

def discover(conf, tp, cargo_num=None):
    """Candidatos (ciclo, cd, turno) das eleicoes de tipo `tp`, turno mais alto primeiro.

    Se `cargo_num` for dado e a eleicao listar seus cargos (abr[].cp[]), exige que o cargo exista nela.
    O 2o turno vem de `cdt2` (so entra se nao estiver listado como eleicao propria)."""
    cands = []
    for pl in conf.get("pl", []):
        ciclo = pl.get("c")
        for e in pl.get("e", []):
            if str(e.get("tp")) != str(tp):
                continue
            if cargo_num is not None:
                cps = {str(cp.get("cd")) for a in e.get("abr", []) or [] for cp in a.get("cp", []) or []}
                if cps and str(cargo_num) not in cps:
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


def _pct(d, key_n, key_s):
    """Percentual: prefere a variante numerica (sufixo n, ex. pvvn), cai para a pt-BR (pvv)."""
    n = _num(d.get(key_n))
    return n if n is not None else _num(d.get(key_s))


def _iter_partidos(cargo):
    # Real: carg[].agr[].par[].cand[]; tolera tambem carg[].par[].cand[]. Rende (agr, par).
    for par in cargo.get("par", []) or []:
        yield {}, par
    for agr in cargo.get("agr", []) or []:
        for par in agr.get("par", []) or []:
            yield agr, par


def _eleito(c):
    # 'e' tambem vale 's' para "2o turno"; so conta se o status diz Eleito.
    st = (c.get("st") or "").strip().lower()
    return c.get("e") == "s" and st.startswith("eleito")


def normalize(raw, cargo, escopo, num=None, deputado=False):
    """JSON do TSE -> contrato de saida. `num` (ex. "3") escolhe o carg[] certo quando ha varios.

    `deputado=True` acrescenta `coligacao` (str|null: federacao/coligacao do agrupamento quando
    difere da sigla do partido) por candidato e `cargoNome` (ex. "Deputado Distrital") no topo."""
    cargs = raw.get("carg", []) or []
    if num is not None:
        sel = [c for c in cargs if str(c.get("cd")) == str(num)]
        cargs = sel or cargs
    cands = []
    for carg in cargs:
        for agr, par in _iter_partidos(carg):
            com = (agr.get("com") or "").strip()
            if com == (par.get("sg") or "").strip():
                com = ""
            for c in par.get("cand", []) or []:
                pct = _num(c.get("pvapn"))
                if pct is None:
                    pct = _num(c.get("pvap"))
                item = {
                    "seq": int(c.get("seq") or 0),
                    "numero": str(c.get("n", "")),
                    "sqcand": str(c.get("sqcand", "")),
                    "nome": c.get("nmu") or c.get("nm") or "",
                    "partido": par.get("sg") or None,
                    "votos": int(_num(c.get("vap")) or 0),
                    "percentual": round(float(pct), 2) if pct is not None else 0.0,
                    "situacao": c.get("st") or "",
                    "eleito": _eleito(c),
                }
                if deputado:
                    item["coligacao"] = com or None
                cands.append(item)
    cands.sort(key=lambda x: (-x["votos"], x["seq"]))
    s, v = raw.get("s") or {}, raw.get("v") or {}
    nulos = _num(v.get("tvn"))
    if nulos is None:
        nulos = _num(v.get("vn"))
    e = raw.get("e") or {}
    vagas = _num(cargs[0].get("nv")) if cargs else None
    out = {
        "cargo": cargo,
        "escopo": escopo,
        "turno": int(raw.get("t") or 1),
        "tse": {"dg": raw.get("dg"), "hg": raw.get("hg")},
        "totalizacao": {
            "pctSecoes": _num(s.get("pstn")),
            "votosValidos": _num(v.get("vv")),
            "brancos": _num(v.get("vb")),
            "nulos": nulos,
            "secoesTotal": _num(s.get("ts")),
            "secoesTotalizadas": _num(s.get("st")),
            "secoesNaoTotalizadas": _num(s.get("snt")),
            "eleitorado": _num(e.get("te")),
            "eleitoradoApurado": _num(e.get("est")),
            "pEleitoradoApurado": _num(e.get("pestn")),
            "comparecimento": _num(e.get("c")),
            "pComparecimento": _num(e.get("pcn")),
            "abstencoes": _num(e.get("a")),
            "pAbstencao": _num(e.get("pan")),
            "votosTotais": _num(v.get("tv")),
            "pValidos": _pct(v, "pvvn", "pvv"),
            "pBrancos": _pct(v, "pvbn", "pvb"),
            "pNulos": _pct(v, "ptvnn", "ptvn"),
        },
        "vagas": int(vagas) if vagas is not None else None,
        "candidatos": cands,
    }
    if deputado and cargs and cargs[0].get("nmn"):
        out["cargoNome"] = cargs[0]["nmn"]
    return out


# ---------- escrita ----------

def atomic_write(path, data):
    """tmp + os.replace, modo 644. Em falha, o arquivo anterior permanece."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.chmod(tmp, 0o644)
    except OSError:
        pass
    os.replace(tmp, path)


def dumps_compact(obj):
    return (json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def write_if_changed(path, obj, compact=False):
    """Escrita atomica de JSON; so escreve se mudou. Retorna True se escreveu."""
    data = dumps_compact(obj) if compact else (
        json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    try:
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    except FileNotFoundError:
        pass
    atomic_write(path, data)
    return True


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def _tse_key(tse):
    try:
        return datetime.strptime(f"{tse.get('dg')} {tse.get('hg')}", "%d/%m/%Y %H:%M:%S")
    except (ValueError, TypeError, AttributeError):
        return datetime.min


def fmt_kb(n):
    return f"{n / 1024:.1f}KB"


def backoff(fails):
    return min(BACKOFF_BASE * 2 ** (fails - 1), BACKOFF_MAX)


# ---------- fila ----------

class Task:
    def __init__(self, key, kind, cargo, layer, seq, interval=None, escopo=None):
        self.key = key              # "presidente/BR" ou "foto/presidente/41592502"
        self.kind = kind            # "dados" | "foto"
        self.cargo = cargo          # nome do cargo
        self.escopo = escopo        # BR | UF (dados)
        self.layer = layer
        self.seq = seq              # desempate estavel
        self.interval = interval    # None = tarefa unica (foto)
        self.next_run = 0.0
        self.fails = 0              # falhas consecutivas
        self.skip = {}              # cd -> epoch: candidato com 404 (2o turno ainda nao publicado)
        self.url = None             # foto
        self.path = None            # foto
        self.last_run = None
        self.last_ok = None
        self.result = None
        self.ms = 0
        self.bytes = 0


def pick_next(tasks, now):
    """Proxima tarefa vencida: camada (prioridade) menor primeiro; na camada, a mais atrasada."""
    due = [t for t in tasks if t.next_run <= now]
    if not due:
        return None
    return min(due, key=lambda t: (t.layer, t.next_run, t.seq))


class Worker:
    def __init__(self, config, fetcher, clock=time.time, sleep=time.sleep, out=None):
        self.c = config
        self.fetcher = fetcher
        self.clock = clock
        self.sleep = sleep
        self.out = out or (lambda m: print(m, flush=True))
        self.data = config["data"]
        self.started = clock()
        self.tasks = {}
        self._seq = 0
        self.disc = {}                  # cargo -> [(ciclo, cd, turno)]
        self.disc_sig = None
        self.next_discovery = 0.0
        self.scopes = {}                # cargo -> escopo -> {"turno","tse","cd","ciclo"}
        self.cargo_ok = {}              # cargo -> epoch do ultimo dado buscado com sucesso
        self.prev_cargos = {}           # cargos do meta.json de execucoes anteriores
        self.known_sq = set()
        self.ok_count = 0
        self.fail_count = 0
        self.foto_ok = 0
        self.foto_fail = 0
        self.next_status = 0.0
        self.next_summary = self.started + SUMMARY_EVERY
        self._meta_struct = None
        self._meta_at = 0.0
        self._last_meta_status = None
        for layer, cargo in enumerate(self.c["cargos"]):
            for esc in cargo.escopos:
                key = f"{cargo.name}/{esc}"
                t = Task(key, "dados", cargo.name, layer, self._next_seq(),
                         self.c["intervals"][cargo.name], esc)
                t.next_run = self.started
                self.tasks[key] = t

    def _next_seq(self):
        self._seq += 1
        return self._seq

    # ----- estado derivado -----

    def log(self, msg):
        self.out(msg)

    def cargo_by_name(self, name):
        return BY_NAME[name]

    def dados_tasks(self):
        return [t for t in self.tasks.values() if t.kind == "dados"]

    def foto_tasks(self):
        return [t for t in self.tasks.values() if t.kind == "foto"]

    def primary_key(self):
        if "presidente/BR" in self.tasks:
            return "presidente/BR"
        d = self.dados_tasks()
        return d[0].key if d else None

    def has_data(self):
        return bool(self.build_cargos(None))

    # ----- descoberta -----

    def discover_now(self, now):
        self.next_discovery = now + self.c["discovery_wait"]
        url = f"{self.c['base']}/{self.c['ambiente']}/comum/config/ele-c.json"
        t0 = time.perf_counter()
        try:
            body = self.fetcher.get(url)
            conf = json.loads(body.decode("utf-8-sig"))
        except NotFound:
            self.log(f"aguardando ele-c.json 404 (apuracao nao iniciada) retry em {self.c['discovery_wait']}s")
            return
        except FetchTimeout:
            self.log(f"fail ele-c.json timeout {self.c['timeout']}s retry em {self.c['discovery_wait']}s")
            return
        except Exception as e:
            self.log(f"fail ele-c.json erro {_short(e)} retry em {self.c['discovery_wait']}s")
            return
        ms = int((time.perf_counter() - t0) * 1000)
        disc = {c.name: discover(conf, c.tp, c.num) for c in self.c["cargos"]}
        sig = json.dumps(disc, sort_keys=True)
        found = any(disc.values())
        mudou = "mudou" if sig != self.disc_sig else "sem-mudanca"
        self.disc, self.disc_sig = disc, sig
        resumo = " ".join(f"{n}={','.join(f'{cd}/t{t}' for _, cd, t in v) or '-'}" for n, v in disc.items())
        self.log(f"ok ele-c.json 200 {fmt_kb(len(body))} {ms}ms {mudou} {resumo}")
        if found:
            self.next_discovery = now + (self.c["discovery_every"] if self.has_data()
                                         else self.c["discovery_wait"])

    def maybe_discover(self, now):
        if now >= self.next_discovery:
            self.discover_now(now)

    @property
    def ready(self):
        return any(self.disc.values())

    # ----- execucao de tarefas -----

    def data_url(self, cargo, ciclo, cd, escopo):
        uf = escopo.lower()
        return (f"{self.c['base']}/{self.c['ambiente']}/{ciclo}/{cd}/dados/{uf}/"
                f"{uf}-{cargo.code_for(escopo)}-e{int(cd):06d}-u.json")

    def run_dados(self, task, now):
        cargo = self.cargo_by_name(task.cargo)
        cands = self.disc.get(task.cargo) or []
        for i, (ciclo, cd, turno) in enumerate(cands):
            if task.skip.get(cd, 0) > now:
                continue
            try:
                body = self.fetcher.get(self.data_url(cargo, ciclo, cd, task.escopo))
            except NotFound:
                if i < len(cands) - 1:       # cai para o turno anterior; reavalia em instantes
                    task.skip[cd] = now + self.c["notfound_retry"]
                continue
            raw = json.loads(body.decode("utf-8-sig"))
            norm = normalize(raw, cargo.name, task.escopo, cargo.num_for(task.escopo), cargo.deputado)
            path = os.path.join(self.data, cargo.name, f"{task.escopo}.json")
            changed = write_if_changed(path, norm, compact=True)
            self.scopes.setdefault(cargo.name, {})[task.escopo] = {
                "turno": norm["turno"], "tse": norm["tse"], "cd": cd, "ciclo": ciclo}
            self.cargo_ok[cargo.name] = now
            if cargo.fotos:
                self.enqueue_fotos(cargo, task.escopo, ciclo, cd, norm)
            return len(body), changed
        raise NotFound(task.key)

    def foto_path(self, sq):
        return os.path.join(self.data, "fotos", f"{sq}.jpeg")

    def enqueue_fotos(self, cargo, escopo, ciclo, cd, norm):
        folder = cargo.foto_uf or escopo.lower()
        for c in norm["candidatos"]:
            sq = c.get("sqcand")
            if not sq or sq in self.known_sq:
                continue
            self.known_sq.add(sq)
            path = self.foto_path(sq)
            try:
                if os.path.getsize(path) > 0:
                    continue
            except OSError:
                pass
            key = f"foto/{cargo.name}/{sq}"
            t = Task(key, "foto", cargo.name, FOTO_LAYER, self._next_seq())
            t.url = f"{self.c['base']}/{self.c['ambiente']}/{ciclo}/{cd}/fotos/{folder}/{sq}.jpeg"
            t.path = path
            t.next_run = self.clock()
            self.tasks[key] = t

    def run_foto(self, task, now):
        try:
            if os.path.getsize(task.path) > 0:
                return None                    # ja existe: nada a fazer, sem requisicao
        except OSError:
            pass
        body = self.fetcher.get(task.url)
        if not body.startswith(b"\xff\xd8"):
            raise FetchError("resposta nao e JPEG")
        atomic_write(task.path, body)
        return len(body), True

    def run_task(self, task):
        """Executa UMA tarefa, atualiza estado/logs. Retorna True se fez requisicao."""
        now = self.clock()
        task.last_run = now
        t0 = time.perf_counter()
        requested = True
        try:
            res = self.run_dados(task, now) if task.kind == "dados" else self.run_foto(task, now)
            ms = int((time.perf_counter() - t0) * 1000)
            if res is None:                    # foto ja existia
                self.finish_foto(task)
                return False
            size, changed = res
            task.fails = 0
            task.last_ok, task.ms, task.bytes = now, ms, size
            task.result = "ok" if changed else "unchanged"
            self.ok_count += 1
            if task.kind == "foto":
                self.foto_ok += 1
                self.log(f"ok {task.key} 200 {fmt_kb(size)} {ms}ms baixada")
                self.finish_foto(task)
            else:
                task.next_run = now + task.interval
                self.log(f"ok {task.key} 200 {fmt_kb(size)} {ms}ms {'mudou' if changed else 'sem-mudanca'}")
        except NotFound:
            ms = int((time.perf_counter() - t0) * 1000)
            task.result, task.ms, task.bytes = "404", ms, 0
            if task.kind == "foto":
                wait = self.c["foto_retry"]
                task.fails = 0
                self.fail_count += 1
                self.foto_fail += 1
                task.next_run = now + wait
                self.log(f"fail {task.key} 404 permanente retry em {wait}s")
            else:
                wait = max(task.interval, self.c["notfound_retry"])
                task.next_run = now + wait
                self.log(f"skip {task.key} 404 sem-arquivo retry em {wait}s")
        except Exception as e:
            ms = int((time.perf_counter() - t0) * 1000)
            task.fails += 1
            wait = backoff(task.fails)
            task.next_run = now + wait
            self.fail_count += 1
            task.ms, task.bytes = ms, 0
            if isinstance(e, FetchTimeout):
                task.result = "timeout"
                what = f"timeout {self.c['timeout']}s"
            else:
                task.result = "error"
                what = f"erro {_short(e)}"
            self.log(f"fail {task.key} {what} retry em {wait}s (tentativa {task.fails})")
        return requested

    def finish_foto(self, task):
        self.tasks.pop(task.key, None)

    # ----- meta.json / status.json -----

    def build_cargos(self, with_time):
        """with_time=None -> so estrutura (sem horarios)."""
        out = {}
        for cargo in self.c["cargos"]:
            sc = self.scopes.get(cargo.name)
            if sc:
                best_esc = max(sc, key=lambda e: (sc[e]["turno"], _tse_key(sc[e]["tse"])))
                best = sc[best_esc]
                ufs = [u for u in UFS + [EXTERIOR] if u in cargo.escopos and (
                    u in sc or os.path.exists(os.path.join(self.data, cargo.name, f"{u}.json")))]
                entry = {
                    "eleicao": best["cd"],
                    "ciclo": best["ciclo"],
                    "turno": best["turno"],
                    "atualizadoEm": iso(self.cargo_ok[cargo.name]) if with_time else None,
                    "tse": max((s["tse"] for s in sc.values()), key=_tse_key),
                    "ufs": ufs,
                }
                out[cargo.name] = entry
            elif cargo.name in self.prev_cargos:
                entry = dict(self.prev_cargos[cargo.name])
                if not with_time:
                    entry["atualizadoEm"] = None
                out[cargo.name] = entry
        return out

    def build_meta(self, with_time):
        cargos = self.build_cargos(with_time)
        ufs = [u for u in UFS + [EXTERIOR] if any(u in e["ufs"] for e in cargos.values())]
        ciclo = None
        for v in self.disc.values():
            for c, _, _ in v:
                if c and (ciclo is None or c > ciclo):
                    ciclo = c
        times = [e["atualizadoEm"] for e in cargos.values() if e["atualizadoEm"]]
        return {
            "status": "ok" if cargos else "aguardando",
            "atualizadoEm": max(times) if (with_time and times) else None,
            "base": self.c["base"],
            "ambiente": self.c["ambiente"],
            "ciclo": ciclo,
            "ufs": ufs,
            "cargos": cargos,
        }

    def write_meta(self, now, force=False):
        struct = self.build_meta(None)
        if not force and struct == self._meta_struct and now - self._meta_at < STATUS_EVERY:
            return
        meta = self.build_meta(True)
        write_if_changed(os.path.join(self.data, "meta.json"), meta)
        self._meta_struct, self._meta_at = struct, now
        self._last_meta_status = meta["status"]

    def queue_size(self, now):
        return sum(1 for t in self.tasks.values() if t.next_run <= now)

    def status_obj(self, now):
        tasks = {}
        for t in self.dados_tasks():
            tasks[t.key] = {
                "lastRun": iso(t.last_run) if t.last_run else None,
                "lastOk": iso(t.last_ok) if t.last_ok else None,
                "result": t.result,
                "ms": t.ms,
                "bytes": t.bytes,
                "attempts": t.fails,
                "nextRun": iso(t.next_run),
            }
        pend = self.foto_tasks()
        return {
            "startedAt": iso(self.started),
            "heartbeat": iso(now),
            "status": "ok" if self.has_data() else "aguardando",
            "queue": self.queue_size(now),
            "tasks": tasks,
            "counts": {"ok": self.ok_count, "fail": self.fail_count},
            "fotos": {"baixadas": self.foto_ok, "pendentes": len(pend), "falhas": self.foto_fail},
        }

    def write_status(self, now):
        data = (json.dumps(self.status_obj(now), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        atomic_write(os.path.join(self.data, "status.json"), data)
        self.next_status = now + STATUS_EVERY

    def summary_line(self, now):
        key = self.primary_key()
        t = self.tasks.get(key) if key else None
        if t and t.last_ok:
            ref = f"{key} atualizado há {int(now - t.last_ok)}s"
        else:
            ref = f"{key} ainda sem dados" if key else "nenhum cargo ligado"
        per = {}
        for tk in self.dados_tasks():
            if tk.last_ok:
                per[tk.cargo] = per.get(tk.cargo, 0) + 1
        cargos = " ".join(f"{c.name}={per.get(c.name, 0)}" for c in self.c["cargos"])
        return (f"resumo: {self.ok_count} ok, {self.fail_count} falhas, fila {self.queue_size(now)}, {ref}"
                + (f", arquivos ok por cargo: {cargos}" if cargos else ""))

    def housekeeping(self, now, after_dados=False):
        if after_dados or now >= self.next_status:
            self.write_status(now)
        self.write_meta(now)
        if now >= self.next_summary:
            self.log(self.summary_line(now))
            self.next_summary = now + SUMMARY_EVERY

    # ----- loops -----

    def setup(self):
        os.makedirs(self.data, exist_ok=True)
        # estrutura antiga (nacional.json / uf/) removida: o site le {cargo}/{ESCOPO}.json
        legacy = os.path.join(self.data, "uf")
        if os.path.isdir(legacy):
            shutil.rmtree(legacy, ignore_errors=True)
        try:
            os.remove(os.path.join(self.data, "nacional.json"))
        except OSError:
            pass
        try:
            with open(os.path.join(self.data, "meta.json"), "rb") as f:
                self.prev_cargos = json.loads(f.read().decode("utf-8-sig")).get("cargos") or {}
        except (OSError, ValueError):
            self.prev_cargos = {}
        nomes = ",".join(c.name for c in self.c["cargos"]) or "(nenhum)"
        self.log(f"iniciando: {self.c['base']}/{self.c['ambiente']} -> {self.data} cargos={nomes} "
                 f"pausa={self.c['pause_ms']}ms timeout={self.c['timeout']}s")

    def step(self):
        """Uma iteracao: descoberta (se vencida) + no maximo UMA tarefa. Retorna a tarefa executada."""
        now = self.clock()
        self.maybe_discover(now)
        task = pick_next(self.tasks.values(), now) if self.ready else None
        if task is not None:
            self.run_task(task)
            now = self.clock()
        self.housekeeping(now, after_dados=bool(task and task.kind == "dados"))
        return task

    def run_forever(self):
        self.setup()
        pause = self.c["pause_ms"] / 1000.0
        while True:
            try:
                task = self.step()
            except Exception as e:     # nunca derrubar o loop
                self.log(f"fail interno erro {_short(e)}")
                task = None
            if task is not None:
                if pause:
                    self.sleep(pause)
                continue
            now = self.clock()
            nxt = [t.next_run for t in self.tasks.values()] + [self.next_discovery, self.next_status]
            self.sleep(max(0.05, min(1.0, min(nxt) - now)))

    def run_once(self):
        """Processa a fila uma vez (inclui fotos descobertas no caminho). Sem retentativas."""
        self.setup()
        pause = self.c["pause_ms"] / 1000.0
        self.discover_now(self.clock())
        if not self.ready:
            self.write_status(self.clock())
            self.write_meta(self.clock(), force=True)
            self.log("aguardando: sem eleicao nos dados do TSE ainda")
            return 1
        done = set()
        while True:
            pend = [t for t in self.tasks.values() if t.key not in done]
            if not pend:
                break
            task = min(pend, key=lambda t: (t.layer, t.seq))
            done.add(task.key)
            try:
                self.run_task(task)
            except Exception as e:
                self.log(f"fail interno erro {_short(e)}")
            self.housekeeping(self.clock(), after_dados=task.kind == "dados")
            if pause:
                self.sleep(pause)
        now = self.clock()
        self.write_status(now)
        self.write_meta(now, force=True)
        self.log(self.summary_line(now))
        return 0


def _short(e):
    s = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
    return " ".join(s.split())[:120]


def main():
    c = cfg()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    w = Worker(c, Fetcher(session, c["timeout"]))

    def _term(*_):
        sys.exit(0)

    signal.signal(signal.SIGTERM, _term)
    if "--once" in sys.argv:
        sys.exit(w.run_once())
    try:
        w.run_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
