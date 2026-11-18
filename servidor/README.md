# Tenka Ichi en el server casero

Todo lo necesario para sacar la web de Render y tenerla en un servidor en casa, con el dominio **gokudo.es**.
Vale para cualquier equipo con Debian 12/13 o Ubuntu Server: el PC viejo, un mini PC o el NAS Minisforum N5 Air.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.yml` | Arranca tres cosas: la **web** (`app`), el **HTTPS** (`caddy`, con certificado gratis de Let's Encrypt) y el **aviso de IP** (`ddns`, que actualiza gokudo.es si Orange te cambia la IP). |
| `Dockerfile` | Cómo se construye la web (Node 22). |
| `Caddyfile` | Manda `https://gokudo.es` a la web y `www.gokudo.es` a `gokudo.es`. |
| `env.ejemplo` | Plantilla de las variables (las mismas que hay en Render, más tres del server). |
| `ddns/config.json.ejemplo` | Plantilla del aviso de IP para DonDominio. |
| `instalar.sh` | Lo instala todo: Docker, cortafuegos, copias diarias y la web. Se puede repetir sin miedo. |
| `actualizar.sh` | Baja la última versión de GitHub y reinicia la web. |
| `scripts/copia-seguridad.sh` | Copia de la hoja de Google (todas las pestañas), `data/`, `.env` y el DDNS. Corre sola cada día a las 04:30 y guarda las últimas 30. |
| `scripts/restaurar.sh` | Vuelve a poner una copia. |

Dónde vive cada cosa en el server:

- `/opt/tenka`: el repo (lo baja `git clone`).
- `/opt/tenka/data`: los datos locales de la web.
- `/opt/tenka/servidor/.env`: las claves. **No se sube a GitHub.**
- `/opt/tenka-copias`: las copias de seguridad.

Los datos de verdad (gachapon, fantasy, registro…) siguen en la **hoja de Google**, igual que ahora con Render. No hay base de datos que mudar: la web nueva lee la misma hoja.

---

## Checklist

### A. Antes del día del cambio (con calma, puede ser semanas antes)

