# Docker Deployment Guide - Telegram Bot Service

**Service:** Monitoring Telegram Bot  
**Runtime:** Node.js 20 + TypeScript build  
**Database:** External MySQL  
**Timezone contract:** Asia/Jakarta for POSTPONE input

## 1. Current port and service mapping

The deployment follows the same external-MySQL pattern as Monitoring Service.

```text
Windows local
+------------------------ Windows Host ------------------------+
| MySQL :3306                                                |
| Monitoring Service host URL :3001                          |
|                                                             |
| Docker Desktop                                              |
|   telegram-bot-service :3004                               |
|      |                                                      |
|      +--> Monitoring Service via host.docker.internal:3001 |
|      +--> MySQL via host.docker.internal:3306              |
+-------------------------------------------------------------+
```

Monitoring Service can continue using:

```env
ALERT_WEBHOOK_URL=http://host.docker.internal:3004/webhooks/alerts
```

Telegram Bot Service calls Monitoring Service using:

```env
MONITORING_SERVICE_BASE_URL=http://host.docker.internal:3001
```

## 2. Database prerequisite

The MySQL database must already exist. The container startup migration creates the required tables, but it does not create the database itself.

Example:

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

For local development, using an existing MySQL account is also possible. Restrict the account host and privileges for non-local environments.

The migration creates these tables:

```text
webhook_deliveries
incident_states
postpone_sessions
```

## 3. Container startup behavior

The image uses a multi-stage Node.js build. On every container start it executes:

```text
node dist/src/database/migrate.js
```

and only after a successful migration starts:

```text
node dist/src/app.js
```

If the database is unavailable or migration fails, the application does not start. Docker's restart policy retries the container.

## 4. Local Windows deployment

Requirements:

- Docker Desktop
- Monitoring Service reachable from Windows at `http://localhost:3001`
- Existing MySQL on Windows, normally `127.0.0.1:3306`
- Telegram bot/token and Telegram chat/topic IDs already configured
- Database `monitoring_telegram_bot` already created

Prepare the environment file:

```powershell
Copy-Item .env.docker.local.example .env.docker.local
notepad .env.docker.local
```

Important local values:

```env
APP_HOST_PORT=3004
APP_PORT=3004

MONITORING_SERVICE_BASE_URL=http://host.docker.internal:3001

MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_DATABASE=monitoring_telegram_bot
```

Also fill in:

```env
TELEGRAM_BOT_TOKEN=<real-token>
TELEGRAM_CHAT_ID=<real-supergroup-id>
TELEGRAM_TOPIC_NOMAD_ID=<nomad-topic-id>
TELEGRAM_TOPIC_CONSUL_ID=<consul-topic-id>
TELEGRAM_TOPIC_MINIO_ID=<minio-topic-id>

MONITORING_AUTH_USERNAME=<matching-monitoring-service-basic-auth-user>
MONITORING_AUTH_PASSWORD=<matching-monitoring-service-basic-auth-password>

MYSQL_USER=<mysql-user>
MYSQL_PASSWORD=<mysql-password>
```

Do not commit `.env.docker.local`.

Build and start:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml up -d --build
```

Check container:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml ps
```

Follow logs:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml logs -f telegram-bot-service
```

Health check from Windows:

```powershell
curl http://localhost:3004/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "up"
}
```

Stop:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml down
```

`down` removes only the Telegram Bot container/network. It does not remove the external MySQL database.

## 5. Monitoring Service integration

For the current Monitoring Service Docker deployment, keep/set:

```env
ALERT_WEBHOOK_URL=http://host.docker.internal:3004/webhooks/alerts
```

Then rebuild/restart Monitoring Service if its environment changed.

The request path is:

```text
Monitoring Service container
        |
        | POST
        v
host.docker.internal:3004/webhooks/alerts
        |
        v
Telegram Bot container
```

## 6. Telegram webhook requirement

Sending messages from the bot container to Telegram only requires outbound Internet access.

Receiving button callbacks and POSTPONE replies requires Telegram to reach:

```text
POST /webhooks/telegram
```

