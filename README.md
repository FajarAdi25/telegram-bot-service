# Monitoring Telegram Bot Service

## Release

Current stable service version: **v1.1.0**.

Docker image:

```text
monitoring-telegram-bot:1.1.0
```

Version history is maintained in `CHANGELOG.md`. Versioning rules are documented in `docs/VERSIONING.md`.

Telegram Bot Service menerima incident notification dari Monitoring Service, mengirimkannya ke Telegram Topic, dan menerima aksi user Telegram menggunakan **long polling**.

Baseline contract: **Telegram Bot Service Integration API v1.0**.

## v1.1.0 transport architecture

Telegram incoming update tidak lagi memakai public webhook.

```text
Monitoring Service
      |
      | HTTP POST /webhooks/alerts
      v
Telegram Bot Service :3004
      |
      | outbound HTTPS long polling (getUpdates)
      v
Telegram Bot API
      ^
      |
      | callback_query / message
      |
Telegram User
```

Implikasi:

- `POST /webhooks/alerts` tetap digunakan oleh Monitoring Service;
- `POST /webhooks/telegram` dihapus;
- Bot menjalankan Telegram `getUpdates` long polling;
- Bot memproses `callback_query` untuk ACK/POSTPONE;
- Bot memproses `message` untuk reply manual POSTPONE;
- public domain, HTTPS ingress, Nginx, dan Telegram `setWebhook` tidak diperlukan;
- container harus memiliki outbound HTTPS access ke `api.telegram.org`;
- satu bot token hanya boleh dipakai oleh satu polling instance aktif.

Saat startup Bot menjalankan `deleteWebhook` tanpa `drop_pending_updates`, lalu memulai long polling.

## Scope

Service ini menangani:

- menerima webhook `INCIDENT_ALERT` dari Monitoring Service;
- menerima `INITIAL`, `REMINDER`, dan `RESOLVED`;
- route alert berdasarkan `incident.source` ke Telegram Topic;
- membuat message baru untuk setiap event;
- action `ACK` dan `POSTPONE` dari Telegram;
- menerima Telegram action melalui long polling;
- mengirim identity user Telegram ke Monitoring Service;
- Basic Auth untuk request Telegram Bot Service -> Monitoring Service;
- persistent webhook deduplication menggunakan MySQL;
- persistent ACK state untuk menentukan button pada notification berikutnya;
- persistent pending POSTPONE prompt;
- input POSTPONE absolut dengan format `DD-MM-YYYY HH:mm` pada timezone `Asia/Jakarta`.

Service ini tidak melakukan recovery/resolve incident. Monitoring Service tetap menjadi source of truth.

## Runtime

- Node.js >= 20
- TypeScript
- MySQL
- Telegram Bot API long polling

## Project Structure

```text
src/
├── app.ts
├── clients/
│   └── monitoring-service.client.ts
├── config/
│   └── config.ts
├── database/
│   ├── connection.ts
│   ├── migrate.ts
│   └── migrations/
├── modules/
│   ├── alert/
│   ├── postpone/
│   └── telegram/
│       ├── telegram-polling.service.ts
│       ├── telegram-callback.service.ts
│       ├── telegram.client.ts
│       └── ...
├── repositories/
│   ├── incident-state.repository.ts
│   ├── postpone-session.repository.ts
│   └── webhook-delivery.repository.ts
└── shared/
```

## Environment

Copy `.env.example` menjadi `.env`.

```env
APP_VERSION=1.1.0
PORT=3001

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_TOPIC_NOMAD_ID=
TELEGRAM_TOPIC_CONSUL_ID=
TELEGRAM_TOPIC_MINIO_ID=

MONITORING_SERVICE_BASE_URL=http://localhost:3000
MONITORING_AUTH_USERNAME=
MONITORING_AUTH_PASSWORD=

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=monitoring_telegram_bot
MYSQL_CONNECTION_LIMIT=10
```

Jangan commit `.env` ke Git.

## Database Setup

Buat database terlebih dahulu:

```sql
CREATE DATABASE monitoring_telegram_bot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Install dependency dan jalankan migration:

```bash
npm install
npm run db:migrate
```

Migration membuat tiga table:

```text
webhook_deliveries
incident_states
postpone_sessions
```

### webhook_deliveries

Menyimpan persistent deduplication webhook dari Monitoring Service.

Dedup key:

```text
incident.id + kind + reminderCount
```

Jika Telegram delivery berhasil, status menjadi `SENT`. Jika delivery gagal, status menjadi `FAILED` sehingga retry Monitoring Service dapat memproses key yang sama kembali.

### incident_states

Menyimpan ACK state lokal setelah Monitoring Service mengonfirmasi ACK berhasil.

```text
INITIAL / REMINDER sebelum ACK
[ Acknowledge ] [ Postpone ]

