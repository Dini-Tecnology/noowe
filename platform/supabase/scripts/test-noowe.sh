#!/usr/bin/env bash
# Roda os testes pgTAP de platform/supabase/tests direto no banco Noowe, sem Docker.
#
# Uso:  platform/supabase/scripts/test-noowe.sh [--only 55] [--keep]
#   --only N   roda só os arquivos que começam com N (ex.: 55)
#   --keep     não remove o pgTAP e o schema _test no fim
#
# A URL de conexão fica em ~/.noowe-db-url (uma linha, chmod 600) e nunca é impressa nem commitada.
# Cada arquivo roda dentro de begin ... rollback, então nenhum dado de teste fica no banco. Só o 00_setup cria algo fora
# de transação (a extensão pgTAP e o schema _test), e isto é removido no fim, salvo com --keep.
#
# Atenção: tests/19 trava a tabela restaurants por instantes (disable trigger), e há testes que contam linhas e
# assumem dados limpos. Falha por causa dos dados do banco deve ser ajustada no teste, nunca escondida.
set -uo pipefail

PROJECT_REF="eplivpvqemowmbivhfpx"
URL_FILE="${NOOWE_DB_URL_FILE:-$HOME/.noowe-db-url}"
TESTS_DIR="$(cd "$(dirname "$0")/../tests" && pwd)"
ONLY=""
KEEP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

command -v psql >/dev/null || { echo "psql não encontrado (brew install libpq)" >&2; exit 2; }
[ -f "$URL_FILE" ] || { echo "Falta $URL_FILE com a URL de conexão do banco Noowe (uma linha, chmod 600)." >&2; exit 2; }
perms="$(stat -f '%Lp' "$URL_FILE" 2>/dev/null || stat -c '%a' "$URL_FILE")"
[ "$perms" = "600" ] || { echo "Ajuste a permissão: chmod 600 $URL_FILE (hoje $perms)" >&2; exit 2; }

DB_URL="$(head -n 1 "$URL_FILE" | tr -d '\r\n')"
# Trava de segurança: só roda contra o projeto Noowe, nunca contra outro banco.
case "$DB_URL" in
  *"$PROJECT_REF"*) ;;
  *) echo "A URL não aponta para o projeto $PROJECT_REF. Nada foi executado." >&2; exit 2 ;;
esac

run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=0 "$@"; }

echo "== Montando o ambiente (00_setup)"
run -f "$TESTS_DIR/00_setup.sql" >/dev/null 2>&1 || { echo "00_setup falhou" >&2; exit 1; }

total_ok=0; total_fail=0; failed_files=()
for f in "$TESTS_DIR"/[0-9]*.sql; do
  name="$(basename "$f")"
  case "$name" in 00_setup.sql) continue ;; esac
  if [ -n "$ONLY" ]; then case "$name" in "$ONLY"*) ;; *) continue ;; esac; fi
  out="$(run -f "$f" 2>&1)"
  ok="$(printf '%s\n' "$out" | grep -c '^ok ')"
  bad="$(printf '%s\n' "$out" | grep -c '^not ok ')"
  err="$(printf '%s\n' "$out" | grep -c -E '^(psql:.*ERROR|ERROR):')"
  if [ "$bad" -gt 0 ] || [ "$err" -gt 0 ] || [ "$ok" -eq 0 ]; then
    echo "FALHA  $name  (ok=$ok, not ok=$bad, erros=$err)"
    printf '%s\n' "$out" | grep -E '^(not ok|# |psql:.*ERROR|ERROR)' | head -12 | sed 's/^/         /'
    failed_files+=("$name"); total_fail=$((total_fail + 1))
  else
    echo "ok     $name  ($ok)"
    total_ok=$((total_ok + 1))
  fi
done

if [ "$KEEP" -eq 0 ]; then
  run -c "drop schema if exists _test cascade; drop extension if exists pgtap;" >/dev/null 2>&1
fi

echo "== Arquivos: $total_ok ok, $total_fail com falha"
[ "$total_fail" -eq 0 ] || { printf '   %s\n' "${failed_files[@]}"; exit 1; }
