#!/usr/bin/env bash
# Falha (exit 1) se o projeto Supabase tiver alguma private.dev_flags ligada.
# Obrigatorio antes de publicar em producao (QA B0): simulate_table_scan e
# simulate_pix_payment deixam qualquer cliente abrir comanda sem estar na mesa
# e confirmar Pix simulado. Uso: scripts/check-dev-flags.sh <project-ref>
# Somente leitura.
set -euo pipefail
ref="${1:?uso: $0 <project-ref>}"
out="$(npx --yes supabase@latest db query --read-only --remote="$ref" \
  "select 'DEVFLAGS=' || coalesce(string_agg(key, ',' order by key), '') as r from private.dev_flags where enabled" 2>&1)" || {
  echo "ERRO: nao consegui consultar private.dev_flags em $ref:" >&2; echo "$out" >&2; exit 2; }
printf '%s\n' "$out" | grep -q 'DEVFLAGS=' || { echo "ERRO: resposta inesperada de $ref:" >&2; echo "$out" >&2; exit 2; }
flags="$(printf '%s\n' "$out" | grep -oE 'DEVFLAGS=[a-z_,]*' | head -1 | cut -d= -f2)"
if [ -n "$flags" ]; then
  echo "BLOQUEADO: dev_flags ligadas em $ref: $flags" >&2
  echo "Desligue antes do deploy: update private.dev_flags set enabled=false, updated_at=now();" >&2
  exit 1
fi
echo "OK: nenhuma dev_flag ligada em $ref"
