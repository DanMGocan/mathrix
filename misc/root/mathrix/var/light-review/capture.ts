import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { keyboardGame } from './fixture';
const browser = await chromium.launch();
const report: Record<string, unknown> = {};
try {
 for(const [name,width,height] of [
  ['desktop',1440,900],['laptop',1280,720],['short-desktop',1024,700],['mid-desktop',1440,800],
  ['mobile',390,844],['mid-phone',390,740],['small-phone',360,640],['landscape',844,390],
 ] as const){
  const page=await browser.newPage({viewport:{width,height},baseURL:'http://localhost:44620',reducedMotion:'reduce'});
  await page.addInitScript("window.__name = value => value");
  const {game,publish}=await keyboardGame(page);
  game.players[1].name='LongPlayerName12345678901';game.players[1].countryCode='IE';game.players[1].rank=191;game.players[1].played=61;game.players[1].destroyedTiles=4;
  game.players[0].countryCode='UA';game.players[0].rank=4;game.players[0].played=8;game.players[0].destroyedTiles=41;
  game.cards=['add_matrix','add_row_value','remove_column','protect_row_gold','add_row','absolute_matrix','unlock_slot','add_cell'].map((operation,i)=>({id:`visual-${i}`,operation:operation as any,value:3}));
  for(const p of game.players){p.matrix[0][0]=-10000;p.matrix[0][1]=10000;p.rowShields[3]=Date.now()+30000;}
  publish();
  await page.waitForFunction(()=>document.querySelector('[data-card-id="visual-0"]'));
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`.impeccable/review/${name}.png`,fullPage:true});
  report[name]=await page.evaluate(()=>{
   const box=(selector:string)=>{const el=document.querySelector<HTMLElement>(selector)!;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const issues:string[]=[];
   for(const e of document.querySelectorAll<HTMLElement>('.boards,.matrix-panel,.matrix-wrap,.cell,.axis,.pool,.game-status,footer')){
    const r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1)issues.push(`outside:${e.className}`);
   }
   for(const e of document.querySelectorAll<HTMLElement>('.card')){
    const r=e.getBoundingClientRect();for(const child of e.children){const c=child.getBoundingClientRect();if(c.bottom>r.bottom+1||c.top<r.top-1||c.right>r.right+1||c.left<r.left-1)issues.push(`clipped:${child.textContent}`);}
   }
   return {game:box('.game'),boards:box('.boards'),cards:box('.cards'),footer:box('footer'),issues};
  });
  await page.close();
 }
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]] as const){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await page.route('**/api/me',r=>r.fulfill({json:null}));
  for(const [version,origin] of [['before','http://localhost:3000'],['after','http://localhost:44620']] as const){
   await page.goto(origin+'/');await page.locator('.landing-actions > button').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:`.impeccable/review/landing-${name}-${version}.png`,fullPage:true});
  }
  for(const [label,path] of [['lobby','/play'],['tutorial','/how-to-play'],['settings','/settings'],['auth','/auth']] as const){
   await page.goto('http://localhost:44620'+path);await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:`.impeccable/review/${label}-${name}.png`,fullPage:true});
  }
  await page.close();
 }
 writeFileSync('.impeccable/review/geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
} finally {await browser.close();}
