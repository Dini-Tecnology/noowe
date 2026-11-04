#!/usr/bin/env python3
"""Roda os testes pgTAP direto no banco Noowe, sem Docker e sem senha.

Uso:  python3 platform/supabase/scripts/test-noowe.py [--only 55 57] [--json saida.json]

Usa o login da CLI do Supabase (`supabase db query --remote`). Esse caminho só devolve o resultado do último comando,
então cada arquivo é reescrito para guardar as respostas do pgTAP numa tabela e terminar com um erro que as carrega.
O erro é o que desfaz tudo: nada do teste fica no banco, nem o pgTAP nem o schema _test.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_REF = "eplivpvqemowmbivhfpx"
CLI = ["npx", "--yes", "supabase@latest"]
TESTS = Path(__file__).resolve().parent.parent / "tests"
MARK = "TAPRESULT"
TIMEOUT_S = 300


def split_statements(sql):
    """Divide em comandos, respeitando comentários, aspas e dollar quoting."""
    out, cur, i, n = [], [], 0, len(sql)
    while i < n:
        c = sql[i]
        if sql.startswith("--", i):
            end = sql.find("\n", i)
            i = n if end < 0 else end
            continue
        if sql.startswith("/*", i):
            end = sql.find("*/", i)
            i = n if end < 0 else end + 2
            continue
        if c == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            cur.append(sql[i : j + 1])
            i = j + 1
            continue
        if c == "$":
            m = re.match(r"\$[A-Za-z_]*\$", sql[i:])
            if m:
                tag = m.group(0)
                end = sql.find(tag, i + len(tag))
                if end < 0:
                    raise ValueError(f"dollar quote sem fim: {tag}")
                cur.append(sql[i : end + len(tag)])
                i = end + len(tag)
                continue
        if c == ";":
            stmt = "".join(cur).strip()
            if stmt:
                out.append(stmt)
            cur, i = [], i + 1
            continue
        cur.append(c)
        i += 1
    stmt = "".join(cur).strip()
    if stmt:
        out.append(stmt)
    return out


def first_word(stmt):
    m = re.match(r"\s*([A-Za-z]+)", stmt)
    return m.group(1).lower() if m else ""


def transform(setup_sql, test_sql):
    """Monta o lote de um arquivo: setup, testes capturando as respostas e o erro final que desfaz tudo."""
    parts = ["begin"]
    # O 00_setup monta o ambiente e depois tem testes próprios, em begin ... rollback: aqui só entra a montagem.
    for stmt in split_statements(setup_sql):
        if first_word(stmt) == "begin":
            break
        parts.append(stmt)
    parts += [
        "create sequence _test.__tap_seq",
        "create table _test.__tap(n bigint default nextval('_test.__tap_seq'), line text)",
        "grant usage on sequence _test.__tap_seq to public",
        "grant all on _test.__tap to public",
    ]
    for stmt in split_statements(test_sql):
        word = first_word(stmt)
        if word in ("begin", "rollback", "commit"):
            continue
        # Só "with" que apenas lê cabe dentro de um subselect; os que escrevem seguem como estão.
        reads = word == "select" or (word == "with" and not re.search(r"\b(insert|update|delete)\b", stmt, re.I))
        if reads:
            parts.append(
                # Materializado: o pgTAP conta cada chamada, e a função não pode rodar duas vezes.
                "with __r as materialized (\n" + stmt + "\n) insert into _test.__tap(line) select e.v from __r, "
                "lateral jsonb_each_text(to_jsonb(__r)) e(k, v) where e.v is not null"
            )
        else:
            parts.append(stmt)
    parts.append(
        "do $tapend$ declare v_ok int; v_bad int; v_detail text; begin "
        "select count(*) filter (where line like 'ok %'), count(*) filter (where line like 'not ok %') "
        "into v_ok, v_bad from _test.__tap; "
        "select left(coalesce(string_agg(line, E'\\n' order by n), ''), 6000) into v_detail from _test.__tap "
        "where line like 'not ok %' or line like '#%'; "
        f"raise exception '{MARK} ok=% not_ok=% %', v_ok, v_bad, E'\\n' || v_detail; end $tapend$"
    )
    return ";\n".join(parts) + ";\n"


def run_file(path, setup_sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as tmp:
        tmp.write(transform(setup_sql, path.read_text(encoding="utf-8")))
        batch = tmp.name
    try:
        p = subprocess.run(
            CLI + ["db", "query", f"--remote={PROJECT_REF}", "--yes", "--output-format", "json", "-f", batch],
            capture_output=True, text=True, timeout=TIMEOUT_S,
        )
        text = p.stdout + "\n" + p.stderr
    except subprocess.TimeoutExpired:
        return {"file": path.name, "state": "erro", "ok": 0, "not_ok": 0, "detail": f"passou de {TIMEOUT_S}s"}
    finally:
        Path(batch).unlink(missing_ok=True)
    # A mensagem vem como JSON dentro de JSON, com as quebras de linha escapadas duas vezes.
    text = text.replace("\\\\n", "\n").replace("\\n", "\n").replace('\\"', '"')
    m = re.search(MARK + r" ok=(\d+) not_ok=(\d+)\s(.*)", text, re.S)
    if not m:
        return {"file": path.name, "state": "erro", "ok": 0, "not_ok": 0, "detail": text.strip()[-1500:]}
    ok, bad = int(m.group(1)), int(m.group(2))
    # O texto da CLI depois da mensagem não é do teste.
    detail = "\n".join(l for l in m.group(3).split("\n") if l.startswith(("not ok", "#")))
    planned_wrong = "Looks like" in detail
    state = "ok" if bad == 0 and ok > 0 and not planned_wrong else "falha"
    return {"file": path.name, "state": state, "ok": ok, "not_ok": bad, "detail": detail}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=[], help="prefixos de arquivo, ex.: 55 57")
    ap.add_argument("--json", help="grava o resultado neste arquivo")
    args = ap.parse_args()

    setup = (TESTS / "00_setup.sql").read_text(encoding="utf-8")
    files = sorted(p for p in TESTS.glob("[0-9]*.sql") if p.name != "00_setup.sql")
    if args.only:
        files = [p for p in files if any(p.name.startswith(o) for o in args.only)]

    results = []
    for path in files:
        r = run_file(path, setup)
        results.append(r)
        print(f"{r['state']:<6} {r['file']}  (ok={r['ok']}, not ok={r['not_ok']})", flush=True)
        if r["state"] != "ok":
            for line in r["detail"].split("\n")[:14]:
                print("         " + line[:200], flush=True)

    if args.json:
        Path(args.json).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    passed = sum(r["state"] == "ok" for r in results)
    print(f"== Arquivos: {passed} ok, {len(results) - passed} com problema; "
          f"testes: {sum(r['ok'] for r in results)} ok, {sum(r['not_ok'] for r in results)} not ok")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
