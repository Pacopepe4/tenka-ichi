#!/usr/bin/env bash
# Instala Tenka Ichi en el server casero (Debian 12/13 o Ubuntu Server).
# Uso, en el server:
#   sudo apt install -y git
#   sudo git clone https://github.com/Pacopepe4/tenka-ichi /opt/tenka
#   sudo bash /opt/tenka/servidor/instalar.sh
# Se puede repetir sin miedo: lo que ya está hecho, lo salta.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
AQUI="$RAIZ/servidor"
USUARIO="${SUDO_USER:-tenka}"
COPIAS="/opt/tenka-copias"

paso() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
ojo()  { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecútalo con sudo: sudo bash $0"; exit 1; }

paso "Paquetes básicos"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates ufw cron unattended-upgrades >/dev/null
ok "git, curl, ufw, cron y actualizaciones de seguridad automáticas"

paso "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
usermod -aG docker "$USUARIO" || true
ok "$(docker --version)"

paso "Cortafuegos"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ok "abiertos SSH, 80 y 443 (el 3000 y el 8000 solo los ve tu red: el router no los abre)"

paso "Carpetas de datos y copias"
mkdir -p "$RAIZ/data" "$COPIAS"
chown -R "$USUARIO":"$USUARIO" "$COPIAS"
chown -R "$USUARIO":"$USUARIO" "$RAIZ"
chown -R 1000:1000 "$RAIZ/data"
ok "$RAIZ/data (datos de la web) y $COPIAS (copias de seguridad)"

paso "Configuración"
FALTA=0
if [ ! -f "$AQUI/.env" ]; then
  cp "$AQUI/env.ejemplo" "$AQUI/.env"
  chmod 600 "$AQUI/.env"; chown "$USUARIO":"$USUARIO" "$AQUI/.env"
  ojo "He creado $AQUI/.env: rellénalo con  nano $AQUI/.env"
  FALTA=1
elif grep -qE '^(PANEL_CLAVE|SESION_SECRETO|GOOGLE_SHEET_ID)=$' "$AQUI/.env"; then
  ojo "Al .env le faltan PANEL_CLAVE, SESION_SECRETO o GOOGLE_SHEET_ID"
  FALTA=1
else
  ok ".env listo"
fi
if [ ! -f "$AQUI/ddns/config.json" ]; then
  cp "$AQUI/ddns/config.json.ejemplo" "$AQUI/ddns/config.json"
  chmod 600 "$AQUI/ddns/config.json"
  ojo "He creado $AQUI/ddns/config.json: pon tu usuario y clave de DonDNS"
  FALTA=1
fi
chown -R 1000:1000 "$AQUI/ddns"

paso "Copia de seguridad diaria (04:30)"
cat > /etc/cron.d/tenka-copias <<CRON
30 4 * * * $USUARIO bash $AQUI/scripts/copia-seguridad.sh >> $COPIAS/registro.log 2>&1
CRON
ok "/etc/cron.d/tenka-copias"

if [ "$FALTA" -eq 1 ]; then
  printf '\n\033[1;33mFalta rellenar la configuración. Cuando esté, vuelve a ejecutar:\033[0m\n  sudo bash %s\n' "$0"
  exit 0
fi

paso "Arrancar Tenka Ichi"
cd "$AQUI"
docker compose up -d --build
ok "en marcha. Espero a que responda…"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/salud >/dev/null 2>&1; then
    IP="$(hostname -I | awk '{print $1}')"
    ok "¡Funciona! En casa: http://$IP:3000   Fuera: https://$(grep -E '^DOMINIO=' .env | cut -d= -f2)"
    exit 0
  fi
  sleep 2
done
ojo "No responde todavía. Mira qué pasa con:  cd $AQUI && docker compose logs --tail 50 app"
exit 1
