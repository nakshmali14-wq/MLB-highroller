import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

async function json(url, options) {
  const r = await fetch(url, options);
  const body = await r.text();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`Telegram returned HTTP ${r.status}: ${body}`); }
  if (!r.ok || !data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

try {
  console.log('Telegram setup');
  console.log('1) Create a bot with @BotFather and copy the bot token.');
  console.log('2) Open your new bot (NOT @BotFather) and send /start.');

  const token = (await rl.question('Paste bot token: ')).trim();
  if (!token) throw new Error('No token entered.');

  const api = `https://api.telegram.org/bot${token}`;
  const me = await json(`${api}/getMe`);
  console.log(`Bot: @${me.result.username}`);

  try {
    await json(`${api}/deleteWebhook?drop_pending_updates=false`);
    console.log('Webhook cleared; ready to read bot messages.');
  } catch (e) {
    console.log(`Webhook check: ${e.message}`);
  }

  async function readUpdates() {
    const data = await json(`${api}/getUpdates?limit=100&timeout=5&allowed_updates=%5B%22message%22%5D`);
    return data.result || [];
  }

  let updates = await readUpdates();
  if (!updates.length) {
    console.log('No message received yet. Open @' + me.result.username + ' in Telegram and send /start now.');
    console.log('Waiting up to 60 seconds...');
    const end = Date.now() + 60_000;
    while (Date.now() < end && !updates.length) updates = await readUpdates();
  }

  const chats = new Map();
  for (const u of updates) {
    const m = u.message;
    if (m?.chat?.id != null) chats.set(String(m.chat.id), m.chat.title || m.chat.username || m.chat.first_name || String(m.chat.id));
  }

  if (!chats.size) throw new Error(`No chat found. Send /start to @${me.result.username}, then run npm run setup-telegram again.`);

  const ids = [...chats.keys()];
  console.log('Chats found:');
  ids.forEach((id, i) => console.log(`${i + 1}. ${chats.get(id)} (${id})`));
  const choice = Number(await rl.question(`Choose chat [1-${ids.length}]: `));
  const chatId = ids[(choice || 1) - 1] || ids[0];

  const env = [
    `TELEGRAM_BOT_TOKEN=${token}`,
    `TELEGRAM_CHAT_ID=${chatId}`,
    'CDP_URL=http://127.0.0.1:9222',
    'PLAYER_PROPS_ONLY=true',
    'POLL_MS=2000',
    'DEBUG=true',
  ].join('\n') + '\n';

  fs.writeFileSync('.env', env, { encoding: 'utf8' });
  console.log('Saved .env successfully.');
  console.log('Run: npm start');
} finally {
  rl.close();
}
