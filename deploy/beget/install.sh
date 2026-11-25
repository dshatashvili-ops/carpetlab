#!/usr/bin/env bash
# CarpetLAB: установка на чистый VPS Ubuntu 22.04/24.04 (Beget Cloud). Запускать от root из каталога проекта:
#   cd /opt/carpetlab && DOMAIN=carpet.example.ru EMAIL=you@example.ru bash deploy/beget/install.sh
# Повторный запуск безопасен: обновит код, миграции и перезапустит сервис.
# Переменные (необязательные): DOMAIN, EMAIL (для сертификата), SMTP_URL, MAIL_FROM, YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="/etc/carpetlab.env"
[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo -i)"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7 Пакеты: PostgreSQL, nginx, Node.js 22"
apt-get update -qq
apt-get install -y -qq postgresql postgresql-client nginx curl ca-certificates openssl ${DOMAIN:+certbot python3-certbot-nginx}
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
systemctl enable --now postgresql >/dev/null
for i in $(seq 1 60); do pg_isready -q -h /var/run/postgresql && break; sleep 1; done

echo "==> 2/7 Пароли и настройки ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PW="$(openssl rand -hex 16)"; APP_PW="$(openssl rand -hex 16)"
  if [ -n "${DOMAIN:-}" ]; then SITE_URL="https://$DOMAIN"; NODE_ENV_VALUE="production"
  else SITE_URL="http://$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo localhost)"; NODE_ENV_VALUE="development"; fi
  cat > "$ENV_FILE" <<ENV
NODE_ENV=$NODE_ENV_VALUE
PORT=3000
APP_URL=$SITE_URL
STORAGE_DIR=/var/lib/carpetlab/storage
DB_ADMIN_PASSWORD=$ADMIN_PW
DB_APP_PASSWORD=$APP_PW
DATABASE_URL=postgresql://carpet_app:$APP_PW@localhost:5432/carpetlab
DATABASE_ADMIN_URL=postgresql://carpet_admin:$ADMIN_PW@localhost:5432/carpetlab
SMTP_URL=${SMTP_URL:-}
MAIL_FROM=${MAIL_FROM:-CarpetLAB <no-reply@${DOMAIN:-localhost}>}
YOOKASSA_SHOP_ID=${YOOKASSA_SHOP_ID:-}
YOOKASSA_SECRET_KEY=${YOOKASSA_SECRET_KEY:-}
ENV
  chmod 600 "$ENV_FILE"
fi
set -a; . "$ENV_FILE"; set +a
mkdir -p "$STORAGE_DIR"

echo "==> 3/7 База данных и роли"
psql_pg() { printf '%s\n' "$1" | ( cd / && runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qAt ); }
psql_pg "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='carpet_admin') THEN CREATE ROLE carpet_admin LOGIN SUPERUSER PASSWORD '$DB_ADMIN_PASSWORD'; END IF; END \$\$;"
psql_pg "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='carpet_app') THEN CREATE ROLE carpet_app LOGIN NOBYPASSRLS PASSWORD '$DB_APP_PASSWORD'; END IF; END \$\$;"
[ "$(psql_pg "SELECT 1 FROM pg_database WHERE datname='carpetlab'")" = "1" ] || psql_pg "CREATE DATABASE carpetlab OWNER carpet_admin"

echo "==> 4/7 Зависимости, сборка, миграции"
cd "$APP_DIR/backend"
npm install --no-audit --no-fund >/dev/null
DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma generate >/dev/null
[ -f dist/main.js ] || npm run build
DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma migrate deploy
PGPASSWORD="$DB_ADMIN_PASSWORD" psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -q -f "$APP_DIR/deploy/grants.sql"
cd "$APP_DIR/frontend"
if [ ! -f dist/index.html ]; then npm install --no-audit --no-fund >/dev/null && npm run build; fi

echo "==> 5/7 Служба carpetlab-backend"
useradd --system --home "$APP_DIR" carpetlab 2>/dev/null || true
chown -R carpetlab:carpetlab /var/lib/carpetlab
cat > /etc/systemd/system/carpetlab-backend.service <<UNIT
[Unit]
Description=CarpetLAB backend
After=network.target postgresql.service

[Service]
User=carpetlab
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now carpetlab-backend >/dev/null
systemctl restart carpetlab-backend

echo "==> 6/7 Веб-сервер nginx"
cat > /etc/nginx/sites-available/carpetlab <<NGINX
server {
    listen 80;
    server_name ${DOMAIN:-_};
    client_max_body_size 8m;
    root $APP_DIR/frontend/dist;
    index index.html;
    location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location / { try_files \$uri /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/carpetlab /etc/nginx/sites-enabled/carpetlab
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
if [ -n "${DOMAIN:-}" ]; then
  CERT_ARGS=(--nginx -d "$DOMAIN" --agree-tos --redirect -n)
  if [ -n "${EMAIL:-}" ]; then CERT_ARGS+=(-m "$EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi
  certbot "${CERT_ARGS[@]}" || echo "!! Сертификат не выпущен: проверьте, что A-запись домена указывает на этот сервер, и повторите запуск."
fi

echo "==> 7/7 Ежедневная резервная копия (03:15)"
mkdir -p /var/backups/carpetlab
cat > /etc/cron.d/carpetlab-backup <<CRON
15 3 * * * root . $ENV_FILE; BACKUP_DIR=/var/backups/carpetlab DATABASE_ADMIN_URL="\$DATABASE_ADMIN_URL" bash $APP_DIR/deploy/backup.sh >> /var/log/carpetlab-backup.log 2>&1
CRON

sleep 2
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "Бэкенд отвечает." || { echo "!! Бэкенд не отвечает. Смотрите: journalctl -u carpetlab-backend -n 50"; exit 1; }
echo
echo "ГОТОВО. Откройте: ${APP_URL}"
echo "Пароли и настройки: $ENV_FILE (хранить в секрете). Логи: journalctl -u carpetlab-backend -f"
