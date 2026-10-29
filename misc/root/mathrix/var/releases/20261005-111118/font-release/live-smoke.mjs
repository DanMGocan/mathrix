import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.env.SMOKE_ORIGIN || 'https://mathrix.app';
const browser=await chromium.launch();
const context=await browser.newContext({baseURL:origin,viewport:{width:1280,height:900}});
const page=await context.newPage();
async function checkFont() {
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(()=>({
    loaded:[...document.fonts].some(f=>f.family.replaceAll('"','')==='Patrick Hand' && f.status==='loaded'),
    wrong:[...document.body.querySelectorAll('*')].filter(e=>e.getClientRects().length &&
      ([...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim()) || e.matches('input,textarea,select')) &&
      !getComputedStyle(e).fontFamily.includes('Patrick Hand')
    ).map(e=>({tag:e.tagName,classes:e.className,font:getComputedStyle(e).fontFamily})).slice(0,5)
  }));
  assert.equal(result.loaded,true,'Patrick Hand did not load');
  assert.deepEqual(result.wrong,[],'Some visible text uses another font');
}
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  const health=await context.request.get('/api/health');assert.equal(health.status(),200);
  const denied=await context.request.get('/api/admin/analytics');assert.equal(denied.status(),403);
  await page.goto('/');await checkFont();
  await page.screenshot({path:new URL('./font-home-desktop.png',import.meta.url).pathname,fullPage:true});
  await expect(page.locator('footer').getByRole('link',{name:'Privacy Policy',exact:true})).toBeVisible();
  await expect(page.locator('footer').getByRole('link',{name:'Terms of Service',exact:true})).toBeVisible();
  for(const [path,title] of [['/privacy','Privacy Policy'],['/terms','Terms of Service']]) {
    await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await checkFont();
  }
  const login=await context.request.post('/api/auth/sign-in/email',{data:{email:'admin1@mathrix.app',password:'amdin'},headers:{Origin:origin}});
  assert.equal(login.status(),200,'Admin sign-in failed');
  for(const path of ['/api/admin/overview','/api/admin/settings','/api/admin/design-files','/api/profile']) {
    const response=await context.request.get(path);assert.equal(response.status(),200,path);
  }
  await page.goto('/admin');await page.getByRole('button',{name:'Analytics',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Server performance',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Gameplay trends',exact:true})).toBeVisible();
  await page.getByLabel('Analytics period').selectOption('30d');
  await expect(page.getByRole('button',{name:'Refresh analytics'})).toBeEnabled();
  await expect(async()=>{
    const response=await context.request.get('/api/admin/analytics?range=30d');assert.equal(response.status(),200);
    const analytics=await response.json();assert.equal(analytics.range,'30d');assert.ok(analytics.live.sampledAt);
    assert.equal(analytics.live.probes.database.status,'ok');assert.equal(analytics.live.probes.redis.status,'ok');
  }).toPass({timeout:20000,intervals:[1000,2000]});
  await checkFont();
  await page.screenshot({path:new URL('./font-analytics-desktop.png',import.meta.url).pathname,fullPage:true});
  await page.goto('/profile');await expect(page.locator('.premium-panel')).toBeVisible();
  await checkFont();
  const profile=await (await context.request.get('/api/profile')).json();
  assert.ok(profile.username);assert.ok(profile.avatarId);
  if(!profile.billing?.configured)await expect(page.getByRole('button',{name:'Get Premium · €4.99/month',exact:true})).toBeDisabled();
  await page.goto('/play');
  await expect(async()=>{
    const back=page.getByRole('button',{name:'Back to modes',exact:true});
    if(await back.isVisible())await back.click();
    await page.getByRole('button',{name:'Vs AI',exact:true}).click({timeout:1000});
  }).toPass({timeout:10000});
  await expect(page.getByRole('button',{name:'Play vs AI',exact:true})).toBeVisible();
  await expect(page.getByLabel('Game speed').locator('option')).toHaveCount(4);
  await checkFont();
  await page.setViewportSize({width:390,height:844});
  await checkFont();
  await page.screenshot({path:new URL('./font-play-mobile.png',import.meta.url).pathname,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto('/play?mode=practice');
  await expect(page.locator('.game')).toBeVisible();await checkFont();
  await page.screenshot({path:new URL('./font-practice-mobile.png',import.meta.url).pathname,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[],'Browser runtime errors');
  console.log(JSON.stringify({patrickHandLoaded:true,fontCoverage:true,httpsHealth:true,adminProtection:true,legalPages:true,analytics:true,dependencyProbes:true,profiles:true,aiMode:true,mobileLayout:true,billingConfigured:Boolean(profile.billing?.configured),buildId:readFileSync(process.env.SMOKE_ORIGIN ? '/root/mathrix/.next/BUILD_ID' : '/srv/mathrix/.next/BUILD_ID','utf8').trim()}));
} finally {await context.close();await browser.close();}
