#!/usr/bin/env python3
"""Aplica uma migration no banco Noowe com o texto exato do arquivo, numa transação, e registra no histórico.

Uso:  python3 platform/supabase/scripts/apply-noowe.py platform/supabase/migrations/2026..._nome.sql

`supabase db push` não serve aqui: o histórico do banco e o do repositório têm versões diferentes.
Usa o login da CLI do Supabase, sem senha.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_REF = "eplivpvqemowmbivhfpx"
CLI = ["npx", "--yes", "supabase@latest"]


def main():
    path = Path(sys.argv[1])
    m = re.match(r"(\d{14})_(.+)\.sql$", path.name)
    if not m:
        sys.exit(f"nome fora do padrão: {path.name}")
    version, name = m.groups()
    sql = (
        "begin;\n" + path.read_text(encoding="utf-8").rstrip() + "\n;\n"
        "insert into supabase_migrations.schema_migrations(version, name) "
        f"values ('{version}', '{name}') on conflict (version) do nothing;\n"
        f"commit;\nselect 'aplicada {version}' as resultado;\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as tmp:
        tmp.write(sql)
        batch = tmp.name
    try:
        p = subprocess.run(
            CLI + ["db", "query", f"--remote={PROJECT_REF}", "--yes", "--output-format", "json", "-f", batch],
            capture_output=True, text=True, timeout=300,
        )
    finally:
        Path(batch).unlink(missing_ok=True)
    out = p.stdout + p.stderr
    if f"aplicada {version}" not in out:
        print(out[-2500:])
        sys.exit(f"FALHOU: {path.name}")
    print(f"aplicada: {path.name}")


if __name__ == "__main__":
    main()
