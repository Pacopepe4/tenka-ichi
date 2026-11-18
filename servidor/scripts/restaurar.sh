#!/usr/bin/env bash
# Restaura una copia hecha con copia-seguridad.sh: la carpeta data/, el .env y la configuración del DDNS.
# La hoja de Google no se pisa sola: si hiciera falta, se recupera desde Google Sheets
# (Archivo → Historial de versiones) o pegando a mano lo que hay en hoja.json.
# Uso: bash restaurar.sh /opt/tenka-copias/tenka-AAAA-MM-DD_HHMM.tar.gz
set -euo pipefail
COPIA="${1:?Dime qué copia restaurar: bash $0 /opt/tenka-copias/tenka-….tar.gz}"
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tar -xzf "$COPIA" -C "$TMP"
read -r -p "Esto sustituye data/, .env y la config del DDNS por los de $(basename "$COPIA"). ¿Seguro? (escribe si) " r
[ "$r" = "si" ] || { echo "Cancelado"; exit 1; }

cd "$AQUI"
docker compose stop app
ANTES="$RAIZ/data.antes-de-restaurar.$(date +%s)"
mv "$RAIZ/data" "$ANTES"
cp -a "$TMP/copia/data" "$RAIZ/data"
sudo chown -R 1000:1000 "$RAIZ/data"
cp "$TMP/copia/env" "$AQUI/.env"
[ -f "$TMP/copia/ddns-config.json" ] && cp "$TMP/copia/ddns-config.json" "$AQUI/ddns/config.json"
docker compose up -d
echo "Restaurado. Los datos que había antes están en $ANTES (bórralos cuando veas que todo va bien)."
