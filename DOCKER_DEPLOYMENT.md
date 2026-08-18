# Docker Deployment Guide - Monitoring Telegram Bot v1.1.1

**Runtime:** Node.js 20 + TypeScript  
**Telegram incoming mode:** Long polling  
**Database:** External MySQL  
**Service port:** HTTP `3004`

## 1. Architecture

v1.1.1 tidak membutuhkan Telegram webhook publik.

```text
Monitoring Service container
        |
        | POST http://host.docker.internal:3004/webhooks/alerts
        v
Telegram Bot container :3004
        |
        +--> MySQL external
        |
        +--> outbound HTTPS -> api.telegram.org
                              ^
                              |
                         Telegram User
                     callback_query/message
```

Telegram Bot menarik `callback_query` dan `message` menggunakan `getUpdates` long polling.

Tidak diperlukan:

```text
public HTTPS endpoint
Nginx
Cloudflare Tunnel
setWebhook
POST /webhooks/telegram
```

## 2. Release version

Set deployment env:

```env
APP_VERSION=1.1.1
```

Docker image:

```text
monitoring-telegram-bot:1.1.1
```

Gunakan exact version tag saat deployment.

## 3. External MySQL prerequisite

Database harus sudah ada sebelum container dijalankan.

```sql
CREATE DATABASE monitoring_telegram_bot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'monitoring_telegram_bot'@'%'
  IDENTIFIED BY 'CHANGE_ME';

GRANT ALL PRIVILEGES
  ON monitoring_telegram_bot.*
  TO 'monitoring_telegram_bot'@'%';

FLUSH PRIVILEGES;
```

Migration membuat:

```text
webhook_deliveries
incident_states
telegram_action_sessions
```

Database upgrade dari versi lama dapat masih memiliki `postpone_sessions`; v1.1.1 tidak menggunakannya.

## 4. Container startup

Setiap container start menjalankan:

```text
node dist/src/database/migrate.js
```

kemudian:

```text
node dist/src/app.js
```

Application kemudian:

1. membuka HTTP service;
2. memanggil Telegram `deleteWebhook` tanpa membuang pending update;
3. memulai Telegram long polling;
4. memproses `callback_query` dan `message`.

Log normal:

```text
Monitoring Telegram Bot v1.1.1 listening on port 3004
Telegram long polling started
```

## 5. Windows local Docker

Prepare env:

```powershell
Copy-Item .env.docker.local.example .env.docker.local
notepad .env.docker.local
```

Important values:

```env
APP_VERSION=1.1.1
APP_HOST_PORT=3004
APP_PORT=3004

TELEGRAM_BOT_TOKEN=<real-token>
TELEGRAM_CHAT_ID=<supergroup-id>
TELEGRAM_TOPIC_NOMAD_ID=<nomad-topic-id>
TELEGRAM_TOPIC_CONSUL_ID=<consul-topic-id>
TELEGRAM_TOPIC_MINIO_ID=<minio-topic-id>

MONITORING_SERVICE_BASE_URL=http://host.docker.internal:3001
MONITORING_AUTH_USERNAME=<basic-auth-user>
MONITORING_AUTH_PASSWORD=<basic-auth-password>

MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=<mysql-user>
MYSQL_PASSWORD=<mysql-password>
MYSQL_DATABASE=monitoring_telegram_bot
MYSQL_CONNECTION_LIMIT=10
```

Deploy:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml up -d --build
```

Status:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml ps
```

Logs:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml logs -f telegram-bot-service
```

Health:

```powershell
curl http://localhost:3004/health
```

Expected:

```json
{
  "status": "ok",
  "database": "up",
  "telegramPolling": "up",
  "version": "1.1.1"
}
```

## 6. Linux development server

Prepare env:

```bash
cp .env.docker.dev.example .env.docker.dev
chmod 600 .env.docker.dev
nano .env.docker.dev
```

If Monitoring Service is exposed on the same host at port 3001:

```env
MONITORING_SERVICE_BASE_URL=http://host.docker.internal:3001
```

If MySQL is on the same Linux host:

```env
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
```

`compose.dev.yml` already contains:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Deploy:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml up -d --build
```

