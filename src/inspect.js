import 'dotenv/config';
import { chromium } from 'playwright';

const url = process.env.STAKE_URL || 'https://stake.jp/sports/high/all';
const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:9222';

const browser = await chromium.connectOverCDP(cdpUrl);
const pages = browser.contexts().flatMap(context => context.pages());
let page = pages.find(p => p.url().includes('/sports/high'));

if (!page) {
  page = pages[0] || await browser.contexts()[0].newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

await page.waitForTimeout(3000);
const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(row => ({
  text: row.innerText || row.textContent || '',
  cells: [...row.querySelectorAll('th,td')].map(cell => cell.innerText || cell.textContent || ''),
  icons: [...row.querySelectorAll('[data-ds-icon]')].map(el => el.getAttribute('data-ds-icon')).filter(Boolean),
})));

console.log(JSON.stringify(rows.slice(0, 20), null, 2));
console.log(`Captured ${rows.length} rendered rows.`);
