import json
import os
import re
import stat
import tempfile
import unittest
from unittest import mock

import healthcheck
import worker
from worker import FetchError, FetchTimeout, NotFound

FX = os.path.join(os.path.dirname(__file__), "tests", "fixtures")
BASE = "http://tse"
AMB = "sim/s"
JPEG = b"\xff\xd8\xff\xe0" + b"x" * 5000


def raw(name):
    with open(os.path.join(FX, name), "rb") as f:
        return f.read()


def load(name):
    return json.loads(raw(name).decode("utf-8-sig"))


class Clock:
    def __init__(self, t=1_800_000_000.0):
        self.t = t

    def __call__(self):
        return self.t

    def advance(self, s):
        self.t += s

    def sleep(self, s):
        self.t += s


class FakeFetcher:
    """Mapa url -> bytes | Exception. Sem entrada = NotFound. `calls` guarda a ordem."""

    def __init__(self, routes=None):
        self.routes = routes or {}
        self.calls = []

    def get(self, url):
        self.calls.append(url)
        r = self.routes.get(url)
        if r is None:
            raise NotFound(url)
        if isinstance(r, Exception):
            raise r
        return r


def u(ciclo, cd, uf, code):
    return f"{BASE}/{AMB}/{ciclo}/{cd}/dados/{uf}/{uf}-{code}-e{int(cd):06d}-u.json"


CONF_URL = f"{BASE}/{AMB}/comum/config/ele-c.json"


def sim_routes():
    """Simulado minimo: presidente BR/SP (1o turno), governador SP, senador SP."""
    return {
        CONF_URL: raw("ele-c.json"),
        u("ele2026", "21270", "br", "c0001"): raw("br-c0001-e021270-u.json"),
        u("ele2026", "21270", "sp", "c0001"): raw("sp-c0001-e021270-u.json"),
        u("ele2026", "21272", "sp", "c0003"): raw("sp-c0003-e021272-u.json"),
        u("ele2026", "21272", "sp", "c0005"): raw("sp-c0005-e021272-u.json"),
    }


def make_config(data, cargos="presidente,governador,senador", **over):
    with mock.patch.dict(os.environ, {"CARGOS": cargos, "DATA_DIR": data, "TSE_BASE_URL": BASE,
                                      "TSE_AMBIENTE": AMB}):
        c = worker.cfg()
    c["pause_ms"] = 0
    c.update(over)
    return c


def make_worker(data, routes=None, cargos="presidente,governador,senador", **over):
    clock = Clock()
    f = FakeFetcher(sim_routes() if routes is None else routes)
    lines = []
    w = worker.Worker(make_config(data, cargos, **over), f, clock=clock, sleep=clock.sleep, out=lines.append)
    w.lines = lines
    w.f = f
    w.clock_ = clock
    return w


def jread(path):
    with open(path, "rb") as f:
        return json.loads(f.read().decode("utf-8"))


