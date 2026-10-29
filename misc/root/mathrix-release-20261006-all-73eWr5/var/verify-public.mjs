import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium, expect} from '@playwright/test';

const origin = 'https://mathrix.app';
const health = await fetch(`${origin}/api/health`, {signal: AbortSignal.timeout(10000)});
assert.equal(health.status, 200);
const status=await health.json();
for(const key of ['status','database','redis'])assert.equal(status[key],'ok');
const providers = await fetch(`${origin}/api/providers`);
assert.deepEqual(await providers.json(), {google:true,discord:true});
const build = (await readFile('/srv/mathrix/.next/BUILD_ID','utf8')).trim();
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.ok((await home.text()).includes(build), 'Public homepage must serve the deployed build');
assert.ok(home.headers.get('strict-transport-security'));
assert.ok(home.headers.get('x-content-type-options').split(',').every(value=>value.trim()==='nosniff'));
assert.equal((await fetch(`${origin}/api/admin/overview`)).status, 403);
const password = await fetch(`${origin}/api/auth/sign-in/email`, {
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({email:'audit@example.invalid',password:'unused-audit-password'})});
assert.ok([400,404].includes(password.status), 'Password login must be disabled');
for (const target of [origin, 'http://127.0.0.1:3001']) {
 const overflow = await fetch(`${target}/api/auth/sign-in/email`, {
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:Buffer.alloc(32769,120)});
 assert.equal(overflow.status, 413);
}
assert.notEqual((await fetch('http://152.53.14.163/api/health',{redirect:'manual'})).status,200);
for (const provider of ['google','discord']) {
 const response = await fetch(`${origin}/api/auth/sign-in/social`, {
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({provider,callbackURL:`${origin}/profile`})});
 assert.equal(response.status,200);
 const url=new URL((await response.json()).url);
 assert.equal(url.hostname,provider==='google'?'accounts.google.com':'discord.com');
 assert.equal(url.searchParams.get('redirect_uri'),`${origin}/api/auth/callback/${provider}`);
}
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto(`${origin}/auth`);
 for(const provider of ['Google','Discord'])
  await expect(page.getByRole('button',{name:`Continue with ${provider}`,exact:true})).toBeEnabled();
 await expect(page.locator('input[type="password"],input[type="email"]')).toHaveCount(0);
 await page.screenshot({path:'var/public-auth.png',fullPage:true});
 await page.goto(origin);
 await expect(page.getByRole('button',{name:'Play as guest',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send feedback',exact:true})).toBeVisible();
 await page.screenshot({path:'var/public-home.png',fullPage:true});
} finally {await browser.close();}
console.log(JSON.stringify({publicHealth:'ok',build,oauthProviders:'enabled',passwordLogin:'disabled',authBodyLimits:'413',directIPProxy:'removed',publicBrowser:'passed'}));
