#!/usr/bin/env bash
# Установка «Нудиста» на свой сервер (VPS) одной командой. Повторный запуск = обновление, данные и ключи сохраняются.
#
#   sudo bash deploy/install.sh nudist.example.ru     # свой домен (A-запись должна указывать на этот сервер)
#   sudo bash deploy/install.sh                       # без домена: адрес вида 203-0-113-7.sslip.io
#
# Что делает: ставит Node.js, Caddy (https с автоматическим сертификатом) и coturn (TURN для звонков),
# заводит службу с автоперезапуском, сторож зависаний и ежедневные копии базы.
# Рассчитан на Debian 12/13 и Ubuntu 22.04/24.04.
set -euo pipefail
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"

[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash $0 $*"; exit 1; }
command -v apt-get >/dev/null || { echo "Нужен Debian или Ubuntu (apt-get не найден)."; exit 1; }

SRC="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$SRC/server/index.js" ] || { echo "Не вижу server/index.js рядом со скриптом — запускайте из распакованной папки nudist."; exit 1; }
APP=/opt/nudist; DATA=/var/lib/nudist; ENVF=/etc/nudist.env; BACKUPS=/var/backups/nudist
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

say "Определяю адрес сервера"
IP="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 6 https://ifconfig.me 2>/dev/null || true)"
case "$IP" in *.*.*.*) ;; *) IP="$(hostname -I 2>/dev/null | awk '{print $1}')" ;; esac
[ -n "$IP" ] || { echo "Не удалось определить внешний IP."; exit 1; }
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ] && [ -f "$ENVF" ]; then DOMAIN="$(sed -n 's/^NUDIST_DOMAIN=//p' "$ENVF")"; fi
if [ -z "$DOMAIN" ]; then DOMAIN="${IP//./-}.sslip.io"; warn "Домен не указан, беру бесплатный адрес $DOMAIN (сертификат для него выдаётся не всегда; надёжнее свой домен)."; fi
DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed -e 's#^https\?://##' -e 's#/.*$##')"
printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z0-9-]{2,}$' || { echo "«$DOMAIN» не похоже на домен."; exit 1; }
echo "IP: $IP, адрес: https://$DOMAIN"
RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
[ "$RESOLVED" = "$IP" ] || warn "Домен $DOMAIN сейчас указывает на «${RESOLVED:-ничего}», а сервер — $IP. Пока A-запись не исправлена, https-сертификат не выдастся."

say "Ставлю пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync tar openssl coturn >/dev/null
node_ok() { command -v node >/dev/null && [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 18 ]; }
node_ok || apt-get install -y -qq nodejs >/dev/null || true
if ! node_ok; then
  echo "В репозитории системы Node.js старше 18 — ставлю Node.js 20 из NodeSource."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node_ok || { echo "Не удалось поставить Node.js 18+."; exit 1; }
if ! command -v caddy >/dev/null; then
  if ! apt-get install -y -qq caddy >/dev/null 2>&1; then
    echo "В репозитории системы нет Caddy — подключаю официальный репозиторий."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
fi
echo "node $(node -v), $(caddy version | awk '{print "caddy " $1}'), coturn $(turnserver --version 2>/dev/null | head -1)"

say "Копирую приложение в $APP"
id nudist >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin nudist
mkdir -p "$APP" "$DATA" "$BACKUPS"
rsync -a --delete --exclude data --exclude android --exclude node_modules --exclude .git "$SRC"/ "$APP"/
chown -R root:root "$APP"; chmod -R a+rX "$APP"
chown -R nudist:nudist "$DATA"; chmod 750 "$DATA"; chmod 700 "$BACKUPS"

say "Настройки ($ENVF)"
SECRET=""; [ -f "$ENVF" ] && SECRET="$(sed -n 's/^TURN_SECRET=//p' "$ENVF")"
[ -n "$SECRET" ] || SECRET="$(openssl rand -hex 24)"
EXTRA=""; [ -f "$ENVF" ] && EXTRA="$(sed -n '/^# --- свои настройки/,$p' "$ENVF" | tail -n +2)"
umask 077
cat > "$ENVF" <<ENV
# Настройки службы «Нудист». Этот блок install.sh перезаписывает при каждом запуске.
NUDIST_DOMAIN=$DOMAIN
HOST=127.0.0.1
PORT=3000
DATA_DIR=$DATA
TURN_HOST=$DOMAIN
TURN_SECRET=$SECRET
# --- свои настройки (ниже этой строки install.sh ничего не трогает), например MAX_UPLOAD_MB=200
$EXTRA
ENV
chown root:nudist "$ENVF"; chmod 640 "$ENVF"
umask 022

