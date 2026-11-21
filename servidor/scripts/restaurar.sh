#!/usr/bin/env bash
# Restaura una copia hecha con copia-seguridad.sh: la carpeta data/, el .env, la configuración del DDNS y, si lo
# lleva, el contexto de los bots (contexto.dump, en el contenedor «db»).
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
# El contexto de los bots: si la copia lo trae, se carga encima (si no, la web lo rehace sola al arrancar)
if [ -f "$TMP/copia/contexto.dump" ]; then
  docker compose up -d db
  for _ in $(seq 1 30); do docker compose exec -T db pg_isready -U tenka -d tenka >/dev/null 2>&1 && break; sleep 2; done
  docker compose exec -T db pg_restore -U tenka -d tenka --clean --if-exists --no-owner < "$TMP/copia/contexto.dump" \
    && echo "Contexto de los bots restaurado" || echo "AVISO: el contexto de los bots no se pudo restaurar (la web lo rehace sola)"
fi
docker compose up -d
echo "Restaurado. Los datos que había antes están en $ANTES (bórralos cuando veas que todo va bien)."
