import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { io } from 'socket.io-client';

const origin = 'https://mathrix.app';
const release = (await readFile('var/power-limits-release-path', 'utf8')).trim();
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
assert.equal((await readFile('/srv/mathrix/.next/BUILD_ID', 'utf8')).trim(), buildId);
for (const name of ['lib/engine.ts', 'lib/config.ts', 'app/play/page.tsx', 'app/style.css', 'GAME_RULES.md', 'server/index.ts']) {
  assert.deepEqual(await readFile(name), await readFile('/srv/mathrix/' + name));
}
const healthResponse = await fetch(origin + '/api/health');
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, 'ok');
assert.equal(health.database, 'ok');
assert.equal(health.redis, 'ok');
const playResponse = await fetch(origin + '/play');
assert.equal(playResponse.status, 200);
assert.ok((await playResponse.text()).includes(buildId), 'HTTPS must serve the new build');
const tutorial = await (await fetch(origin + '/how-to-play')).text();
assert.ok(tutorial.includes('Maximum Square') && tutorial.includes('Maximum Cube'));
assert.deepEqual(await readFile('scripts/schema.sql'), await readFile(release + '/backup/runtime/scripts/schema.sql'));
const proof = { url: origin, buildId, health, runtimeSourceVerified: true, publicBuildVerified: true, tutorialVerified: true, databaseSchemaUnchanged: true };
console.log('HTTPS health, public build, runtime source and tutorial passed.');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(origin + '/play?mode=practice');
  await expect(page.locator('.game')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.self [data-power="square"] b')).toHaveText('0');
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText('0');
  await page.getByRole('button', { name: 'Skip turn', exact: true }).click();
  await expect(page.locator('.self .destroyed-total b')).toHaveText('2');
  await expect(page.locator('.self [data-power="square"] b')).toHaveText('2');
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText('2');
  await page.screenshot({ path: release + '/live-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: release + '/live-desktop.png', fullPage: true });
  proof.browserPractice = 'mobile and desktop counters and discard credits passed';
  console.log('Live browser counters and discard credits passed.');
} finally {
  await browser.close();
}

const guestResponse = await fetch(origin + '/api/guest', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
});
assert.equal(guestResponse.status, 200);
const cookie = guestResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const socket = io(origin, { transports: ['websocket'], extraHeaders: { Origin: origin, Cookie: cookie }, autoConnect: false });
let game;
const errors = [];
socket.on('update', value => { game = value; });
socket.on('action_error', value => errors.push(value));
try {
  const connected = once(socket, 'connect', { signal: AbortSignal.timeout(20000) });
  socket.connect();
  await connected;
  const reserved = once(socket, 'reserved', { signal: AbortSignal.timeout(20000) });
  socket.emit('ai_start', { speed: 1, consent: false });
  const [first] = await reserved;
  game = first.game;
  assert.equal(game.mode, 'ai');
  for (const player of game.players) {
    assert.equal(player.maxSquare, 0);
    assert.equal(player.maxCube, 0);
  }
  await delay(Math.max(0, first.readyAt - Date.now()) + 200);
  socket.emit('ready', { matchId: game.id });
  await expect.poll(() => game.status === 'playing' && game.active === 0, { timeout: 20000 }).toBe(true);
  const before = structuredClone(game.players[0]);
  socket.emit('skip', { matchId: game.id, seq: game.seq });
  await expect.poll(() => game.players[0].destroyedTiles, { timeout: 7000 }).toBeGreaterThan(before.destroyedTiles);
  const after = game.players[0];
  const discarded = after.destroyedTiles - before.destroyedTiles;
  assert.equal(after.maxSquare - before.maxSquare, discarded);
  assert.equal(after.maxCube - before.maxCube, discarded);
  assert.deepEqual(errors, []);
  proof.realAiMatch = { id: game.id, mode: game.mode, discarded, maxSquare: after.maxSquare, maxCube: after.maxCube };
  console.log('Real unrated AI match and server discard credits passed.');
} finally {
  socket.disconnect();
}
await expect.poll(async () => {
  const response = await fetch(origin + '/api/matches/' + proof.realAiMatch.id, { headers: { Cookie: cookie } });
  return response.status === 200;
}, { timeout: 70000, intervals: [1000] }).toBe(true);
proof.realAiMatch.persistedAfterDisconnect = true;
proof.checkedAt = new Date().toISOString();
await writeFile(release + '/live-verification.json', JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