Status/logs:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml ps
docker compose --env-file .env.docker.dev -f compose.dev.yml logs -f telegram-bot-service
```

## 7. Monitoring Service integration

Monitoring Service still sends alerts to:

```text
POST /webhooks/alerts
```

For the existing Docker deployment:

```env
ALERT_WEBHOOK_URL=http://host.docker.internal:3004/webhooks/alerts
```

No change is required to the incident payload contract.

## 8. Telegram long polling requirements

The Telegram Bot container must be able to make outbound HTTPS connections to:

```text
api.telegram.org:443
```

Quick connectivity test from the host:

```bash
curl -I https://api.telegram.org
```

To test from inside the running container:

```bash
docker exec monitoring-telegram-bot node -e "fetch('https://api.telegram.org').then(r => console.log(r.status)).catch(e => { console.error(e); process.exit(1); })"
```

### One polling instance per bot token

Do not scale this service to multiple active replicas using the same `TELEGRAM_BOT_TOKEN`.

Correct:

```text
1 bot token -> 1 polling container
```

Incorrect:

```text
1 bot token -> 2+ polling containers
```

The Compose files therefore define one service instance and no replica scaling.

## 9. Migrating from v1.0.0 webhook mode

v1.1.1 calls `deleteWebhook` at startup. It does not intentionally drop pending Telegram updates.

If you specifically want a clean cut and want to discard stale queued Telegram updates, run this once before deploying v1.1.1:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"
```

Then deploy v1.1.1.

Verify webhook is empty if needed:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Expected relevant field:

```json
{
  "result": {
    "url": ""
  }
}
```

Do not call `setWebhook` while v1.1.1 is using long polling.

## 10. End-to-end test

### 10.1 Health

```bash
curl http://localhost:3004/health
```

Ensure:

```text
telegramPolling = up
```

### 10.2 Monitoring Service -> Telegram

Send an `INITIAL` alert to:

```text
http://localhost:3004/webhooks/alerts
```

or use the Monitoring Service dummy endpoint.

Expected:

```text
Monitoring Service
-> Bot /webhooks/alerts
-> MySQL dedup
-> Telegram sendMessage
-> source topic
```

### 10.3 ACK

Click `Acknowledge` in Telegram.

Expected flow:

```text
Telegram user
-> Bot getUpdates callback_query
-> Bot Force Reply: ACK note
-> user reply note (atau '-')
-> Bot getUpdates message
-> Monitoring Service /acknowledge
-> button ACK removed after success
-> confirmation message sent
```

No inbound request from Telegram to port 3004 is involved.

### 10.4 POSTPONE

Click `Postpone`. Bot first asks for absolute time:

```text
18-08-2026 15:30
```

After the time is valid, Bot asks for `remark`. Reply `-` if no remark is required.

Expected flow:

```text
Telegram user
-> getUpdates callback_query
-> Bot asks time
-> user replies time
-> Bot parses Asia/Jakarta
-> Bot asks remark
-> user replies remark (or '-')
-> Monitoring Service /postpone
-> confirmation message sent
```

## 11. MySQL networking note on Linux

If MySQL is installed on the same Linux host, MySQL must listen on an interface reachable from Docker. A MySQL listener bound only to host `127.0.0.1` cannot be reached through Docker bridge networking.

Check:

```bash
sudo ss -lntp | grep 3306
```

Restrict MySQL grants and firewall rules. Do not expose port 3306 publicly unless required.

## 12. Git deployment

Initial deployment:

```bash
cd /opt
git clone <repository-url> monitoring-telegram-bot
cd monitoring-telegram-bot
cp .env.docker.dev.example .env.docker.dev
chmod 600 .env.docker.dev
# edit .env.docker.dev
docker compose --env-file .env.docker.dev -f compose.dev.yml up -d --build
```

Subsequent deployment:

```bash
cd /opt/monitoring-telegram-bot
git fetch origin
git checkout develop
git pull --ff-only origin develop
docker compose --env-file .env.docker.dev -f compose.dev.yml up -d --build
```

`.env.docker.dev` remains untracked.
