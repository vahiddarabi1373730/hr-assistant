# Organisational events

The `/events` workspace is independent of Candidate, Resume and Application data.
The first slice extends the later-phase sketch in `.scratch/hr-ai-assistant/spec.md`
§14. Implemented scope and decisions: `.scratch/organizational-events/spec.md`.

## Using it

1. Open **رویدادهای سازمانی** in the sidebar and create a draft with title,
   description, start/end, location, optional capacity and planned budget in toman.
   The date input uses the browser calendar/local timezone; its Jalali equivalent
   is shown underneath. API timestamps are timezone-aware ISO, stored as timestamptz.
2. Add guests by name/email and preparation tasks with an optional active org member
   as assignee and a due date. Only the organiser or an Admin manages the event;
   assigned members can toggle their own tasks. All org members may view events.
3. Publish to enable responses and organiser reminders. **لینک دعوت تازه** creates
   an individual `/event-rsvp/{token}` link. Share the invitation text or open it
   in your email application. Creating another link invalidates the old one.
   The application never sends an external invitation or email automatically.
4. Guests accept/decline without login, until the start. Accepted responses count
   against capacity; a repeat acceptance is idempotent and decline releases a seat.
   Record actual attendance after start. Complete the event after end, or cancel
   it; terminal events cannot be edited. Cancellation preserves data and disables
   responses/feedback. Preparation tasks remain visible but read-only.
5. Accepted guests can submit/edit a 1–5 rating and comment after end. Feedback is
   identified, not anonymous; the public page explains this. Links expire 30 days
   after end. The event detail displays the average and individual feedback.

## Persistence and isolation

Migration `0012_organizational_events` creates `org_events`, `event_guests` and
`event_tasks`, with forced RLS, tenant composite FKs, indexed parent/assignee keys,
checked statuses/ranges and column-level UPDATE grants. Events cannot be deleted
by the app role; cancelled history is retained. Guest emails are casefolded and
unique per event. Limits are 500 guests, 100 checklist tasks and 200 events per
list request (UI requests 100). Planned budget is an integer in toman, not an
expense ledger or payment flow.

Internal mutation endpoints check organiser/Admin authority and lock the parent
event. Schedule/status edits require the current revision; stale edits return409.
The same parent lock serialises guest acceptance, removal, cancellation and
capacity changes, so concurrent acceptance cannot overbook. Tenant/request GUCs
remain transaction-local. Activity records contain entity identifiers, not tokens
or feedback contents.

Public endpoints pin the token's org and find its SHA-256 secret digest under RLS;
43-character random secrets are returned only when created, never stored raw.
Token rotation is rechecked after locking the parent. Public responses expose
only this guest's name/response/feedback and public event details, never the guest
list, email addresses, budget, task list or organiser identity. Public JSON uses
no-store; the RSVP page disables referrer sharing/indexing. Deployments should
also redact `/event-rsvp/` token paths from access logs, as with booking links.

## Reminders

The lifespan-managed worker runs once per minute and creates organiser-only in-app
notifications at 24h and 1h before published events. Dedupe keys include event/start
and reminder window; restarting workers or repeated scans never resets read state.
Inactive organisers receive no new notifications. It sets both tenant and trusted
recipient context, preserving recipient-private notification RLS. Rescheduling
creates a new reminder schedule; cancellation stops future reminders. A sleeping
host cannot deliver reminders; the next scan catches up only before event start.

Google free/busy/Meet, calendar export, automatic guest reminder emails, expense
tracking and recurring events are follow-up work, not part of this implementation.

## Verification

`backend/tests/test_events.py` covers real API/restricted PostgreSQL storage,
date/budget validation, revisions, lifecycle, assigned-member authority, guest
deduplication, revocable links, public privacy, concurrent capacity, attendance,
feedback, expiry, RLS/column grants/tenant FKs and reminder deduplication.

The synthetic Playwright workflow at
`.scratch/organizational-events/browser_smoke.py` exercises create/publish, guest
entry, checklist completion, invitation and RSVP in desktop/mobile layouts with
mocked HTTP responses. It asserts no page errors or mobile horizontal overflow.
It does not prove real email or Google integration. Screenshots are stored beside
the script. Run API tests against a disposable PostgreSQL/pgvector `hr_test` only;
they recreate that database. Use the project's normal Alembic upgrade workflow
to apply the additive migration to an explicitly selected application database.
