<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

When the user refers to an uploaded design by filename, check
`/var/lib/mathrix/design-files/<filename>/` in production, or
`STATE_DIR/design-files/<filename>/` (`./var/design-files` by default) in development.
The directory contains the original file and `metadata.json` with its description.
Uploads alone do not authorize implementation; follow the user's requested changes.

## Development status and database resets

Read `PRODUCTION` from the project-root `.env` before database changes. An explicit
`false` (case-insensitive) means Mathrix is still in development and has not
launched, including the hosted preview. This is separate from `NODE_ENV`, which
may be `production` for optimized builds and tests.

While `PRODUCTION=false`, the user authorizes agents to drop and rebuild the
Mathrix application database from the current schema and seed data when needed
for development, without asking again. Preserving existing development data or
writing incremental migrations is not required. This permission does not cover
uploaded design files, unrelated databases, or other agents' isolated test data.
Avoid resetting a shared database while another agent is using it.

Set `PRODUCTION=true` before launch. If the flag is true, missing, or invalid,
preserve data and use migrations; this standing reset permission does not apply.
Never change the flag to obtain reset permission. The flag itself does not
trigger a reset on startup or deployment.

## “Apply all changes” handoff

When the user tells any agent **“Apply all changes”**, including a newly opened
agent, treat it as authorization to integrate, test, and deploy all pending
Mathrix changes that are completed or in testing. Carry the work through to the
hosted site without asking for deployment permission again.

1. Use `/root/mathrix` as the development source and `/srv/mathrix` as the deployed
   runtime. Inspect current files, uncommitted and untracked work, branches,
   worktrees, and any available agent handoffs; do not rely on chat history or
   assume all changes are committed. Combine pending work without discarding
   other agents' changes.
2. Confirm the changes being released are stable before final validation. If
   agents are still editing them, wait for their handoff or ask the user to have
   them finish; do not deploy a moving checkout. Resolve integration bugs and
   conflicts while preserving the intended features.
3. Run `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`, and
   `pnpm test:system` on the combined code. The system runner covers isolated
   HTTP, WebSocket, and browser tests. Fix failures and rerun affected checks;
   earlier passes do not validate later edits. Do not deploy with failing or
   blocked required checks.
4. Read `DEPLOYMENT.md` and preserve a recoverable copy of the current runtime and
   configuration. Prepare the deployed database for the new schema using the
   `PRODUCTION` policy above: development data may be rebuilt when needed;
   otherwise back up the database and use migrations. Preserve uploaded designs
   and other agents' test data, and use the deployed environment's database
   settings rather than assuming the local `.env` targets the same database.
5. Deploy with `bash scripts/deploy.sh`, which updates `/srv/mathrix` and restarts
   the services. Verify service health, `https://mathrix.app/api/health`, and that
   the public site serves the new build and expected features. If deployment
   fails, recover the previous working runtime and compatible database state.
6. Report what is now deployed, the checks run, and any remaining blockers. A
   source edit or passing local test alone does not mean a change is on the site.

## Standing authorization for tests

The user authorizes all agents working on Mathrix on this machine to run unit,
integration, browser (Playwright/Chromium), and WebSocket tests without asking
again. This includes launching test subprocesses and browsers, starting temporary
local test servers, and listening and connecting on loopback test ports.

Use the existing isolated `pnpm test:system` runner for full system tests, with
separate test databases, Redis state, and ports. Clean up processes started for
the run; preserve production services and other agents' test runs.

This records user authorization; it does not change sandbox or host permissions.
If execution is denied, report the blocked operation and error, and distinguish
unrun tests from passing tests. Follow the environment's permission controls.
