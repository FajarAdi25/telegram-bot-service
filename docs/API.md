# Telegram Bot Service Integration Surface - v1.3.0

## 1. Monitoring Service -> Telegram Bot Service

### POST `/webhooks/alerts`

Menerima event:

```text
INCIDENT_ALERT
SSL_EXPIRING_ALERT
```

Kind yang didukung:

```text
INITIAL
REMINDER
RESOLVED
```

`SSL_EXPIRING_ALERT` menggunakan `incident.source = SSL` dan membawa `incident.contextJson` berisi metadata sertifikat SSL.

Authentication inbound belum digunakan pada current Monitoring Service contract.

Success:

```json
{
  "success": true,
  "duplicate": false
}
```

Persistent dedup key:

```text
incident.id + kind + reminderCount
```

## 2. Telegram -> Telegram Bot Service

v1.3.0 **tidak menyediakan HTTP endpoint Telegram webhook**.

Incoming Telegram update diterima melalui long polling Telegram Bot API `getUpdates`.

Update yang diproses:

```text
callback_query -> ACK / POSTPONE button
message        -> ACK note / POSTPONE time / POSTPONE remark
```

`POST /webhooks/telegram` dari v1.0.0 sudah dihapus.

## 3. Telegram Bot Service -> Monitoring Service

### ACK

```http
POST /api/v1/incidents/:incidentId/acknowledge
Authorization: Basic <credentials>
Content-Type: application/json
```

```json
{
  "user": {
    "id": "123456789",
    "name": "Budi Santoso",
    "username": "budi_ops"
  },
  "note": "Sedang dicek oleh infra team"
}
```

`note` optional. Telegram Bot meminta note menggunakan Force Reply. User dapat membalas `-` untuk mengirim ACK tanpa note. Setelah ACK sukses, bot mengirim confirmation message dan menghapus tombol ACK pada notification tersebut.

### POSTPONE

```http
POST /api/v1/incidents/:incidentId/postpone
Authorization: Basic <credentials>
Content-Type: application/json
```

```json
{
  "user": {
    "id": "123456789",
    "name": "Budi Santoso",
    "username": "budi_ops"
  },
  "postponeUntil": "2026-08-17T13:30:00+07:00",
  "remark": "Menunggu maintenance selesai"
}
```

`remark` optional. Setelah waktu valid diterima, Bot meminta remark menggunakan Force Reply. User dapat membalas `-` untuk POSTPONE tanpa remark. Setelah POSTPONE sukses, bot mengirim confirmation message. Tombol Postpone tetap tersedia selama incident OPEN.

Input Telegram:

```text
DD-MM-YYYY HH:mm
```

Timezone: `Asia/Jakarta`.

Tidak ada CLOSE API di contract saat ini.