class NormalizeTest(unittest.TestCase):
    def test_presidente_br(self):
        out = worker.normalize(load("br-c0001-e021270-u.json"), "presidente", "BR", 1)
        self.assertEqual((out["cargo"], out["escopo"], out["turno"]), ("presidente", "BR", 1))
        self.assertEqual(out["tse"], {"dg": "29/09/2026", "hg": "16:29:12"})
        self.assertEqual(out["vagas"], 1)
        t = out["totalizacao"]
        self.assertEqual((t["pctSecoes"], t["votosValidos"], t["brancos"], t["nulos"]),
                         (100, 100982116, 9118018, 9040537))
        c = out["candidatos"]
        self.assertEqual(len(c), 13)
        votos = [x["votos"] for x in c]
        self.assertEqual(votos, sorted(votos, reverse=True))
        top = c[0]
        self.assertEqual((top["votos"], top["partido"], top["percentual"]), (10503573, "P 9998", 8.71))
        self.assertEqual(top["sqcand"], "41592406")
        self.assertIsInstance(top["seq"], int)
        self.assertFalse(top["eleito"])
        self.assertEqual({"seq", "numero", "sqcand", "nome", "partido", "votos", "percentual",
                          "situacao", "eleito"}, set(top))
        self.assertEqual(list(out), ["cargo", "escopo", "turno", "tse", "totalizacao", "vagas", "candidatos"])

    def test_totalizacao_resumo_presidente_br(self):
        t = worker.normalize(load("br-c0001-e021270-u.json"), "presidente", "BR", 1)["totalizacao"]
        self.assertEqual(t, {
            "pctSecoes": 100, "votosValidos": 100982116, "brancos": 9118018, "nulos": 9040537,
            "secoesTotal": 528951, "secoesTotalizadas": 528951, "secoesNaoTotalizadas": 0,
            "eleitorado": 163079139, "eleitoradoApurado": 163079139, "pEleitoradoApurado": 100,
            "comparecimento": 138863131, "pComparecimento": 85.150902319,
            "abstencoes": 24215741, "pAbstencao": 14.849097681,
            "votosTotais": 138863131, "pValidos": 83.660553184,
            "pBrancos": 6.566190705, "pNulos": 6.510394037})
        self.assertEqual(list(t)[:4], ["pctSecoes", "votosValidos", "brancos", "nulos"])

    def test_totalizacao_resumo_todos_os_cargos_confere_com_bruto(self):
        casos = [("br-c0001-e021270-u.json", "presidente", "BR", 1),
                 ("sp-c0001-e021270-u.json", "presidente", "SP", 1),
                 ("sp-c0003-e021272-u.json", "governador", "SP", 3),
                 ("sp-c0005-e021272-u.json", "senador", "SP", 5),
                 ("sp-c0006-e021272-u.json", "deputado-federal", "SP", 6),
                 ("sp-c0007-e021272-u.json", "deputado-estadual", "SP", 7),
                 ("df-c0008-e021272-u.json", "deputado-estadual", "DF", 8)]
        for nome, cargo, esc, num in casos:
            with self.subTest(nome):
                r = load(nome)
                t = worker.normalize(r, cargo, esc, num, cargo.startswith("deputado"))["totalizacao"]
                s, e, v = r["s"], r["e"], r["v"]
                pt = lambda x: float(x.replace(",", "."))
                self.assertEqual(t["secoesTotal"], int(s["ts"]))
                self.assertEqual(t["secoesTotalizadas"], int(s["st"]))
                self.assertEqual(t["secoesNaoTotalizadas"], int(s["snt"]))
                self.assertEqual(t["eleitorado"], int(e["te"]))
                self.assertEqual(t["eleitoradoApurado"], int(e["est"]))
                self.assertEqual(t["pEleitoradoApurado"], pt(e["pestn"]))
                self.assertEqual(t["comparecimento"], int(e["c"]))
                self.assertEqual(t["pComparecimento"], pt(e["pcn"]))
                self.assertEqual(t["abstencoes"], int(e["a"]))
                self.assertEqual(t["pAbstencao"], pt(e["pan"]))
                self.assertEqual(t["votosTotais"], int(v["tv"]))
                self.assertEqual(t["pValidos"], pt(v["pvvn"]))
                self.assertEqual(t["pBrancos"], pt(v["pvbn"]))
                self.assertEqual(t["pNulos"], pt(v["ptvnn"]))
                # tv = votos em candidatos/legenda validos (vvc) + brancos + nulos
                self.assertEqual(int(v["vvc"]) + int(v["vb"]) + int(v["tvn"]), int(v["tv"]) )

    def test_totalizacao_percentual_cai_para_variante_ptbr(self):
        raw_ = {"t": "1", "carg": [], "v": {"pvv": "83,66", "pvb": "6,57", "ptvn": "6,51"}}
        t = worker.normalize(raw_, "presidente", "BR")["totalizacao"]
        self.assertEqual((t["pValidos"], t["pBrancos"], t["pNulos"]), (83.66, 6.57, 6.51))

    def test_presidente_uf_nome_curto(self):
        out = worker.normalize(load("sp-c0001-e021270-u.json"), "presidente", "SP", 1)
        self.assertEqual(out["totalizacao"]["votosValidos"], 22328209)
        self.assertIn('Candidato string 1234!@#$"TSE"', [x["nome"] for x in out["candidatos"]])

    def test_governador_sp(self):
        out = worker.normalize(load("sp-c0003-e021272-u.json"), "governador", "SP", 3)
        self.assertEqual((out["cargo"], out["escopo"], out["vagas"]), ("governador", "SP", 1))
        self.assertEqual(len(out["candidatos"]), 12)
        self.assertEqual(out["totalizacao"]["votosValidos"], 17369436)
        self.assertEqual(out["totalizacao"]["nulos"], 2189647)
        self.assertEqual(out["candidatos"][0]["votos"], 2187757)
        self.assertEqual(sum(1 for x in out["candidatos"] if x["eleito"]), 0)  # 'e' = s mas "2º turno"

    def test_senador_sp_duas_vagas(self):
        out = worker.normalize(load("sp-c0005-e021272-u.json"), "senador", "SP", 5)
        self.assertEqual(out["vagas"], 2)
        self.assertEqual(len(out["candidatos"]), 28)
        eleitos = [x for x in out["candidatos"] if x["eleito"]]
        self.assertEqual(len(eleitos), 2)
        self.assertEqual(out["candidatos"][0]["votos"], 2071021)
        self.assertTrue(all(x["sqcand"] for x in out["candidatos"]))

    def test_totalizacao_ausente_vira_null(self):
        out = worker.normalize({"t": "1", "carg": []}, "presidente", "BR")
        antigos = {"pctSecoes", "votosValidos", "brancos", "nulos"}
        novos = {"secoesTotal", "secoesTotalizadas", "secoesNaoTotalizadas", "eleitorado",
                 "eleitoradoApurado", "pEleitoradoApurado", "comparecimento", "pComparecimento",
                 "abstencoes", "pAbstencao", "votosTotais", "pValidos", "pBrancos", "pNulos"}
        self.assertEqual(out["totalizacao"], {k: None for k in antigos | novos})
        self.assertEqual(out["candidatos"], [])
        self.assertIsNone(out["vagas"])

    def test_eleito(self):
        self.assertTrue(worker._eleito({"e": "s", "st": "Eleito"}))
        self.assertTrue(worker._eleito({"e": "s", "st": "Eleito por QP"}))
        self.assertFalse(worker._eleito({"e": "s", "st": "2º turno"}))
        self.assertFalse(worker._eleito({"e": "n", "st": "Não eleito"}))


