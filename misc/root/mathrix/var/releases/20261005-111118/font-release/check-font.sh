#!/usr/bin/env bash
set -euo pipefail
cd /root/mathrix
release_dir=$(cat /tmp/mathrix-release-path)/font-release
test_env="$PWD/.env.test-43590"
test_dir="$PWD/var/test-43590"
exec 9>"$test_dir/run.lock"
flock 9
pids=()
cleanup() {
  if [ "${#pids[@]}" -gt 0 ]; then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
node --env-file="$test_env" --import tsx server/index.ts > "$release_dir/font-check-game.log" 2>&1 & pids+=("$!")
PORT=43592 HOSTNAME=127.0.0.1 node --env-file="$test_env" .next/standalone/server.js > "$release_dir/font-check-web.log" 2>&1 & pids+=("$!")
caddy run --config "$test_dir/Caddyfile" --adapter caddyfile > "$release_dir/font-check-proxy.log" 2>&1 & pids+=("$!")
for attempt in {1..30}; do
  if curl -fsS http://localhost:43590/api/health >/dev/null 2>&1 && curl -fsS http://localhost:43590/ >/dev/null 2>&1; then break; fi
  sleep 1
done
SMOKE_ORIGIN=http://localhost:43590 node "$release_dir/live-smoke.mjs"