- [ ] **Dominio**: `gokudo.es` comprado en DonDominio, con la renovación automática activada.
- [ ] **CGNAT**: en el Livebox (`192.168.1.1`) mira la *IP WAN* y compárala con la de `cualesmiip.com`. Si coinciden, perfecto. Si la del router empieza por `100.64`–`100.127`, llama a Orange y pide que te quiten el CGNAT.
- [ ] **Aviso de IP (DonDNS)**: en el panel de DonDominio → *Dominios* → gokudo.es → **DNS dinámico / DonDNS** → actívalo y apunta el **usuario** y la **clave** que te da. Haz lo mismo para `www.gokudo.es`.
- [ ] **DNS**: en DonDominio → gokudo.es → *Zona DNS*, deja un registro **A** para `gokudo.es` y otro para `www` con tu IP de `cualesmiip.com`. El server los mantendrá al día solo.
- [ ] **Copia las variables de Render**: entra en dashboard.render.com → *tenka-ichi* → **Environment**. Copia **todas** (nombre y valor) a un archivo de texto en tu PC. Guárdalo bien, porque son contraseñas.
- [ ] **El equipo**: instalado con Debian, sin escritorio, con SSH, usuario `tenka` y la IP reservada en el Livebox. Sigue la [guía del PC viejo](https://claude.ai/artifact/FwZrFPciWtxdiwWZsKHjc6), que vale igual para el NAS. En el N5 Air, instala el sistema en el SSD NVMe y deja los discos de las bahías para datos y copias.

### B. Instalar (se puede hacer antes del día: Render sigue funcionando a la vez)

Desde tu PC, abre PowerShell y entra al server:

```
ssh tenka@192.168.1.50
```

(Cambia `192.168.1.50` por la IP que reservaste.) Ya dentro del server:

```
sudo apt install -y git
sudo git clone https://github.com/Pacopepe4/tenka-ichi /opt/tenka
sudo bash /opt/tenka/servidor/instalar.sh
```

La primera vez se para y te dice que rellenes dos archivos:

1. `nano /opt/tenka/servidor/.env`: pega los valores que copiaste de Render y pon tu correo en `CORREO_CERTIFICADO`. **GOOGLE_CREDENTIALS** va en una sola línea y entre comillas simples: `GOOGLE_CREDENTIALS='{"type":"service_account",…}'`. Para guardar: `Ctrl+O`, `Enter`, `Ctrl+X`.
2. `nano /opt/tenka/servidor/ddns/config.json`: pon el usuario y la clave de DonDNS (las dos veces).

Y vuelve a lanzar:

```
sudo bash /opt/tenka/servidor/instalar.sh
```

Al final debe decir **«¡Funciona!»** con la dirección de casa. Sal (`exit`) y vuelve a entrar por SSH para poder usar `docker` sin `sudo`.

- [ ] En tu PC, abre `http://192.168.1.50:3000/salud`: debe responder.
- [ ] Abre `http://192.168.1.50:8000`: el aviso de IP debe salir en verde para gokudo.es y www.

### C. El día del cambio (cuenta con medio día; lo de fuera puede fallar un rato)

1. [ ] **Fusiona el PR** «Server casero» en GitHub y, en el server, ejecuta `bash /opt/tenka/servidor/actualizar.sh`. Así los textos y los enlaces pasan a decir gokudo.es.
2. [ ] **Abre los puertos en el Livebox**: entra en `192.168.1.1` → *Configuración avanzada* → **NAT/PAT** (o *Redirección de puertos*). Crea dos reglas hacia la IP del server: **TCP 80 → 80** y **TCP 443 → 443**. No abras ni el 3000 ni el 8000.
3. [ ] Espera un par de minutos y abre **https://gokudo.es/salud** desde el **móvil con datos** (no con el wifi de casa). Debe responder con el candado. Si no, mira: `cd /opt/tenka/servidor && docker compose logs --tail 50 caddy`.
4. [ ] **Discord** (discord.com/developers → tu app):
   - *OAuth2 → Redirects*: añade `https://gokudo.es/auth/discord/callback`.
   - *General Information → Interactions Endpoint URL*: `https://gokudo.es/discord/interacciones` → Guardar (Discord la prueba en ese momento: si da error, la web no está accesible desde fuera).
5. [ ] **Twitch** (dev.twitch.tv → tu app → OAuth Redirect URLs): añade `https://gokudo.es/auth/twitch/callback`.
6. [ ] **Kick** (kick.com/settings/developer → tu app):
   - Redirect URL: `https://gokudo.es/auth/kick/callback`.
   - Webhook URL: `https://gokudo.es/webhooks/kick`.
7. [ ] **OBS**: en cada fuente de navegador, cambia `tenka-ichi.onrender.com` por `gokudo.es`. Si OBS está en la misma casa que el server, también vale `http://192.168.1.50:3000`, que no depende de internet.
8. [ ] **Puente** (en el PC donde se mira la partida): baja la carpeta `puente` actualizada de GitHub, o edita la línea 9 de `puente-tenka-ichi.ps1` para que diga `https://gokudo.es`.
9. [ ] **Realizador** (PC 1 y PC 2): en el `opciones.json` instalado, cambia `tenka-ichi.onrender.com` por `gokudo.es` en `puente.url` y en `tenkaIchi.url`. O vuelve a pasar los instaladores.
10. [ ] **Prueba todo**: entra al gachapon con Discord, vincula Twitch o Kick, abre el panel, haz un `/reclutar` de prueba y abre el overlay en OBS.
11. [ ] **Apaga Render**: en dashboard.render.com → tenka-ichi → *Settings* → **Suspend Service**. No lo borres hasta pasada una semana sin problemas. Si tenías UptimeRobot o cron-job.org despertando la web, bórralo.
12. [ ] Si usas los **códigos de torneo de Riot**, comprueba que el aviso de resultados llega a `https://gokudo.es/api/torneo/riot`. Si el proveedor de Riot se registró con la dirección de Render, habrá que registrarlo de nuevo.

### D. Después

- [ ] Al día siguiente, comprueba que hay una copia en `/opt/tenka-copias` (`ls -lh /opt/tenka-copias`) y que el registro no tiene avisos: `tail /opt/tenka-copias/registro.log`.
- [ ] **Copia en otro disco** (recomendado en el NAS): monta un disco de las bahías, por ejemplo en `/mnt/datos`, y añade `COPIA_EXTRA=/mnt/datos/copias-tenka` delante del comando en `/etc/cron.d/tenka-copias`.
- [ ] Cada vez que se suba algo nuevo a GitHub: `bash /opt/tenka/servidor/actualizar.sh`. Render lo hacía solo; aquí es un comando.

## Comandos útiles

```
cd /opt/tenka/servidor
docker compose ps                    # qué está en marcha
docker compose logs -f app           # lo que dice la web (Ctrl+C para salir)
docker compose restart app           # reiniciar la web
bash actualizar.sh                   # actualizar a lo último de GitHub
bash scripts/copia-seguridad.sh      # hacer una copia ahora
bash scripts/restaurar.sh /opt/tenka-copias/tenka-AAAA-MM-DD_HHMM.tar.gz
```

Si se va la luz, todo vuelve a arrancar solo cuando el equipo se enciende (en la BIOS, activa *Restore on AC power loss → Power On*).
