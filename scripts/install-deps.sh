#!/usr/bin/env bash
# Instala dependências de backend, mobile (Expo) e site.
# Uso: ./scripts/install-deps.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_package() {
  local name="$1"
  local path="$2"
  shift 2

  echo ""
  echo "==> Instalando ${name} (${path})"
  cd "${ROOT}/${path}"
  npm "$@"
  echo "OK: ${name}"
}

echo "Project Okinawa — instalação de dependências"
echo "Raiz: ${ROOT}"

install_package "Backend" "platform/backend" install
install_package "Mobile (Expo)" "platform/mobile" install
install_package "Site" "site" install --legacy-peer-deps

echo ""
echo "Todas as dependências foram instaladas com sucesso."
echo ""
echo "Próximos passos:"
echo "  Backend:         cd platform/backend && npm run start:dev"
echo "  Expo client:     cd platform/mobile && npm run client"
echo "  Expo restaurant: cd platform/mobile && npm run restaurant"
