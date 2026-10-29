# Mathrix prototype implementation plan

- [x] Inspect VM capabilities, network, ports and existing services; establish deployment path.
- [x] Create a TypeScript project with Next.js/React, an authoritative Socket.IO server,
      shared deterministic game engine, PostgreSQL persistence, Redis sessions/limits,
      and established authentication (email/password + Google + Discord).
- [x] Implement seeded matrices, weighted operations, shields, timed turns, cumulative row/column growth,
      matchmaking, reconnects, event logs and Elo; test the engine and server.
- [x] Build the arcade UI, guest/account flow, history, profiles, leaderboard, privacy
      preferences, useful admin balance/user/match tools and house-ad campaigns.
- [x] Add native systemd services, database migrations/seeds, Caddy automatic TLS, operational
      scripts and complete README/GAME_RULES/DEPLOYMENT documentation.
- [x] Format, lint, typecheck, run unit/integration/two-browser E2E tests; fix failures.
- [x] Build/start production services, verify health/database/Redis/game/ad/admin flows,
      inspect logs and record exact DNS records and verified deployment status.

## Architecture

One repository, one shared engine, one Next.js web service, one game/API service,
PostgreSQL, Redis and Caddy. Rules are snapshotted per match. A single game process
owns active matches; Redis stores queue/session metadata and rate limits. Completed
matches and their event logs are persisted transactionally. No external ads execute
until a reviewed provider adapter and appropriate consent integration are enabled.

## Deployment constraint

Network and host access are enabled. Per user instruction, do not use Docker.
Deploy native PostgreSQL, Redis, Caddy and Node services through systemd.
Do not claim public deployment or TLS without successful checks.
