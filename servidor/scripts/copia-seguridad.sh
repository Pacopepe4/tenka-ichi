#!/usr/bin/env bash
# Copia de seguridad de Tenka Ichi: la hoja de Google (todas las pestañas, en JSON), la carpeta data/,
# el .env, la configuración del DDNS y el contexto de los bots (pg_dump de «db»). Guarda las últimas 30 en /opt/tenka-copias.
# Si defines COPIA_EXTRA (por ejemplo, un disco del NAS montado en /mnt/datos), deja ahí otra copia.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
DESTINO="${COPIAS:-/opt/tenka-copias}"
EXTRA="${COPIA_EXTRA:-}"
GUARDAR="${GUARDAR:-30}"
FECHA="$(date +%Y-%m-%d_%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DESTINO" "$TMP/copia"
cd "$AQUI"

if docker compose exec -T app node --input-type=module - < "$AQUI/scripts/copia-hoja.mjs" > "$TMP/copia/hoja.json" 2> "$TMP/error-hoja.txt"; then
  echo "$FECHA hoja de Google: $(wc -c < "$TMP/copia/hoja.json") bytes"
else
  echo "$FECHA AVISO: no se pudo copiar la hoja de Google: $(tail -1 "$TMP/error-hoja.txt")"
  rm -f "$TMP/copia/hoja.json"
fi

# El contexto de los bots (Postgres con pgvector, contenedor «db»). Se puede rehacer solo, pero así no hay que esperar
# a que se vuelvan a calcular los embeddings
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  if docker compose exec -T db pg_dump -U tenka -d tenka -Fc > "$TMP/copia/contexto.dump" 2> "$TMP/error-db.txt"; then
    echo "$FECHA contexto de los bots: $(wc -c < "$TMP/copia/contexto.dump") bytes"
  else
    echo "$FECHA AVISO: no se pudo copiar el contexto de los bots: $(tail -1 "$TMP/error-db.txt")"
    rm -f "$TMP/copia/contexto.dump"
  fi
fi

cp -a "$RAIZ/data" "$TMP/copia/data"
cp "$AQUI/.env" "$TMP/copia/env"
[ -f "$AQUI/ddns/config.json" ] && cp "$AQUI/ddns/config.json" "$TMP/copia/ddns-config.json"
git -C "$RAIZ" log -1 --format='%H %ci %s' > "$TMP/copia/version.txt"

ARCHIVO="$DESTINO/tenka-$FECHA.tar.gz"
tar -czf "$ARCHIVO" -C "$TMP" copia
chmod 600 "$ARCHIVO"
echo "$FECHA copia: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

if [ -n "$EXTRA" ]; then
  if [ -d "$EXTRA" ]; then cp "$ARCHIVO" "$EXTRA/" && echo "$FECHA también en $EXTRA";
  else echo "$FECHA AVISO: $EXTRA no existe (¿disco sin montar?)"; fi
fi

ls -1t "$DESTINO"/tenka-*.tar.gz | tail -n +$((GUARDAR + 1)) | xargs -r rm -f
