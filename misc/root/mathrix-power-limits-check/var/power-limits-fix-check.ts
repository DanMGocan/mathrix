import { readFileSync } from 'node:fs';
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  createGame,
  registry,
  startGame,
  publicGame,
  finishGame,
  useOperation,
  skipTurn,
  removeRow,
  type Target,
  type OperationId,
} from "../lib/engine";
import { defaultBalance } from "../lib/config";

// Deterministic server snapshots exercise large boards without playing through random growth.
async function keyboardGame(page: Page) {
  const me = {
    id: "keyboard-player",
    name: "Keyboard player",
    registered: true,
    role: "USER",
  };
  const game = createGame(
    "keyboard",
    42,
    [{ ...me, id: "opponent", name: "Opponent" }, me],
    defaultBalance,
  );
  startGame(game, Date.now());
  game.active = 1;
  game.turnEndsAt = game.endAt = Date.now() + 600000;
  for (const p of game.players) {
    p.matrix = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => r * 5 + c + 1),
    );
    p.rowShields = [false, false, false, false, false];
    p.columnShields = [false, false, false, false, false];
  }
  const operations: OperationId[] = [
    "add_row_value",
    "add_column_value",
    "multiply_row",
    "multiply_column",
    "remove_row",
    "row_shield",
    "negate_column",
    "sub_row_value",
  ];
  const cards = operations.map((operation, i) => ({
    id: `key-${i}`,
    operation,
    value: operation.startsWith("multiply") ? 2 : 1,
  }));
  game.cards = structuredClone(cards);
  const actions: Target[] = [];
  const skips: { matchId: string; seq: number }[] = [];
  const disconnectedAt: (number | null)[] = [null, null];
  let socket: WebSocketRoute;
  const publish = () => {
    game.turnEndsAt = Date.now() + 600000;
    socket.send(
      `42${JSON.stringify(["update", publicGame(game, disconnectedAt)])}`,
    );
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: defaultBalance }),
  );
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    socket = ws;
    ws.send(
      `0${JSON.stringify({ sid: "keyboard", upgrades: [], pingInterval: 600000, pingTimeout: 600000, maxPayload: 1000000 })}`,
    );
    ws.onMessage((message) => {
      const frame = String(message);
      if (frame === "40") {
        ws.send('40{"sid":"keyboard"}');
        publish();
      } else if (frame.startsWith("42")) {
        const [event, action] = JSON.parse(frame.slice(2));
        if (event === "skip") {
          skips.push(action);
          skipTurn(game, 1, action.seq, Date.now());
          publish();
          return;
        }
        if (event !== "use") return;
        useOperation(
          game,
          1,
          action.cardId,
          action.target,
          action.seq,
          Date.now(),
        );
        actions.push(action.target);
        publish();
      }
    });
  });
  await page.goto("/play");
  await expect(page.locator(".cards .card")).toHaveCount(8);
  return {
    game,
    cards,
    actions,
    skips,
    disconnectedAt,
    publish,
    disconnect: () => socket.close(),
  };
}


import { chromium } from '@playwright/test';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://localhost:45650/');
  const originalGoto = page.goto.bind(page);
  page.goto = ((url,opts) => originalGoto(new URL(url,'http://localhost:45650').href,opts)) as typeof page.goto;
  const {game,publish} = await keyboardGame(page);
  game.players[1].maxSquare = 10004;
  game.players[1].maxCube = 10009;
  game.players[1].destroyedTiles = 4;
  game.players[0].maxSquare = 41;
  game.players[0].maxCube = 46;
  game.players[0].destroyedTiles = 41;
  game.cards = ['add_max_square','add_max_cube','square_cell','cube_cell','remove_row','protect_row_gold','add_matrix','absolute_matrix'].map((operation,i)=>({id:'capture-'+i,operation,value:3}));
  publish();
  await expect(page.locator('[data-card-id="capture-0"]')).toBeVisible();
  await page.addStyleTag({content: readFileSync('app/style.css','utf8')});
  const sizes = [['desktop',1440,900],['laptop',1280,720],['short-desktop',1024,700],['mid-desktop',1440,800],['mobile',390,844],['mid-phone',390,740],['small-phone',360,640],['landscape',844,390]] as const;
  for(const [name,width,height] of sizes) {
    await page.setViewportSize({width,height});
    const issues = await page.evaluate(() => {
      const issues:string[]=[];
      for(const el of document.querySelectorAll<HTMLElement>('.matrix-panel,.matrix-wrap,.cell,.power-total,.player-power-stats,.pool,footer')) {
        const r=el.getBoundingClientRect();
        if(r.x < -1 || r.y < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1) issues.push('Outside viewport: '+el.className);
        const panel=el.closest('.matrix-panel')?.getBoundingClientRect();
        if(panel && (r.bottom > panel.bottom+1 || r.right > panel.right+1)) issues.push('Outside matrix: '+el.className);
      }
      for (const card of document.querySelectorAll<HTMLElement>('.card')) {
        const r=card.getBoundingClientRect();
        for (const child of card.children) {
          const c=child.getBoundingClientRect();
          if (c.top<r.top-1 || c.bottom>r.bottom+1) issues.push('Clipped tile text: '+child.textContent);
        }
      }
      return [...new Set(issues)];
    });

    console.log(JSON.stringify({name,width,height,issues}));
  }
} finally { await browser.close(); }
