import { chromium } from '@playwright/test';
import { keyboardGame } from './fixture';
const browser = await chromium.launch();
try {
  for (const [name,width,height] of [['desktop',1440,900],['landscape',844,390]] as const) {
    const page = await browser.newPage({baseURL:'http://localhost:44620',viewport:{width,height},reducedMotion:'reduce'});
    await page.addInitScript('window.__name = value => value');
    const {game,publish} = await keyboardGame(page);
    game.cards = ['reverse_digits_cell','protect_column_bronze','protect_row_bronze','determinant_cell','add_matrix','add_row_value','unlock_slot','add_cell'].map((operation,i)=>({id:`stress-${i}`,operation:operation as any,value:3}));
    publish();
    await page.locator('[data-card-id="stress-0"]').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:`.impeccable/review/tiles-${name}.png`,fullPage:true});
    console.log(`Captured tiles-${name}`);
    await page.close();
  }
} finally {await browser.close();}