setelah ACK berhasil
[ Postpone ]
```

ACK tidak menghentikan reminder.

### postpone_sessions

Menyimpan pending prompt POSTPONE. Session dipetakan ke Telegram user, chat, topic, dan prompt message sehingga reply user dapat dikaitkan kembali ke incident.

## Running Locally

```bash
npm install
npm run db:migrate
npm run dev
```

Saat startup, log normal mencakup:

```text
Monitoring Telegram Bot v1.1.0 listening on port 3001
Telegram long polling started
```

Health check:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "status": "ok",
  "database": "up",
  "telegramPolling": "up",
  "version": "1.1.0"
}
```

## Monitoring Service -> Telegram Bot

Endpoint Bot tetap:

```http
POST /webhooks/alerts
Content-Type: application/json
```

Example payload:

```json
{
  "event": "INCIDENT_ALERT",
  "kind": "INITIAL",
  "incident": {
    "id": "INC-TEST-001",
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
    "openedAt": "2026-08-17T02:00:00.000Z",
    "resolvedAt": null,
    "reminderCount": 0
  }
}
```

Response normal:

```json
{
  "success": true,
  "duplicate": false
}
```

## Telegram Topic Routing

```text
NOMAD  -> TELEGRAM_TOPIC_NOMAD_ID
CONSUL -> TELEGRAM_TOPIC_CONSUL_ID
MINIO  -> TELEGRAM_TOPIC_MINIO_ID
```

Current Monitoring Service MVP mengirim `NOMAD`. Routing `CONSUL` dan `MINIO` tetap tersedia.

## Notification Behavior

```text
INITIAL  -> new Telegram message
REMINDER -> new Telegram message
RESOLVED -> new Telegram message
```

Button:

```text
OPEN, belum ACK
[ Acknowledge ] [ Postpone ]

OPEN, sudah ACK
[ Postpone ]

RESOLVED
no action button
```

Setelah ACK berhasil, button ACK pada message tersebut dihapus. Notification berikutnya untuk incident yang sama juga tidak menampilkan ACK karena state tersimpan di MySQL.

## Telegram Long Polling

Incoming Telegram update diambil oleh Bot menggunakan Telegram Bot API `getUpdates`.

Update type yang diproses:

```text
callback_query -> ACK / POSTPONE button
message        -> manual POSTPONE reply
```

Polling menggunakan server-side timeout 25 detik dan retry setelah error transport.

Saat shutdown container, active polling request dibatalkan terlebih dahulu sebelum database pool ditutup.

### Migration from webhook mode

v1.1.0 otomatis memanggil `deleteWebhook` saat polling start. Pending update tidak sengaja dibuang.

Untuk deployment yang ingin membuang update lama secara eksplisit, lakukan sekali sebelum start:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"
```

Jangan menjalankan `setWebhook` untuk v1.1.0.

### Single instance requirement

Jalankan **satu replica** polling untuk satu `TELEGRAM_BOT_TOKEN`. Jangan menjalankan dua container aktif dengan token yang sama.

## ACK Flow

```text
User klik Acknowledge
        |
        v
Telegram API
        |
        | getUpdates / callback_query
        v
Telegram Bot
        |
        | Basic Auth + body.user
        v
POST /api/v1/incidents/:incidentId/acknowledge
        |
        v
Monitoring Service
```

Identity user berasal dari `callback_query.from`.

## POSTPONE Flow

```text
User klik Postpone
        |
        v
long polling menerima callback_query
        |
        v
Bot mengirim Force Reply prompt
        |
        v
User reply: 17-08-2026 13:30
        |
        v
long polling menerima message
        |
        v
Bot parse sebagai Asia/Jakarta
        |
        v
2026-08-17T13:30:00+07:00
        |
        v
POST /api/v1/incidents/:incidentId/postpone
```

Format input wajib:

```text
DD-MM-YYYY HH:mm
```

Timezone selalu `Asia/Jakarta (UTC+07:00)`.

## Monitoring Service Authentication

ACK dan POSTPONE memakai HTTP Basic Auth melalui:

```env
MONITORING_AUTH_USERNAME=
MONITORING_AUTH_PASSWORD=
```

Credentials tidak boleh di-hardcode.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

## Production Notes

- outbound HTTPS ke `api.telegram.org` wajib tersedia;
- public inbound HTTPS tidak diperlukan untuk Telegram karena v1.1.0 memakai polling;
- jalankan hanya satu polling instance untuk satu bot token;
- simpan Bot Token dan Basic Auth credentials sebagai secret;
- jalankan migration sebelum application start;
- `/health` memeriksa MySQL dan status polling;
- Monitoring Service webhook dedup tetap menggunakan `incident.id + kind + reminderCount`.

## Docker Deployment

Files:

- `Dockerfile`
- `compose.local.yml`
- `compose.dev.yml`
- `.env.docker.local.example`
- `.env.docker.dev.example`
- `DOCKER_DEPLOYMENT.md`

Lihat `DOCKER_DEPLOYMENT.md` untuk deployment lengkap.
