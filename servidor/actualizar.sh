#!/usr/bin/env bash
# Baja la última versión de GitHub y reinicia la web. Uso: bash /opt/tenka/servidor/actualizar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI/.."
git pull --ff-only
cd "$AQUI"
docker compose up -d --build
docker image prune -f >/dev/null
echo "Actualizado a $(git -C .. log -1 --format='%h %s')"
