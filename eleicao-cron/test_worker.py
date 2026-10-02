import json
import os
import tempfile
import unittest
from unittest import mock

import worker

FX = os.path.join(os.path.dirname(__file__), "tests", "fixtures")


def load(name):
    with open(os.path.join(FX, name), "rb") as f:
        return json.loads(f.read().decode("utf-8-sig"))


class NormalizeTest(unittest.TestCase):
    def test_nacional(self):
        out = worker.normalize(load("br-c0001-e021270-u.json"), "BR")
        self.assertEqual(out["escopo"], "BR")
        self.assertEqual(out["turno"], 1)
        self.assertEqual(out["tse"], {"dg": "29/09/2026", "hg": "16:29:12"})
        t = out["totalizacao"]
        self.assertEqual(t["pctSecoes"], 100)
        self.assertEqual(t["votosValidos"], 100982116)
        self.assertEqual(t["brancos"], 9118018)
        self.assertEqual(t["nulos"], 9040537)
        c = out["candidatos"]
        self.assertEqual(len(c), 13)
        votos = [x["votos"] for x in c]
        self.assertEqual(votos, sorted(votos, reverse=True))
        top = c[0]
        self.assertEqual(top["votos"], 10503573)
        self.assertEqual(top["partido"], "P 9998")
        self.assertEqual(top["percentual"], 8.71)
        self.assertIsInstance(top["seq"], int)
        self.assertFalse(top["eleito"])
        self.assertEqual({"seq", "numero", "nome", "partido", "votos", "percentual",
                          "situacao", "eleito"}, set(top))

    def test_uf_e_nome_curto(self):
        out = worker.normalize(load("sp-c0001-e021270-u.json"), "SP")
        self.assertEqual(out["escopo"], "SP")
        self.assertEqual(out["totalizacao"]["votosValidos"], 22328209)
        self.assertIn('Candidato string 1234!@#$"TSE"', [x["nome"] for x in out["candidatos"]])

    def test_totalizacao_ausente_vira_null(self):
        out = worker.normalize({"t": "1", "carg": []}, "BR")
        self.assertEqual(out["totalizacao"], {"pctSecoes": None, "votosValidos": None,
                                              "brancos": None, "nulos": None})
        self.assertEqual(out["candidatos"], [])

    def test_eleito(self):
        self.assertTrue(worker._eleito({"e": "s", "st": "Eleito"}))
        self.assertFalse(worker._eleito({"e": "s", "st": "2º turno"}))
        self.assertFalse(worker._eleito({"e": "n", "st": "Não eleito"}))

    def test_discover(self):
        d = worker.discover(load("ele-c.json"))
        self.assertEqual(d[0], ("ele2026", "21271", 2))  # turno mais alto primeiro
        self.assertIn(("ele2026", "21270", 1), d)


class WriteTest(unittest.TestCase):
    def test_atomico_e_idempotente(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "uf", "SP.json")
            self.assertTrue(worker.write_if_changed(p, {"a": 1}))
            m1 = os.stat(p).st_mtime_ns
            self.assertFalse(worker.write_if_changed(p, {"a": 1}))
            self.assertEqual(os.stat(p).st_mtime_ns, m1)
            self.assertTrue(worker.write_if_changed(p, {"a": 2}))
            self.assertFalse(os.path.exists(p + ".tmp"))
            with open(p) as f:
                self.assertEqual(json.load(f), {"a": 2})

    def test_falha_mantem_ultimo_bom(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.json")
            worker.write_if_changed(p, {"ok": True})
            with mock.patch("worker.os.replace", side_effect=OSError("boom")):
                with self.assertRaises(OSError):
                    worker.write_if_changed(p, {"ok": False})
            with open(p) as f:
                self.assertEqual(json.load(f), {"ok": True})


class CycleTest(unittest.TestCase):
    def cfg(self, d):
        return {"base": "http://x", "ambiente": "a/b", "interval": 1, "data": d}

    def test_aguardando_em_404(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch("worker.fetch_json", side_effect=worker.NotFound("u")):
                self.assertFalse(worker.run_cycle(None, self.cfg(d)))
            with open(os.path.join(d, "meta.json")) as f:
                self.assertEqual(json.load(f)["status"], "aguardando")
            self.assertEqual(os.listdir(d), ["meta.json"])

    def test_ciclo_completo_tolera_uf_com_erro(self):
        br = load("br-c0001-e021270-u.json")
        sp = load("sp-c0001-e021270-u.json")
        conf = load("ele-c.json")

        def fake(session, url):
            if url.endswith("ele-c.json"):
                return conf
            if "e021271" in url:
                raise worker.NotFound(url)  # 2o turno ainda nao publicado
            if "/dados/br/" in url:
                return br
            if "/dados/rj/" in url:
                raise RuntimeError("500")
            return sp

        with tempfile.TemporaryDirectory() as d:
            with mock.patch("worker.fetch_json", side_effect=fake):
                self.assertTrue(worker.run_cycle(None, self.cfg(d)))
            with open(os.path.join(d, "meta.json")) as f:
                meta = json.load(f)
            self.assertEqual(meta["status"], "ok")
            self.assertEqual(meta["eleicao"], "21270")
            self.assertNotIn("RJ", meta["ufs"])
            self.assertIn("SP", meta["ufs"])
            self.assertTrue(os.path.exists(os.path.join(d, "nacional.json")))
            self.assertEqual(len(os.listdir(os.path.join(d, "uf"))), 27)  # 26 UFs + ZZ


if __name__ == "__main__":
    unittest.main()
