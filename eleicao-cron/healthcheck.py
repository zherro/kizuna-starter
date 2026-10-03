"""Healthcheck do container: le DATA_DIR/status.json.

Nao saudavel (exit 1) se:
  - status.json ausente/ilegivel, ou heartbeat com mais de 120s;
  - status "ok" e presidente/BR sem sucesso ha mais de 180s (sem sucesso nenhum: conta desde startedAt).
Em "aguardando" basta o heartbeat estar vivo.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

HEARTBEAT_MAX = 120
PRESIDENTE_MAX = 180


def _ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def check(data_dir, now=None):
    """Retorna (saudavel, motivo)."""
    now = time.time() if now is None else now
    try:
        with open(os.path.join(data_dir, "status.json"), "rb") as f:
            st = json.loads(f.read().decode("utf-8-sig"))
        hb = _ts(st["heartbeat"])
    except Exception as e:
        return False, f"status.json ilegivel: {e}"
    age = now - hb
    if age > HEARTBEAT_MAX:
        return False, f"heartbeat parado ha {int(age)}s"
    if st.get("status") == "ok":
        t = (st.get("tasks") or {}).get("presidente/BR")
        if t is not None:
            ref = t.get("lastOk") or st.get("startedAt")
            try:
                idade = now - _ts(ref)
            except Exception:
                return False, "presidente/BR sem horario valido"
            if idade > PRESIDENTE_MAX:
                return False, f"presidente/BR sem sucesso ha {int(idade)}s"
    return True, "ok"


if __name__ == "__main__":
    ok, why = check(os.environ.get("DATA_DIR", "/data"))
    print(("saudavel: " if ok else "NAO saudavel: ") + why)
    sys.exit(0 if ok else 1)
