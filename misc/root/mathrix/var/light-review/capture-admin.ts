import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://localhost:44630';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({baseURL: origin, reducedMotion: 'reduce'});
  const response = await page.request.post('/api/auth/sign-in/email', {
    data: {email: 'admin1@mathrix.app', password: 'amdin'},
    headers: {Origin: origin},
  });
  assert(response.ok(), `Test-admin sign-in returned ${response.status()}`);
  for (const [name, width, height] of [['desktop',1440,900],['mobile',390,844]] as const) {
    await page.setViewportSize({width,height});
    await page.goto('/admin');
    await page.getByRole('heading',{name:'Administration',exact:true}).waitFor();
    await page.getByText('Registered users',{exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const bounds = await page.evaluate(()=>({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      documentationRight: document.querySelector<HTMLAnchorElement>('.admin-heading a')!.getBoundingClientRect().right,
    }));
    assert(bounds.scrollWidth <= width + 1, JSON.stringify(bounds));
    assert(bounds.documentationRight <= width + 1, JSON.stringify(bounds));
    await page.screenshot({path:`.impeccable/review/admin-${name}.png`,fullPage:true});
    console.log(name, bounds);
  }
} finally {await browser.close();}
