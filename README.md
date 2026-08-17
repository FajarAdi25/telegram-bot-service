# Monitoring Telegram Bot Service

Telegram Bot Service untuk menerima incident notification dari Monitoring Service dan meneruskannya ke Telegram Topic.

Baseline contract: **Telegram Bot Service Integration API v1.0**.

## Scope

Service ini menangani:

- menerima webhook `INCIDENT_ALERT` dari Monitoring Service;
- menerima `INITIAL`, `REMINDER`, dan `RESOLVED`;
- route alert berdasarkan `incident.source` ke Telegram Topic;
- membuat message baru untuk setiap event;
- action `ACK` dan `POSTPONE` dari Telegram;
- mengirim identity user Telegram ke Monitoring Service;
- Basic Auth untuk request Telegram Bot Service -> Monitoring Service;
- persistent webhook deduplication menggunakan MySQL;
- persistent ACK state untuk menentukan button pada notification berikutnya;
- persistent pending POSTPONE prompt;
- input POSTPONE absolut dengan format `DD-MM-YYYY HH:mm` pada timezone `Asia/Jakarta`.

Service ini **tidak** melakukan recovery/resolve incident. Monitoring Service tetap menjadi source of truth.

## Runtime

- Node.js >= 20
- TypeScript
- MySQL
- Telegram Bot API

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
├── repositories/
│   ├── incident-state.repository.ts
│   ├── postpone-session.repository.ts
│   └── webhook-delivery.repository.ts
└── shared/
```

## Environment

Copy `.env.example` menjadi `.env`.

```env
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

Install dependency:

```bash
npm install
```

Jalankan migration:

```bash
npm run db:migrate
```

Migration membuat tiga table:

```text
webhook_deliveries
incident_states
postpone_sessions
```

### webhook_deliveries

Menyimpan persistent deduplication webhook.

Dedup key:

```text
incident.id + kind + reminderCount
```

Jika Telegram delivery berhasil, status menjadi `SENT`.

Jika Telegram delivery gagal, status menjadi `FAILED` dan endpoint webhook mengembalikan error. Retry dari Monitoring Service dapat menggunakan dedup key yang sama dan diproses kembali.

### incident_states

Menyimpan ACK state lokal Bot setelah Monitoring Service mengonfirmasi ACK berhasil.

Tujuannya:

```text
INITIAL / REMINDER sebelum ACK
[ Acknowledge ] [ Postpone ]

setelah ACK berhasil
[ Postpone ]
```

ACK tidak menghentikan reminder.

### postpone_sessions

Menyimpan pending prompt POSTPONE. Session dihubungkan ke Telegram user, chat, topic, dan prompt message sehingga reply yang benar dapat dipetakan kembali ke incident.

## Running Locally

```bash
npm install
npm run db:migrate
npm run dev
```

Health check:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "status": "ok",
  "database": "up"
}
```

## Monitoring Service -> Telegram Bot

Endpoint Bot:

```http
POST /webhooks/alerts
Content-Type: application/json
```

Monitoring Service local config:

```env
ALERT_WEBHOOK_URL=http://localhost:3001/webhooks/alerts
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

Duplicate yang sudah/sedang diproses:

```json
{
  "success": true,
  "duplicate": true
}
```

## Telegram Topic Routing

```text
NOMAD  -> TELEGRAM_TOPIC_NOMAD_ID
CONSUL -> TELEGRAM_TOPIC_CONSUL_ID
MINIO  -> TELEGRAM_TOPIC_MINIO_ID
```

Current Monitoring Service MVP mengirim `NOMAD`. Routing `CONSUL` dan `MINIO` tetap tersedia untuk source berikutnya.

## Notification Behavior

Setiap event menghasilkan message baru:

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

Setelah ACK dari sebuah message berhasil, button ACK pada message tersebut dihapus menggunakan Telegram `editMessageReplyMarkup`. Notification berikutnya untuk incident yang sama juga tidak menampilkan ACK karena state tersimpan di MySQL.

## ACK Flow

```text
Telegram user
    |
    | Acknowledge
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

Request body yang dibuat Bot:

```json
{
  "user": {
    "id": "5405675168",
    "name": "Fajar Adipras",
    "username": "fajaradipras"
  }
}
```

`username` hanya dikirim jika tersedia.

Tidak ada whitelist user di Bot Service pada implementasi ini. Semua user yang dapat menggunakan action Bot akan diteruskan sebagai identity ke Monitoring Service.

## POSTPONE Flow

```text
User klik Postpone
        |
        v
Bot mengirim Force Reply prompt
        |
        v
User reply: 17-08-2026 13:30
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

Timezone selalu:

```text
Asia/Jakarta (UTC+07:00)
```

Bot menolak:

- format yang tidak sesuai;
- tanggal kalender yang tidak valid;
- waktu yang tidak lebih besar dari waktu sekarang.

Request body:

```json
{
  "user": {
    "id": "5405675168",
    "name": "Fajar Adipras",
    "username": "fajaradipras"
  },
  "postponeUntil": "2026-08-17T13:30:00+07:00"
}
```

`remark` tidak dikirim karena belum ada UX input remark pada scope saat ini.

## Telegram Webhook

Untuk menerima button callback dan manual POSTPONE reply, Telegram harus mengirim dua update type:

```json
[
  "callback_query",
  "message"
]
```

Contoh registration:

```bash
curl --request POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://YOUR_PUBLIC_HOST/webhooks/telegram",
    "allowed_updates": ["callback_query", "message"],
    "drop_pending_updates": true
  }'
```

Untuk local end-to-end callback testing, expose port `3001` melalui HTTPS public tunnel terlebih dahulu.

## Monitoring Service Authentication

ACK dan POSTPONE memakai HTTP Basic Auth.

Bot membentuk header:

```http
Authorization: Basic base64(username:password)
```

Credentials hanya dibaca dari environment:

```env
MONITORING_AUTH_USERNAME=
MONITORING_AUTH_PASSWORD=
```

Jangan hardcode credentials ke source atau repository.

## Error Handling

Monitoring Service error code yang ditangani untuk Telegram UX:

```text
INVALID_POSTPONE_UNTIL
UNAUTHORIZED_SERVICE
INCIDENT_NOT_FOUND
INCIDENT_NOT_OPEN
```

ACK dan POSTPONE memakai identity dari `callback_query.from` atau `message.from`.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

## Production Notes

- gunakan HTTPS untuk Telegram webhook;
- gunakan HTTPS untuk Monitoring Service jika melewati network yang tidak dipercaya;
- simpan Bot Token dan Basic Auth credentials sebagai secret;
- jalankan `npm run db:migrate` sebelum start versi baru;
- endpoint `/health` juga memeriksa koneksi MySQL;
- current dedup contract belum memiliki `notificationId`, sehingga key mengikuti `incident.id + kind + reminderCount`.

## Docker deployment

Docker deployment files are included for Windows local and Linux development environments:

- `Dockerfile`
- `compose.local.yml`
- `compose.dev.yml`
- `.env.docker.local.example`
- `.env.docker.dev.example`
- `DOCKER_DEPLOYMENT.md`

See `DOCKER_DEPLOYMENT.md` for the complete deployment procedure.
