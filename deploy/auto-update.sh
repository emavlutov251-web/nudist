#!/usr/bin/env bash
# Автообновление сервера с GitHub. Ставит таймер: раз в две минуты смотрит ветку (по умолчанию release) и, если она сдвинулась,
# забирает код, проверяет синтаксис и перезапускает службу. Ветку release двигает GitHub Actions только после успешных проверок,
# так что на сервер попадает только то, что прошло тесты. Ключи и доступы для этого не нужны (репозиторий открытый).
#
#   sudo bash deploy/auto-update.sh https://github.com/ИМЯ/nudist.git [ветка]
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash $0 $*"; exit 1; }
REPO="${1:?Укажите адрес репозитория}"; BRANCH="${2:-release}"
command -v git >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git >/dev/null; }
cat > /usr/local/bin/nudist-update <<U
#!/bin/sh
set -e
SRC=/opt/nudist-src; APP=/opt/nudist
[ -d "\$SRC/.git" ] || git clone -q --depth 1 -b "$BRANCH" "$REPO" "\$SRC"
cd "\$SRC"
git fetch -q --depth 1 origin "$BRANCH"
NEW=\$(git rev-parse FETCH_HEAD); OLD=\$(cat "\$APP/.rev" 2>/dev/null || true)
[ "\$NEW" = "\$OLD" ] && exit 0
git reset -q --hard FETCH_HEAD
for f in server/*.js; do node --check "\$f"; done
rsync -a --delete --exclude data --exclude android --exclude node_modules --exclude .git --exclude .rev ./ "\$APP"/
echo "\$NEW" > "\$APP/.rev"; chown -R root:root "\$APP"; chmod -R a+rX "\$APP"
systemctl restart nudist
logger -t nudist-update "обновлено до \$NEW"
U
chmod 755 /usr/local/bin/nudist-update
cat > /etc/systemd/system/nudist-update.service <<'U'
[Unit]
Description=Nudist update from GitHub
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nudist-update
U
cat > /etc/systemd/system/nudist-update.timer <<'U'
[Unit]
Description=Nudist update check every two minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
U
systemctl daemon-reload
systemctl enable --now nudist-update.timer >/dev/null
echo "Автообновление включено: ветка $BRANCH, проверка раз в две минуты. Журнал: journalctl -t nudist-update"