`http://localhost:3004` is not reachable from Telegram's servers. Expose the bot through an HTTPS public endpoint.

For local development, an HTTPS tunnel can forward to:

```text
http://localhost:3004
```

For a Linux development server, prefer a stable HTTPS hostname/reverse proxy, for example:

```text
https://telegram-bot-dev.example.com/webhooks/telegram
```

Register that complete URL as the Telegram webhook and allow both update types:

```json
{
  "allowed_updates": ["callback_query", "message"]
}
```

`message` is required because POSTPONE uses a user reply containing `DD-MM-YYYY HH:mm`.

## 7. End-to-end local check

After both containers are running:

### 7.1 Health

```powershell
curl http://localhost:3004/health
```

### 7.2 Alert delivery directly to the bot

```powershell
curl --location 'http://localhost:3004/webhooks/alerts' `
  --header 'Content-Type: application/json' `
  --data '{
    "event": "INCIDENT_ALERT",
    "kind": "INITIAL",
    "incident": {
      "id": "INC-DOCKER-TEST-001",
      "status": "OPEN",
      "source": "NOMAD",
      "type": "DRIVER_UNHEALTHY",
      "severity": "WARNING",
      "resource": {
        "type": "DRIVER",
        "key": "sample-node-id:docker",
        "name": "nomadworker-east-4/docker"
      },
      "message": "Docker driver unhealthy",
      "openedAt": "2026-08-17T08:00:00.000Z",
      "resolvedAt": null,
      "reminderCount": 0
    }
  }'
```

Expected result:

```text
Telegram Bot container
-> MySQL dedup record
-> Telegram API
-> NOMAD topic
```

### 7.3 Monitoring Service to Telegram Bot

Use the Monitoring Service dummy webhook endpoint. The Monitoring Service should forward the payload using `ALERT_WEBHOOK_URL` to the bot container.

### 7.4 ACK / POSTPONE

For these actions, Telegram's public webhook must already be configured because the action starts from Telegram.

ACK flow:

```text
Telegram callback
-> public HTTPS endpoint
-> Telegram Bot :3004
-> http://host.docker.internal:3001/api/v1/incidents/:id/acknowledge
```

POSTPONE flow:

```text
Telegram callback
-> bot asks DD-MM-YYYY HH:mm
-> user replies
-> Telegram webhook message update
-> Telegram Bot
-> Monitoring Service /postpone
```

## 8. Linux development server

Prepare the untracked environment file:

```bash
cp .env.docker.dev.example .env.docker.dev
chmod 600 .env.docker.dev
```

If Monitoring Service is exposed on the same Linux host at port 3001:

```env
MONITORING_SERVICE_BASE_URL=http://host.docker.internal:3001
```

If MySQL is installed on the same Linux server:

```env
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
```

`compose.dev.yml` contains:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Deploy:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml up -d --build
```

Status:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml ps
```

Logs:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml logs -f telegram-bot-service
```

Stop:

```bash
docker compose --env-file .env.docker.dev -f compose.dev.yml down
```

## 9. Linux MySQL networking

A Docker bridge container cannot connect to a MySQL server that only listens on `127.0.0.1` of the Linux host.

If MySQL runs on the same Linux machine, configure MySQL to listen on an interface reachable from Docker, then restrict access using MySQL grants and firewall rules.

Check the listener:

```bash
sudo ss -lntp | grep 3306
```

Do not expose MySQL port 3306 publicly unless explicitly required.

## 10. Git deployment on Linux

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

The external MySQL database is not recreated by deployment.

## 11. Production notes

For production:

- Do not commit bot token, Basic Auth credentials, or MySQL passwords.
- Use a stable HTTPS endpoint for `/webhooks/telegram`.
- Keep port `3004` private if a reverse proxy is in front of the application.
- Restrict MySQL network access and user privileges.
- Use a dedicated MySQL user for Telegram Bot Service.
- Back up the database because deduplication, ACK state, and pending POSTPONE sessions are persistent state.
- Rotate the Telegram bot token immediately if it is exposed.