say "Служба с автоперезапуском"
cat > /etc/systemd/system/nudist.service <<UNIT
[Unit]
Description=Nudist messenger
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=nudist
Group=nudist
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=2
TimeoutStopSec=20
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT

# Сторож: служба может не упасть, а зависнуть. Два неответа подряд — перезапуск.
cat > /usr/local/bin/nudist-watchdog <<'W'
#!/bin/sh
F=/run/nudist-watchdog.fail
if curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then rm -f "$F"; exit 0; fi
if [ -f "$F" ]; then rm -f "$F"; logger -t nudist-watchdog "нет ответа два раза подряд, перезапускаю"; systemctl restart nudist; else : > "$F"; fi
W
# Копии: база и загруженные файлы, раз в сутки, хранится 14 штук.
cat > /usr/local/bin/nudist-backup <<B
#!/bin/sh
set -e
D=$BACKUPS
mkdir -p "\$D"
tar -C $DATA -czf "\$D/nudist-\$(date +%F-%H%M).tar.gz.part" --exclude='*.tmp' .
for f in "\$D"/*.part; do mv "\$f" "\${f%.part}"; done
ls -1t "\$D"/nudist-*.tar.gz | tail -n +15 | xargs -r rm -f
B
chmod 755 /usr/local/bin/nudist-watchdog /usr/local/bin/nudist-backup
cat > /etc/systemd/system/nudist-watchdog.service <<'U'
[Unit]
Description=Nudist health check
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nudist-watchdog
U
cat > /etc/systemd/system/nudist-watchdog.timer <<'U'
[Unit]
Description=Nudist health check every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
U
cat > /etc/systemd/system/nudist-backup.service <<'U'
[Unit]
Description=Nudist daily backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nudist-backup
U
cat > /etc/systemd/system/nudist-backup.timer <<'U'
[Unit]
Description=Nudist daily backup
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
[Install]
WantedBy=timers.target
U

say "https (Caddy)"
cat > /etc/caddy/Caddyfile <<CADDY
# Создано deploy/install.sh. Сертификат Caddy получает и продлевает сам.
$DOMAIN {
	reverse_proxy 127.0.0.1:3000
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "Caddyfile не прошёл проверку:"; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; exit 1; }

say "TURN для звонков (coturn)"
cat > /etc/turnserver.conf <<TURN
# Создано deploy/install.sh. Пароли клиентам выдаёт сервер «Нудиста» на 12 часов (use-auth-secret).
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$SECRET
realm=$DOMAIN
external-ip=$IP
min-port=49160
max-port=49400
total-quota=200
stale-nonce=600
no-cli
no-tls
no-dtls
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
syslog
TURN
chown root:turnserver /etc/turnserver.conf 2>/dev/null || true; chmod 640 /etc/turnserver.conf
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  say "Открываю порты в ufw"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 3478 >/dev/null; ufw allow 49160:49400/udp >/dev/null
fi

say "Запускаю"
systemctl daemon-reload
systemctl enable --now nudist-watchdog.timer nudist-backup.timer >/dev/null 2>&1
systemctl enable nudist caddy coturn >/dev/null 2>&1
systemctl restart nudist
systemctl restart coturn
systemctl reload caddy 2>/dev/null || systemctl restart caddy

OK=0; for _ in 1 2 3 4 5 6 7 8 9 10; do curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { OK=1; break; }; sleep 1; done
[ "$OK" = 1 ] && echo "Сервер отвечает." || { warn "Сервер не отвечает на 127.0.0.1:3000. Смотрите: journalctl -u nudist -n 50"; exit 1; }
HTTPS=0; for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1 && { HTTPS=1; break; }; sleep 5; done

printf '\n'
if [ "$HTTPS" = 1 ]; then say "Готово: https://$DOMAIN"; echo "Этот адрес — в браузер и в приложение на телефоне. Первый, кто зарегистрируется, станет главным админом (https://$DOMAIN/admin)."
else warn "Сервер работает, но https://$DOMAIN пока не открывается."; echo "Проверьте: A-запись домена указывает на $IP; порты 80 и 443 открыты у хостера; журнал: journalctl -u caddy -n 50"; fi
cat <<TXT

Порты, которые должны быть открыты у хостера: 80, 443 (сайт), 3478 tcp+udp и 49160-49400 udp (звонки).
Полезное:
  systemctl status nudist          состояние
  journalctl -u nudist -f          журнал
  sudo bash deploy/install.sh      обновить после замены файлов (домен запоминается)
  ls $BACKUPS            ежедневные копии; восстановление: systemctl stop nudist; tar -C $DATA -xzf <копия>; systemctl start nudist
TXT
