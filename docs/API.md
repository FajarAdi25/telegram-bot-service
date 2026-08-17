# Telegram Bot Service API

## 1. Monitoring Service -> Bot

### POST `/webhooks/alerts`

Menerima `INCIDENT_ALERT` dengan kind:

```text
INITIAL
REMINDER
RESOLVED
```

Authentication inbound belum digunakan pada current Monitoring Service contract.

Success:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

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

## 2. Telegram -> Bot

### POST `/webhooks/telegram`

Endpoint yang diregister ke Telegram Bot API.

Update yang digunakan:

```text
callback_query
message
```

`callback_query` dipakai untuk ACK/POSTPONE button.

`message` dipakai untuk reply manual waktu POSTPONE.

## 3. Bot -> Monitoring Service

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
  }
}
```

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
  "postponeUntil": "2026-08-17T13:30:00+07:00"
}
```

Input Telegram untuk `postponeUntil`:

```text
DD-MM-YYYY HH:mm
```

Interpretasi timezone:

```text
Asia/Jakarta
```

Tidak ada CLOSE API di Bot Service contract v1.0.
