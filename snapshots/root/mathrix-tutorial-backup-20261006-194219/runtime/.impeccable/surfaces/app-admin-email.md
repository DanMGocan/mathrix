---
version: 1
slug: "app-admin-email"
primary_target: "app/admin/email.tsx"
related_targets: ["app/admin/page.tsx"]
---

# Administration: community emails

Mode: Operate. Extend the existing admin dashboard for the requested weekly
reminder and manual community emails. Inherit DESIGN.md and existing form styles.

## Direction contract

THESIS: Make the audience, schedule and delivery outcome clear before sending.
OWN-WORLD: White ground, dark ink, blue actions, Poppins and native form controls.
STORY: Check sender readiness and eligible audience; save the weekly schedule or
review and send a manual message; inspect campaign progress.
FIRST VIEWPORT: Configuration status and audience precede weekly scheduling,
manual composition and campaign history. Forms stack naturally on narrow screens.
INTERACTION: Save weekly changes explicitly. Confirm the recipient count before
manual sending. Keep unsaved drafts while refreshing delivery progress.
FORM: Code-led addition within the existing Emails admin tab, using existing
panels, fields, actions and tables. No new visual identity or raster assets.
FINISH: Verify desktop and mobile together, run the detector once and correct
concrete issues in one batch.

## Quality bar

Accessible labels, visible keyboard focus, clear loading and error messages,
disabled sending while credentials are incomplete, explicit UTC times, no
recipient addresses or SMTP secrets in campaign history. Use the same shared
admin authorization and layout. Successful queueing and successful SMTP
acceptance have distinct statuses.

## Implemented behavior

- Show “Email sending is ready.” above the audience when configuration is valid.
  Otherwise name the missing setup using readable labels and disable manual
  sending. Weekly settings can still be saved; explain that delivery waits for
  setup and offer Refresh emails after configuration changes.
- State the eligible registered audience and its count before either form.
  Exclude guests, suspended players and unsubscribed addresses. Every outgoing
  email includes Play Mathrix and unsubscribe links.
- Keep the weekly enable toggle, send day, UTC hour, subject and plain-text
  message together. Display the saved next reminder time in UTC or the paused
  state. Draft changes take effect only after Save weekly reminder succeeds;
  acknowledge that save explicitly.
- Confirm the trimmed manual subject and current recipient count with the
  native confirmation before queueing. Disable sending for an empty audience
  and explain it. Clear the manual draft only after successful queueing, then
  direct the administrator to delivery history.
- Preserve unsaved weekly and manual text during refreshes while the Emails
  tab remains open. Report loading, saving, queueing and recoverable errors in
  text; prevent overlapping save/send actions.
- History shows subject, weekly/manual kind, created and finished UTC times,
  campaign status, sent/total counts, failed counts and any delivery error.
  Queueing feedback is distinct from completion. Show an empty state when no
  campaigns exist; active campaigns refresh every five seconds while visible.
- On phones, forms and schedule fields stack. Keep all history columns in the
  existing horizontal table scroller without widening the page.

## Persistence boundary

This is an extension of the existing admin system. Preserve DESIGN.md,
.impeccable/design.json and the shared stylesheet; surface-specific operational
behavior belongs in this brief. No new design tokens or raster assets were added.
