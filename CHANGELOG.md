# Changelog

All notable changes to Monitoring Telegram Bot Service are documented here.

Versioning follows Semantic Versioning: `MAJOR.MINOR.PATCH`.

## [1.4.2] - 2026-08-31

### Changed
- Standardize AI Quick Chat response presentation for every supported monitoring result: incident, server summary, node, allocation, driver, blocked evaluation, and SSL.
- Improve Telegram rendering for labels, sections, bullets, numbered lists, stray Markdown markers, and unexpected Markdown table rows.
- Keep monitoring answers compact and readable without exposing raw tool JSON.

### Added
- Show a `Loading...` reply immediately while AI Quick Chat is processing a question.
- Replace the same loading message with the final Quick Chat result or error response when processing completes.


## [1.4.1] - 2026-08-31

### Fixed
- Improve AI Quick Chat Telegram message formatting so Gemini Markdown markers are rendered cleanly instead of appearing as raw `#`, `**`, backticks, and separators.
- Convert supported Quick Chat formatting to Telegram HTML for bold labels, inline code, bullets, numbered lists, and compact spacing.
- Tighten Gemini response-format instructions to avoid Markdown headings, horizontal rules, tables, nested bullets, and raw HTML.

## [1.4.0] - 2026-08-31

### Added
- Add read-only AI Quick Chat for direct Telegram text messages using Gemini `gemini-3.7-flash`.
- Add Gemini read-only function routing for incidents, server infrastructure summary, Nomad nodes, allocations, drivers, blocked evaluations, and SSL certificates.
- Add Monitoring Service GET integrations required by AI Quick Chat.
- Preserve existing ACK and POSTPONE reply flows by handling pending action sessions before Quick Chat.
- Add `GEMINI_API_KEY` and optional `GEMINI_MODEL` deployment configuration.

### Read-only scope
- Quick Chat does not expose ACK, POSTPONE, manual Nomad pull, or other write actions to Gemini.
- Monitoring Service remains the source of truth for live monitoring data.

## [1.3.0] - 2026-08-27

### Changed
- Separate Telegram message formatting for SSL certificate alerts from the existing incident alert format.
- SSL alerts now show certificate-specific fields from `incident.contextJson` while preserving the existing ACK and POSTPONE sections.
- Existing NOMAD, CONSUL, and MINIO incident message format remains unchanged.

## [1.2.0] - 2026-08-27

Backward-compatible support for SSL certificate expiry alerts from Monitoring Service.

### Added

- Accept `SSL_EXPIRING_ALERT` webhook events.
- Accept `SSL` as an incident source.
- Parse SSL `incident.contextJson` certificate metadata from Monitoring Service.
- Route `SSL` incidents to `TELEGRAM_TOPIC_SSL_ID`.
- Keep `TELEGRAM_TOPIC_SSL_ID` optional at startup so deployments without SSL routing continue to start. SSL delivery fails until the topic ID is configured.

### Unchanged

- Existing `INCIDENT_ALERT` handling for NOMAD, CONSUL, and MINIO.
- `INITIAL`, `REMINDER`, and `RESOLVED` notification behavior.
- ACK and POSTPONE interaction flow.
- Persistent webhook deduplication key: `incident.id + kind + reminderCount`.

## [1.1.1] - 2026-08-18

Patch release for Telegram ACK/POSTPONE interaction UX.

### Fixed

- ACK no longer calls Monitoring Service immediately when the button is clicked. The bot now asks the Telegram user for an ACK note using Force Reply.
- POSTPONE now asks for both absolute postpone time and remark before calling Monitoring Service.
- ACK request forwards optional `note` to Monitoring Service.
- POSTPONE request forwards optional `remark` to Monitoring Service.
- ACK success now sends a persistent confirmation message in the Telegram topic.
- POSTPONE success now sends a persistent confirmation message in the Telegram topic.
- ACK button is removed only after Monitoring Service confirms ACK success.
- POSTPONE button remains available on OPEN incident notifications.
- Telegram action input sessions are persisted in MySQL so multi-step input survives process restarts.

### Input convention

Reply with `-` when ACK note or POSTPONE remark should be omitted.

## [1.1.0] - 2026-08-18

Telegram incoming transport changed from webhook to long polling.

### Changed

- Replaced Telegram `POST /webhooks/telegram` ingress with Telegram Bot API long polling (`getUpdates`).
- ACK and POSTPONE callbacks are consumed from `callback_query` polling updates.
- Manual POSTPONE input is consumed from `message` polling updates.
- Application removes any configured Telegram webhook at polling startup without dropping pending updates.
- Added graceful polling shutdown before MySQL pool shutdown.
- Health endpoint now exposes `telegramPolling` state.
- Docker deployment no longer requires public HTTPS, domain, reverse proxy, or Telegram `setWebhook`.

### Unchanged

- Monitoring Service still sends incidents to `POST /webhooks/alerts`.
- MySQL persistent webhook deduplication remains enabled.
- ACK state and POSTPONE sessions remain persistent.
- Monitoring Service ACK/POSTPONE Basic Auth contract is unchanged.
- Topic routing and incident notification behavior are unchanged.

### Deployment note

Run one active polling instance per Telegram bot token. The container requires outbound HTTPS access to `api.telegram.org`.

## [1.0.0] - 2026-08-18

Initial stable deployment baseline.

### Added

- Node.js + TypeScript Telegram Bot Service.
- `POST /webhooks/alerts` for Monitoring Service incident notifications.
- `POST /webhooks/telegram` for Telegram callback and message updates.
- Topic routing for NOMAD, CONSUL, and MINIO.
- `INITIAL`, `REMINDER`, and `RESOLVED` notification handling.
- ACK and POSTPONE actions.
- Manual POSTPONE input using `DD-MM-YYYY HH:mm` in `Asia/Jakarta`.
- Monitoring Service Basic Auth integration.
- MySQL persistent webhook deduplication.
- Persistent ACK state and POSTPONE session state.
- Docker deployment for local Windows and Linux development server.
- External MySQL support.
- Automatic database migration before application startup.
- HTTP service on port `3004` for the current deployment baseline.

### Notes

- Direct HTTPS listener inside the application is not part of v1.0.0. The HTTPS experiment was reverted before this stable baseline.
