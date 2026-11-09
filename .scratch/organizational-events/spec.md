# Organizational events — first usable slice

Requested by the user on 2026-11-08, extending the later-phase sketch in
`.scratch/hr-ai-assistant/spec.md` §14. Independent of Candidates/Applications.

- Authenticated org members create and edit events with title, description,
  fixed start/end, location, capacity and budget in toman. Draft → published →
  completed/cancelled; only organiser or Admin may change an event.
- Guest names/emails, private revocable RSVP links, accept/decline, transactional
  capacity enforcement, attendance and post-event rating/comment.
- Organiser checklist with responsible org member, due date and completion.
- In-app organiser reminders before a published event; no automatic external
  email, infrastructure deployment or calendar provider calls. Invitation links
  are shared explicitly by the organiser. Google free/busy/Meet and automatic
  guest email delivery are follow-up integrations, not claimed in this slice.
- Persian RTL list/detail/editor and public RSVP page, Jalali display, responsive
  layout reusing current blue palette/Vazirmatn and existing shadcn primitives.
- Actual PostgreSQL migration, tenant composite FKs, forced RLS, restricted grants,
  API/database coverage, static frontend checks and local browser smoke if available.

No unrelated dirty-worktree edits are to be discarded. No real emails/paid AI calls.