class DiscoverTest(unittest.TestCase):
    def test_federal_presidente(self):
        d = worker.discover(load("ele-c.json"), "8", 1)
        self.assertEqual(d, [("ele2026", "21271", 2), ("ele2026", "21270", 1)])  # turno 2 primeiro

    def test_estadual_governador_e_senador(self):
        conf = load("ele-c.json")
        self.assertEqual(worker.discover(conf, "1", 3), [("ele2026", "21273", 2), ("ele2026", "21272", 1)])
        self.assertEqual(worker.discover(conf, "1", 5)[1], ("ele2026", "21272", 1))

    def test_cargo_inexistente_na_eleicao(self):
        self.assertEqual(worker.discover(load("ele-c.json"), "1", 1), [])  # presidente nao e estadual

    def test_cdt2_nao_duplica_quando_listado(self):
        conf = {"pl": [{"c": "ele2030", "e": [
            {"cd": "1", "cdt2": "2", "t": "1", "tp": "8"}, {"cd": "2", "cdt2": "", "t": "2", "tp": "8"}]}]}
        self.assertEqual(worker.discover(conf, "8"), [("ele2030", "2", 2), ("ele2030", "1", 1)])

    def test_ciclo_novo_vence(self):
        conf = {"pl": [{"c": "ele2026", "e": [{"cd": "1", "t": "1", "tp": "8"}]},
                       {"c": "ele2030", "e": [{"cd": "9", "t": "1", "tp": "8"}]}]}
        self.assertEqual(worker.discover(conf, "8")[0], ("ele2030", "9", 1))


class CargosTest(unittest.TestCase):
    def test_padrao(self):
        padrao = ["presidente", "governador", "senador", "deputado-federal", "deputado-estadual"]
        self.assertEqual([c.name for c in worker.enabled_cargos(None)], padrao)
        self.assertEqual([c.name for c in worker.enabled_cargos("")], padrao)
        self.assertEqual([c.name for c in worker.enabled_cargos("presidente,governador,senador")],
                         ["presidente", "governador", "senador"])      # como desligar deputados

    def test_env_desliga_e_liga(self):
        self.assertEqual([c.name for c in worker.enabled_cargos("presidente")], ["presidente"])
        self.assertEqual([c.name for c in worker.enabled_cargos("senador, Presidente")], ["presidente", "senador"])
        nomes = [c.name for c in worker.enabled_cargos("presidente,deputado_federal,x")]
        self.assertEqual(nomes, ["presidente", "deputado-federal"])

    def test_registro_deputados_ligados(self):
        fed, est = worker.BY_NAME["deputado-federal"], worker.BY_NAME["deputado-estadual"]
        self.assertTrue(fed.enabled and est.enabled)
        self.assertEqual((fed.code, est.code), ("c0006", "c0007"))
        self.assertEqual((fed.code_for("DF"), est.code_for("DF"), est.code_for("SP")),
                         ("c0006", "c0008", "c0007"))
        self.assertEqual((est.num_for("DF"), est.num_for("SP")), ("8", "7"))
        self.assertFalse(fed.fotos or est.fotos)
        self.assertTrue(worker.BY_NAME["senador"].fotos)

    def test_tarefas_so_dos_cargos_ligados(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="governador")
            keys = list(w.tasks)
            self.assertEqual(len(keys), 27)
            self.assertTrue(all(k.startswith("governador/") for k in keys))
            self.assertNotIn("governador/ZZ", keys)
            w2 = make_worker(d, cargos="presidente")
            self.assertEqual(len(w2.tasks), 29)  # BR + 27 UFs + ZZ
            self.assertIn("presidente/BR", w2.tasks)
            self.assertIn("presidente/ZZ", w2.tasks)

    def test_intervalos_por_env(self):
        with mock.patch.dict(os.environ, {"INTERVAL_PRESIDENTE": "15", "INTERVAL_SENADOR": "90",
                                          "INTERVAL_DEPUTADOS": "x"}):
            c = worker.cfg()
        self.assertEqual(c["intervals"]["presidente"], 15)
        self.assertEqual(c["intervals"]["governador"], 60)
        self.assertEqual(c["intervals"]["senador"], 90)


