import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({baseURL:'http://localhost:43590'});
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:900});
  await page.goto('/');await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('body')).toHaveCSS('font-family','"Patrick Hand", cursive');
  assert.ok(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Patrick Hand'&&f.status==='loaded')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:new URL(`./font-preview-${width}.png`,import.meta.url).pathname,fullPage:true});
 }
 console.log('Patrick Hand rendered successfully on desktop and mobile');
} finally {await browser.close();}
