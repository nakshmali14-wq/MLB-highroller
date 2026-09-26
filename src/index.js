import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const CFG = {
  url: process.env.STAKE_URL || 'https://stake.jp/sports/high/all',
  pollMs: Number(process.env.POLL_MS || 2000),
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  logFile: process.env.LOG_FILE || 'data/bets.jsonl',
  cdpUrl: process.env.CDP_URL || '',
  debug: String(process.env.DEBUG || 'false').toLowerCase() === 'true',
  playerPropsOnly: String(process.env.PLAYER_PROPS_ONLY || 'true').toLowerCase() === 'true',
};

const dataDir = path.dirname(CFG.logFile);
fs.mkdirSync(dataDir, { recursive: true });

function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
function isLikelyOdds(s) {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 1.001 && n <= 1000;
}
function isLikelyTime(s) { return /\b\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)?\b/i.test(s); }

function parseRow(raw) {
  const texts = raw.cells.map(x => norm(x.text));
  if (texts.length < 4) return null;
  if (texts.length >= 5) {
    const [event, user, time, odds, amount] = texts.slice(0, 5);
    return { event, user: user || 'Hidden', time, odds, amount, sport: raw.sport || '', rawText: raw.rowText };
  }
  const time = texts.find(isLikelyTime) || '';
  const odds = texts.find(isLikelyOdds) || '';
  const event = texts[0] || '';
  const amount = texts.find((x, i) => i > 0 && x !== odds && x !== time && /[$€£₹₽₺₴₦₱₫₩฿₮₲₵₡]/.test(x)) || texts.at(-1) || '';
  const user = texts.find(x => x !== event && x !== time && x !== odds && x !== amount) || 'Hidden';
  return { event, user, time, odds, amount, sport: raw.sport || '', rawText: raw.rowText };
}

function looksBaseball(r) {
  const hay = `${r.sport} ${r.rawText}`.toLowerCase();
  return r.sport.toLowerCase() === 'baseball' || hay.includes('baseball') || hay.includes('mlb');
}

function looksPlayerProp(r) {
  if (!looksBaseball(r)) return false;
  if (!CFG.playerPropsOnly) return true;
  const e = norm(r.event);
  if (!e || /^multi\b/i.test(e)) return false;
  if (/\s[-–—]\s/.test(e)) return false;
  return true;
}

function makeId(r) { return [r.event, r.user, r.time, r.odds, r.amount].map(norm).join(' | '); }

async function telegram(text) {
  if (!CFG.botToken || !CFG.chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${CFG.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CFG.chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram error ${res.status}: ${await res.text()}`);
}

function formatNotification(r) {
  return [
    '⚾ MLB Player Prop',
    `Player: ${r.event || '—'}`,
    `Odds: ${r.odds || '—'}`,
    `Amount: ${r.amount || '—'}`,
    `User: ${r.user || 'Hidden'}`,
    `Time: ${r.time || '—'}`,
  ].join('\n');
}

function appendLog(r) {
  fs.appendFileSync(CFG.logFile, JSON.stringify({ ...r, capturedAt: new Date().toISOString() }) + '\n');
}

async function extractRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows.map(row => {
      const cells = [...row.querySelectorAll('th,td')].map(c => ({ text: c.innerText || c.textContent || '' }));
      const icons = [...row.querySelectorAll('[data-ds-icon]')].map(el => el.getAttribute('data-ds-icon')).filter(Boolean);
      return {
        rowText: row.innerText || row.textContent || '',
        cells,
        sport: icons.find(x => ['Baseball','AmericanFootball','Soccer','Tennis','Basketball','IceHockey'].includes(x)) || icons[0] || '',
      };
    });
  });
}

async function getBrowserAndPage() {
  if (CFG.cdpUrl) {
    const browser = await chromium.connectOverCDP(CFG.cdpUrl);
    const contexts = browser.contexts();
    const pages = contexts.flatMap(c => c.pages());
    let page = pages.find(p => p.url().includes('/sports/high'));
    if (!page) {
      page = await contexts[0].newPage();
      await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    return { browser, page, attached: true };
  }
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(CFG.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { browser, page, attached: false };
}

async function main() {
  console.log(`Watching ${CFG.url}`);
  console.log(`Poll: ${CFG.pollMs}ms | Player props only: ${CFG.playerPropsOnly ? 'yes' : 'no'}`);
  console.log(`Telegram: ${CFG.botToken && CFG.chatId ? 'enabled' : 'not configured'}`);

  const { browser, page, attached } = await getBrowserAndPage();
  console.log(attached ? 'Attached to an existing Chrome session.' : 'Started a Playwright browser.');
  await page.waitForTimeout(3000);

  const seen = new Map();
  const MAX_SEEN = 5000;
  let initialized = false;
  let printedFirstRows = false;

  while (true) {
    try {
      const rawRows = await extractRows(page);
      const parsed = rawRows.map(parseRow).filter(Boolean);
      const matches = parsed.filter(looksPlayerProp);

      if (CFG.debug && !printedFirstRows) {
        console.log(JSON.stringify(parsed.slice(0, 10), null, 2));
        console.log(`Current MLB player-prop candidates: ${matches.length}`);
        printedFirstRows = true;
      }

      if (!initialized) {
        for (const r of matches) seen.set(makeId(r), Date.now());
        initialized = true;
        console.log(`Initial sync complete: ${matches.length} existing candidate rows seeded.`);
      } else {
        for (const r of matches) {
          const id = makeId(r);
          if (!id || seen.has(id)) continue;
          seen.set(id, Date.now());
          appendLog(r);
          const msg = formatNotification(r);
          console.log(`\nNEW BET\n${msg}\n`);
          try { await telegram(msg); } catch (e) { console.error(e.message); }
        }
      }

      if (seen.size > MAX_SEEN) {
        const cutoff = Date.now() - 6 * 60 * 60 * 1000;
        for (const [id, ts] of seen) if (ts < cutoff) seen.delete(id);
        while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
      }
    } catch (e) {
      console.error(new Date().toISOString(), e.message);
      if (!attached) {
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); } catch {}
        await page.waitForTimeout(5000);
      } else await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(CFG.pollMs);
  }
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
main().catch(err => { console.error(err); process.exit(1); });