class WriteTest(unittest.TestCase):
    def test_atomico_idempotente_e_modo(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "presidente", "SP.json")
            self.assertTrue(worker.write_if_changed(p, {"a": 1}))
            m1 = os.stat(p).st_mtime_ns
            self.assertFalse(worker.write_if_changed(p, {"a": 1}))
            self.assertEqual(os.stat(p).st_mtime_ns, m1)
            self.assertTrue(worker.write_if_changed(p, {"a": 2}))
            self.assertFalse(os.path.exists(p + ".tmp"))
            if os.name == "posix":
                self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o644)
            self.assertEqual(jread(p), {"a": 2})

    def test_falha_mantem_ultimo_bom(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.json")
            worker.write_if_changed(p, {"ok": True})
            with mock.patch("worker.os.replace", side_effect=OSError("boom")):
                with self.assertRaises(OSError):
                    worker.write_if_changed(p, {"ok": False})
            self.assertEqual(jread(p), {"ok": True})


class SchedulerTest(unittest.TestCase):
    def mk(self, key, layer, next_run, seq=0):
        t = worker.Task(key, "dados", key.split("/")[0], layer, seq, 30, key.split("/")[1])
        t.next_run = next_run
        return t

    def test_prioridade_por_camada_e_atraso(self):
        a = self.mk("senador/SP", 2, 10)
        b = self.mk("governador/SP", 1, 50)
        c = self.mk("presidente/SP", 0, 90)
        d = self.mk("presidente/BR", 0, 80)
        f = worker.Task("foto/presidente/1", "foto", "presidente", worker.FOTO_LAYER, 9)
        f.next_run = 0
        self.assertIs(worker.pick_next([a, b, c, d, f], 100), d)       # presidente mais atrasado
        self.assertIs(worker.pick_next([a, b, f], 100), b)             # governador antes de senador
        self.assertIs(worker.pick_next([a, f], 100), a)
        self.assertIs(worker.pick_next([f], 100), f)                   # foto por ultimo
        self.assertIsNone(worker.pick_next([c], 50))                   # nada vencido

    def test_backoff(self):
        self.assertEqual([worker.backoff(n) for n in range(1, 8)], [30, 60, 120, 240, 480, 600, 600])

    def test_falha_isolada_e_backoff_exponencial(self):
        with tempfile.TemporaryDirectory() as d:
            routes = sim_routes()
            routes[u("ele2026", "21270", "sp", "c0001")] = FetchTimeout("t")
            w = make_worker(d, routes, cargos="presidente")
            w.discover_now(w.clock())
            sp = w.tasks["presidente/SP"]
            # roda tudo que esta vencido, uma tarefa por vez
            for _ in range(len(w.tasks)):
                w.step()
            self.assertEqual(sp.result, "timeout")
            self.assertEqual(sp.fails, 1)
            self.assertEqual(sp.next_run - w.clock(), 30)
            self.assertEqual(w.tasks["presidente/BR"].result, "ok")     # as demais seguiram
            self.assertEqual(w.tasks["presidente/BR"].fails, 0)
            w.clock_.advance(31)
            while w.tasks["presidente/SP"].fails < 2:
                w.step()
            self.assertEqual(sp.next_run - w.clock(), 60)
            w.clock_.advance(61)
            while sp.fails < 3:
                w.step()
            self.assertEqual(sp.next_run - w.clock(), 120)
            # sucesso zera o contador
            routes[u("ele2026", "21270", "sp", "c0001")] = raw("sp-c0001-e021270-u.json")
            w.clock_.advance(121)
            while sp.fails:
                w.step()
            self.assertEqual(sp.result, "ok")
            self.assertEqual(sp.next_run - w.clock(), 30)

    def test_uma_tarefa_por_step_e_pausa(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.discover_now(w.clock())
            self.assertIsNotNone(w.step())
            self.assertEqual(sum(1 for t in w.dados_tasks() if t.last_run is not None), 1)

    def test_nao_roda_tarefas_antes_da_descoberta(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, routes={})                 # ele-c.json 404
            self.assertIsNone(w.step())
            self.assertEqual(w.f.calls, [CONF_URL])
            w.step()
            self.assertEqual(w.f.calls, [CONF_URL])        # nao redescobre a cada tarefa/iteracao
            w.clock_.advance(61)
            w.step()
            self.assertEqual(len(w.f.calls), 2)            # redescobre a cada 60s

    def test_404_nao_e_falha_e_nao_acumula_backoff(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="governador")
            w.discover_now(w.clock())
            while any(t.last_run is None for t in w.dados_tasks()):
                w.step()
            rj = w.tasks["governador/RJ"]
            self.assertEqual(rj.result, "404")
            self.assertEqual(rj.fails, 0)
            self.assertEqual(rj.next_run - w.clock(), 120)    # max(intervalo 60, NOTFOUND_RETRY 120)
            self.assertEqual(w.tasks["governador/SP"].result, "ok")
            self.assertEqual(w.fail_count, 0)

    def test_segundo_turno_com_fallback_para_primeiro(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            urls = [x for x in w.f.calls if "/dados/br/" in x]
            self.assertEqual(urls[0], u("ele2026", "21271", "br", "c0001"))   # tenta turno 2 (cdt2)
            self.assertEqual(urls[1], u("ele2026", "21270", "br", "c0001"))   # cai para turno 1
            self.assertEqual(jread(os.path.join(d, "presidente", "BR.json"))["turno"], 1)
            w.f.calls.clear()
            w.clock_.advance(31)
            w.run_task(w.tasks["presidente/BR"])
            self.assertEqual(len([x for x in w.f.calls if "e021271" in x]), 0)  # 404 do t2 em cache
            w.clock_.advance(121)
            w.f.calls.clear()
            w.run_task(w.tasks["presidente/BR"])
            self.assertEqual(len([x for x in w.f.calls if "e021271" in x]), 1)  # reavalia depois


class LogFormatTest(unittest.TestCase):
    def test_formatos(self):
        with tempfile.TemporaryDirectory() as d:
            routes = sim_routes()
            routes[u("ele2026", "21272", "sp", "c0005")] = FetchTimeout("t")
            routes[u("ele2026", "21272", "rj", "c0005")] = FetchError("HTTP 500")
            w = make_worker(d, routes, cargos="presidente,senador")
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            w.clock_.advance(31)
            w.run_task(w.tasks["presidente/BR"])
            w.run_task(w.tasks["senador/SP"])
            w.run_task(w.tasks["senador/SP"])
            w.run_task(w.tasks["senador/RJ"])
            w.run_task(w.tasks["senador/AC"])
            ls = w.lines
            self.assertRegex(ls[1], r"^ok presidente/BR 200 \d+\.\dKB \d+ms mudou$")
            self.assertRegex(ls[2], r"^ok presidente/BR 200 \d+\.\dKB \d+ms sem-mudanca$")
            self.assertEqual(ls[3], "fail senador/SP timeout 10s retry em 30s (tentativa 1)")
            self.assertEqual(ls[4], "fail senador/SP timeout 10s retry em 60s (tentativa 2)")
            self.assertEqual(ls[5], "fail senador/RJ erro FetchError: HTTP 500 retry em 30s (tentativa 1)")
            self.assertEqual(ls[6], "skip senador/AC 404 sem-arquivo retry em 120s")

    def test_resumo(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.discover_now(w.clock())
            self.assertEqual(w.summary_line(w.clock()),
                             "resumo: 0 ok, 0 falhas, fila 29, presidente/BR ainda sem dados, "
                             "arquivos ok por cargo: presidente=0")
            w.run_task(w.tasks["presidente/BR"])
            w.clock_.advance(18)
            self.assertEqual(w.summary_line(w.clock()),
                             "resumo: 1 ok, 0 falhas, fila 41, presidente/BR atualizado há 18s, "
                             "arquivos ok por cargo: presidente=1")  # 28 dados + 13 fotos

    def test_resumo_a_cada_60s(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.discover_now(w.clock())
            w.step()
            self.assertFalse(any(x.startswith("resumo:") for x in w.lines))
            w.clock_.advance(61)
            w.step()
            self.assertEqual(sum(x.startswith("resumo:") for x in w.lines), 1)


class StatusTest(unittest.TestCase):
    def test_status_json(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.setup()
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            w.run_task(w.tasks["presidente/AC"])          # 404
            w.write_status(w.clock())
            st = jread(os.path.join(d, "status.json"))
            self.assertEqual(set(st), {"startedAt", "heartbeat", "status", "queue", "tasks", "counts", "fotos"})
            self.assertEqual(st["counts"], {"ok": 1, "fail": 0})
            br = st["tasks"]["presidente/BR"]
            self.assertEqual(set(br), {"lastRun", "lastOk", "result", "ms", "bytes", "attempts", "nextRun"})
            self.assertEqual(br["result"], "ok")
            self.assertGreater(br["bytes"], 1000)
            self.assertEqual(br["attempts"], 0)
            self.assertRegex(br["lastOk"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
            self.assertEqual(st["tasks"]["presidente/AC"]["result"], "404")
            self.assertIsNone(st["tasks"]["presidente/SP"]["lastRun"])
            self.assertIsInstance(st["queue"], int)
            self.assertEqual(st["status"], "ok")
            self.assertEqual(len(st["tasks"]), 29)        # fotos nao entram em tasks

    def test_heartbeat_a_cada_10s(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, routes={})                 # aguardando, sem tarefas
            w.step()
            h1 = jread(os.path.join(d, "status.json"))["heartbeat"]
            w.clock_.advance(5)
            w.step()
            self.assertEqual(jread(os.path.join(d, "status.json"))["heartbeat"], h1)
            w.clock_.advance(6)
            w.step()
            self.assertNotEqual(jread(os.path.join(d, "status.json"))["heartbeat"], h1)


class FotoTest(unittest.TestCase):
    def cycle(self, w):
        """Roda a fila toda (dados e fotos) uma vez, como --once."""
        return w.run_once()

    def test_baixa_uma_vez_e_pula_existentes(self):
        with tempfile.TemporaryDirectory() as d:
            routes = sim_routes()
            fotos = {}
            for cargo, cd, nome in (("presidente", "21270", "br"), ("governador", "21272", "sp"),
                                    ("senador", "21272", "sp")):
                code = {"presidente": "c0001", "governador": "c0003", "senador": "c0005"}[cargo]
                norm = worker.normalize(load(f"{nome}-{code}-e0{cd}-u.json"), cargo, nome.upper())
                for c in norm["candidatos"]:
                    url = f"{BASE}/{AMB}/ele2026/{cd}/fotos/{nome}/{c['sqcand']}.jpeg"
                    routes[url] = JPEG
                    fotos[c["sqcand"]] = url
            existente = next(iter(fotos))
            os.makedirs(os.path.join(d, "fotos"))
            with open(os.path.join(d, "fotos", f"{existente}.jpeg"), "wb") as f:
                f.write(b"ja-existe")
            w = make_worker(d, routes)
            self.assertEqual(self.cycle(w), 0)
            baixadas = sorted(os.listdir(os.path.join(d, "fotos")))
            self.assertEqual(len(baixadas), 13 + 12 + 28)
            self.assertNotIn(fotos[existente], w.f.calls)               # nao baixou de novo
            with open(os.path.join(d, "fotos", f"{existente}.jpeg"), "rb") as f:
                self.assertEqual(f.read(), b"ja-existe")
            self.assertEqual(len(w.f.calls), len(set(w.f.calls)))
            self.assertEqual(len([x for x in w.f.calls if "/fotos/" in x]), 13 + 12 + 28 - 1)
            # presidente usa a pasta br; governador/senador a da UF
            self.assertTrue(any("/21270/fotos/br/" in x for x in w.f.calls))
            self.assertTrue(any("/21272/fotos/sp/" in x for x in w.f.calls))
            self.assertEqual(w.foto_tasks(), [])

    def test_foto_404_permanente_por_1h(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")                    # nenhuma foto no mapa
            w.setup()
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            fotos = w.foto_tasks()
            self.assertEqual(len(fotos), 13)
            t = fotos[0]
            w.run_task(t)
            self.assertEqual(t.result, "404")
            self.assertEqual(t.next_run - w.clock(), 3600)
            self.assertEqual(w.foto_fail, 1)
            self.assertIn(t.key, w.tasks)                              # segue na fila, so vence em 1h
            self.assertRegex(w.lines[-1], r"^fail foto/presidente/\d+ 404 permanente retry em 3600s$")
            self.assertFalse(os.path.exists(t.path))

    def test_resposta_que_nao_e_jpeg_nao_grava(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.setup()
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            t = w.foto_tasks()[0]
            w.f.routes[t.url] = b"<html>erro</html>"
            w.run_task(t)
            self.assertEqual(t.result, "error")
            self.assertFalse(os.path.exists(t.path))
            self.assertEqual(t.fails, 1)

    def test_foto_prioridade_baixa(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente,senador")
            w.setup()
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])                        # enfileira 13 fotos
            w.clock_.advance(1)
            nxt = worker.pick_next(w.tasks.values(), w.clock())
            self.assertEqual(nxt.kind, "dados")                         # dados vencidos antes de fotos

    def test_log_foto_ok(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.setup()
            w.discover_now(w.clock())
            w.run_task(w.tasks["presidente/BR"])
            t = w.foto_tasks()[0]
            w.f.routes[t.url] = JPEG
            w.run_task(t)
            self.assertRegex(w.lines[-1], r"^ok foto/presidente/\d+ 200 4\.\dKB \d+ms baixada$")
            self.assertTrue(os.path.getsize(t.path) > 0)


class OnceTest(unittest.TestCase):
    def test_saida_completa(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d)
            # estrutura antiga some
            os.makedirs(os.path.join(d, "uf"))
            open(os.path.join(d, "uf", "SP.json"), "w").close()
            open(os.path.join(d, "nacional.json"), "w").close()
            self.assertEqual(w.run_once(), 0)
            self.assertFalse(os.path.exists(os.path.join(d, "uf")))
            self.assertFalse(os.path.exists(os.path.join(d, "nacional.json")))
            for p in ("presidente/BR", "presidente/SP", "governador/SP", "senador/SP"):
                self.assertTrue(os.path.exists(os.path.join(d, p + ".json")), p)
            self.assertFalse(os.path.exists(os.path.join(d, "governador", "BR.json")))
            self.assertFalse(os.path.exists(os.path.join(d, "governador", "ZZ.json")))
            meta = jread(os.path.join(d, "meta.json"))
            self.assertEqual(meta["status"], "ok")
            self.assertEqual(meta["ambiente"], AMB)
            self.assertEqual(meta["ciclo"], "ele2026")
            self.assertEqual(meta["ufs"], ["SP"])
            self.assertEqual(set(meta["cargos"]), {"presidente", "governador", "senador"})
            p = meta["cargos"]["presidente"]
            self.assertEqual((p["eleicao"], p["turno"], p["ufs"]), ("21270", 1, ["SP"]))
            self.assertEqual(p["tse"], {"dg": "29/09/2026", "hg": "16:29:12"})
            self.assertEqual(meta["cargos"]["governador"]["eleicao"], "21272")
            self.assertEqual(meta["cargos"]["senador"]["ufs"], ["SP"])
            self.assertRegex(meta["atualizadoEm"], r"Z$")
            s = jread(os.path.join(d, "senador", "SP.json"))
            self.assertEqual((s["cargo"], s["escopo"], s["vagas"]), ("senador", "SP", 2))
            self.assertEqual(jread(os.path.join(d, "presidente", "BR.json"))["vagas"], 1)
            self.assertTrue(os.path.exists(os.path.join(d, "status.json")))

    def test_cargo_desligado_nao_gera_nada(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, cargos="presidente")
            w.run_once()
            self.assertFalse(os.path.exists(os.path.join(d, "governador")))
            self.assertFalse(os.path.exists(os.path.join(d, "senador")))
            self.assertEqual(list(jread(os.path.join(d, "meta.json"))["cargos"]), ["presidente"])
            self.assertFalse(any("c0003" in x or "c0005" in x for x in w.f.calls))

    def test_aguardando(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, routes={})
            self.assertEqual(w.run_once(), 1)
            meta = jread(os.path.join(d, "meta.json"))
            self.assertEqual(meta["status"], "aguardando")
            self.assertEqual(meta["cargos"], {})
            self.assertEqual(meta["ufs"], [])
            self.assertEqual(jread(os.path.join(d, "status.json"))["status"], "aguardando")

    def test_aguardando_com_config_mas_sem_dados(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, routes={CONF_URL: raw("ele-c.json")}, cargos="presidente")
            self.assertEqual(w.run_once(), 0)
            self.assertEqual(jread(os.path.join(d, "meta.json"))["status"], "aguardando")

    def test_meta_mantem_cargo_de_execucao_anterior(self):
        with tempfile.TemporaryDirectory() as d:
            make_worker(d).run_once()
            w = make_worker(d, routes={})                 # TSE caiu; reinicio do worker
            w.setup()
            w.write_meta(w.clock(), force=True)
            meta = jread(os.path.join(d, "meta.json"))
            self.assertEqual(meta["status"], "ok")
            self.assertEqual(meta["cargos"]["presidente"]["eleicao"], "21270")

    def test_idempotente(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d)
            w.run_once()
            p = os.path.join(d, "senador", "SP.json")
            m = os.stat(p).st_mtime_ns
            w.clock_.advance(100)
            for t in w.dados_tasks():
                t.next_run = 0
            w.run_once()
            self.assertEqual(os.stat(p).st_mtime_ns, m)
            self.assertIn("sem-mudanca", "\n".join(w.lines))


def dep_routes():
    r = sim_routes()
    r[u("ele2026", "21272", "sp", "c0006")] = raw("sp-c0006-e021272-u.json")
    r[u("ele2026", "21272", "sp", "c0007")] = raw("sp-c0007-e021272-u.json")
    r[u("ele2026", "21272", "df", "c0008")] = raw("df-c0008-e021272-u.json")
    return r


class DeputadosTest(unittest.TestCase):
    def test_federal_sp(self):
        out = worker.normalize(load("sp-c0006-e021272-u.json"), "deputado-federal", "SP", 6, True)
        self.assertEqual((out["cargo"], out["escopo"], out["vagas"]), ("deputado-federal", "SP", 69))
        self.assertEqual(out["cargoNome"], "Deputado Federal")
        self.assertGreater(len(out["candidatos"]), 1700)
        c = out["candidatos"]
        votos = [x["votos"] for x in c]
        self.assertEqual(votos, sorted(votos, reverse=True))
        self.assertEqual(set(c[0]), {"seq", "numero", "sqcand", "nome", "partido", "coligacao", "votos",
                                     "percentual", "situacao", "eleito"})
        self.assertEqual(out["totalizacao"]["votosValidos"], 25608603)
        self.assertEqual(out["totalizacao"]["nulos"], 17136)
        # coligacao: federacao/coligacao do agrupamento; isolado (igual a sigla) vira null
        com = {x["coligacao"] for x in c}
        self.assertIn(None, com)
        self.assertIn("P 9966 / P 9991", com)
        self.assertTrue(all(x["partido"] for x in c))
        self.assertTrue(any(x["eleito"] for x in c))

    def test_estadual_sp(self):
        out = worker.normalize(load("sp-c0007-e021272-u.json"), "deputado-estadual", "SP", 7, True)
        self.assertEqual((out["vagas"], out["cargoNome"]), (94, "Deputado Estadual"))
        self.assertGreater(len(out["candidatos"]), 2300)
        self.assertTrue(any(x["eleito"] for x in out["candidatos"]))

    def test_distrital_df(self):
        out = worker.normalize(load("df-c0008-e021272-u.json"), "deputado-estadual", "DF", 8, True)
        self.assertEqual((out["cargo"], out["escopo"], out["vagas"]), ("deputado-estadual", "DF", 28))
        self.assertEqual(out["cargoNome"], "Deputado Distrital")

    def test_demais_cargos_nao_mudam_contrato(self):
        out = worker.normalize(load("sp-c0005-e021272-u.json"), "senador", "SP", 5)
        self.assertNotIn("cargoNome", out)
        self.assertNotIn("coligacao", out["candidatos"][0])

    def test_json_compacto(self):
        with tempfile.TemporaryDirectory() as d:
            out = worker.normalize(load("sp-c0007-e021272-u.json"), "deputado-estadual", "SP", 7, True)
            p = os.path.join(d, "x", "SP.json")
            worker.write_if_changed(p, out, compact=True)
            body = open(p, "rb").read()
            self.assertNotIn(b"\n  ", body)
            self.assertNotIn(b'": ', body)
            self.assertEqual(body.count(b"\n"), 1)
            self.assertLess(len(body), len(raw("sp-c0007-e021272-u.json")) * 0.8)
            self.assertLess(len(body), 480_000)
            self.assertEqual(json.loads(body), out)
            self.assertFalse(worker.write_if_changed(p, out, compact=True))

    def test_once_deputados_df_distrital_sem_foto(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, dep_routes(), cargos="deputado-federal,deputado-estadual")
            self.assertEqual(w.run_once(), 0)
            for p in ("deputado-federal/SP", "deputado-estadual/SP", "deputado-estadual/DF"):
                self.assertTrue(os.path.exists(os.path.join(d, p + ".json")), p)
            self.assertFalse(os.path.exists(os.path.join(d, "deputado-federal", "ZZ.json")))
            self.assertFalse(os.path.exists(os.path.join(d, "deputado-estadual", "ZZ.json")))
            self.assertIn(u("ele2026", "21272", "df", "c0008"), w.f.calls)
            self.assertNotIn(u("ele2026", "21272", "df", "c0007"), w.f.calls)
            self.assertFalse(any("/fotos/" in x for x in w.f.calls))
            self.assertFalse(os.path.exists(os.path.join(d, "fotos")))
            self.assertEqual(jread(os.path.join(d, "deputado-estadual", "DF.json"))["cargoNome"],
                             "Deputado Distrital")
            self.assertEqual(jread(os.path.join(d, "deputado-estadual", "SP.json"))["cargoNome"],
                             "Deputado Estadual")
            self.assertEqual(jread(os.path.join(d, "deputado-federal", "SP.json"))["vagas"], 69)
            meta = jread(os.path.join(d, "meta.json"))
            self.assertEqual(meta["cargos"]["deputado-estadual"]["ufs"], ["DF", "SP"])
            self.assertEqual(meta["cargos"]["deputado-federal"]["ufs"], ["SP"])
            self.assertEqual(meta["cargos"]["deputado-federal"]["eleicao"], "21272")
            self.assertEqual(meta["cargos"]["deputado-federal"]["ciclo"], "ele2026")
            self.assertEqual(meta["base"], BASE)
            self.assertEqual(meta["ambiente"], AMB)
            self.assertIn("deputado-federal=1", w.lines[-1])
            self.assertIn("deputado-estadual=2", w.lines[-1])
            st = jread(os.path.join(d, "status.json"))
            self.assertEqual(st["fotos"]["baixadas"], 0)
            self.assertEqual(st["fotos"]["pendentes"], 0)

    def test_meta_base_e_ciclo_em_todos_os_cargos(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d)
            w.run_once()
            meta = jread(os.path.join(d, "meta.json"))
            self.assertEqual(meta["base"], BASE)
            self.assertEqual(meta["cargos"]["presidente"]["ciclo"], "ele2026")
            self.assertEqual(meta["cargos"]["senador"]["ciclo"], "ele2026")

    def test_fila_presidente_nao_atrasa_com_deputados_pendentes(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, dep_routes(), cargos="presidente,deputado-federal,deputado-estadual")
            deps = [t for t in w.dados_tasks() if t.cargo.startswith("deputado")]
            pres = [t for t in w.dados_tasks() if t.cargo == "presidente"]
            self.assertEqual(len(deps), 54)
            self.assertTrue(all(t.layer > pres[0].layer for t in deps))
            self.assertEqual({t.interval for t in deps}, {300})
            now = w.clock()
            tasks = list(w.tasks.values())
            order = []
            for _ in range(len(pres) + 3):       # tudo vencido: presidente inteiro sai primeiro
                t = worker.pick_next(tasks, now)
                order.append(t.cargo)
                t.next_run = now + t.interval
            self.assertEqual(order[:len(pres)], ["presidente"] * len(pres))
            self.assertEqual(order[len(pres):], ["deputado-federal"] * 3)
            # deputados atrasados ha muito tempo, presidente vence agora: presidente primeiro
            for t in deps:
                t.next_run = now - 1000
            pres[0].next_run = now
            self.assertIs(worker.pick_next(tasks, now), pres[0])
            # foto fica depois dos deputados
            f = worker.Task("foto/presidente/1", "foto", "presidente", worker.FOTO_LAYER, 999)
            f.next_run = 0
            self.assertEqual(worker.pick_next(deps + [f], now).cargo, "deputado-federal")

    def test_step_com_deputados_atende_presidente_no_prazo(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d, dep_routes(), cargos="presidente,deputado-federal,deputado-estadual")
            w.setup()
            w.discover_now(w.clock())
            for _ in range(200):          # drena a primeira rodada completa (83 tarefas)
                w.step()
                w.clock_.advance(0.2)
            br = w.tasks["presidente/BR"]
            self.assertIsNotNone(br.last_ok)
            w.clock_.advance(31)          # presidente vence; deputados (300s) ainda nao
            ran = w.step()
            self.assertEqual(ran.cargo, "presidente")


class HealthTest(unittest.TestCase):
    def write(self, d, **kw):
        st = {"startedAt": worker.iso(1000), "heartbeat": worker.iso(1000), "status": "ok",
              "tasks": {"presidente/BR": {"lastOk": worker.iso(1000)}}}
        st.update(kw)
        with open(os.path.join(d, "status.json"), "w") as f:
            json.dump(st, f)

    def test_saudavel(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d)
            self.assertTrue(healthcheck.check(d, now=1100)[0])

    def test_heartbeat_parado(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d)
            ok, why = healthcheck.check(d, now=1000 + 121)
            self.assertFalse(ok)
            self.assertIn("heartbeat", why)

    def test_presidente_velho_so_se_status_ok(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d, heartbeat=worker.iso(1170))
            ok, why = healthcheck.check(d, now=1181)
            self.assertFalse(ok)
            self.assertIn("presidente/BR", why)
            self.write(d, heartbeat=worker.iso(1170), status="aguardando")
            self.assertTrue(healthcheck.check(d, now=1181)[0])

    def test_sem_lastok_usa_startedat(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d, tasks={"presidente/BR": {"lastOk": None}}, heartbeat=worker.iso(1100))
            self.assertTrue(healthcheck.check(d, now=1150)[0])
            self.write(d, tasks={"presidente/BR": {"lastOk": None}}, heartbeat=worker.iso(1190))
            self.assertFalse(healthcheck.check(d, now=1200)[0])

    def test_sem_arquivo(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(healthcheck.check(d)[0])

    def test_status_real_do_worker_e_saudavel(self):
        with tempfile.TemporaryDirectory() as d:
            w = make_worker(d)
            w.run_once()
            self.assertTrue(healthcheck.check(d, now=w.clock())[0])


if __name__ == "__main__":
    unittest.main()
