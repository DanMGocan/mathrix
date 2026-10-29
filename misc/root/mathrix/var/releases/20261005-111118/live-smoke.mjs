import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin='https://mathrix.app';
const browser=await chromium.launch();
const context=await browser.newContext({baseURL:origin,viewport:{width:1280,height:900}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  const health=await context.request.get('/api/health');assert.equal(health.status(),200);
  const denied=await context.request.get('/api/admin/analytics');assert.equal(denied.status(),403);
  await page.goto('/');
  await expect(page.locator('footer').getByRole('link',{name:'Privacy Policy',exact:true})).toBeVisible();
  await expect(page.locator('footer').getByRole('link',{name:'Terms of Service',exact:true})).toBeVisible();
  for(const [path,title] of [['/privacy','Privacy Policy'],['/terms','Terms of Service']]) {
    await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
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
  await page.screenshot({path:new URL('./live-analytics.png',import.meta.url).pathname,fullPage:true});
  await page.goto('/profile');await expect(page.locator('.premium-panel')).toBeVisible();
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
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[],'Browser runtime errors');
  console.log(JSON.stringify({httpsHealth:true,adminProtection:true,legalPages:true,analytics:true,dependencyProbes:true,profiles:true,aiMode:true,mobileLayout:true,billingConfigured:Boolean(profile.billing?.configured),buildId:readFileSync('/srv/mathrix/.next/BUILD_ID','utf8').trim()}));
} finally {await context.close();await browser.close();}
