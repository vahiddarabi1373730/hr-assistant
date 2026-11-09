# Organizational event management

Status: resolved

Implement `.scratch/organizational-events/spec.md` with isolated data and public
token boundaries, accessible Persian UI, and migration/verification instructions.

## Answer

Implemented event draft/publish/complete/cancel, planned budget and capacity,
organiser/Admin management, guest entry and revocable personal RSVP, actual
attendance, attributed post-event feedback, assigned preparation checklist and
idempotent 24h/1h organiser in-app reminders. Independent tables with forced RLS,
tenant FKs and restricted grants; additive migration0012. Persian RTL lazy-loaded
list/detail/editor/public invitation routes, matching existing blue/Vazirmatn UI.

API tests use isolated PostgreSQL/pgvector on localhost56434, never the app database.
Final full backend suite: **307 passed in 145.14s** with workspace-local pytest
temporary directory (the default user Temp path was denied by the sandbox).
Synthetic browser workflow passed create/publish, guests, checklist, invitation and
RSVP at desktop/mobile sizes, no page errors or horizontal overflow. Frontend build,
25 utility tests and lint passed (existing unrelated warnings). Screenshots and
smoke scripts in this directory; usage and operational limits in
`docs/organizational-events.md`. Authenticated live GET `/api/events` returned200.
Automatic external emails and Google calendar integrations are explicitly follow-ups.

## Comments

During verification the user reported admin/users and admin/system-mailbox failures.
The configured local DB lacked migration0014 tables. Applied the existing additive
migration and fixed forbidden org row locks in user administration by reusing the
transaction advisory lock and locking only User rows in the joined query. Both live
GET endpoints returned200 with an isolated existing smoke account. Original supplied
cookie returned401 including on /api/me; fresh login is required for that session.
