# MLB High Roller Watcher

A Node.js + Playwright watcher that reads Stake's High Rollers table from a normal Chrome session and sends newly detected MLB player-prop candidates to Telegram.

> This project does not place bets or provide betting recommendations. It forwards detected High Roller information to Telegram.

> Stake's terms may restrict automated capture/analysis of website content. Use the project only where permitted. Do not bypass CAPTCHA, Cloudflare, bot checks, access controls, or other security mechanisms. Human verification is completed manually in a normal Chrome session.

## What it does

For each newly detected candidate row, the watcher sends:

- Player/event text
- Odds
- Bet amount
- Username (or `Hidden` when Stake displays that)
- Time shown by Stake

The watcher polls every 2 seconds by default. Rows already visible when the process starts are seeded and are not sent as alerts, preventing a burst of historical notifications after a restart.

## Current detection logic

The High Rollers row exposes the sport through Stake's icon/data attributes. The watcher first limits candidates to baseball rows. It then uses a conservative player-prop heuristic: obvious game-level matchups such as `Team A - Team B` and multi bets are ignored, while single-event baseball rows are treated as player-prop candidates.

This is a heuristic, not a guaranteed market-level classifier. The current version does not open the individual bet preview to verify the exact market type.

## Requirements

- Windows 10/11
- Node.js LTS
- Google Chrome
- Telegram
- A Telegram bot created with `@BotFather`
- Internet access

## Installation

Install Node.js LTS from <https://nodejs.org/>.

Verify:

```powershell
node --version
npm --version
```

Then, from the repository folder:

```powershell
npm install
```

## Start the dedicated Chrome session

The watcher attaches to Chrome over the Chrome DevTools Protocol (CDP). Use a dedicated Chrome profile so it does not interfere with your normal browser session.

Run:

```bat
scripts\start-chrome.bat
```

Or manually:

```bat
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\StakeHighRollerChrome"
```

In that Chrome window open:

<https://stake.jp/sports/high/all>

Complete any normal human verification manually. Do not bypass security checks.

## Configure Telegram

1. Open `@BotFather`.
2. Create or select your Telegram bot.
3. Obtain the bot token.
4. Open the **bot itself**, not BotFather, and send `/start`.
5. In the repo folder run:

```powershell
npm run setup-telegram
```

Paste the token into the terminal when prompted. The setup script discovers the chat ID and writes a local `.env`.

Never commit `.env` or share the bot token.

## Start the watcher

```powershell
npm start
```

Typical startup:

```text
Watching https://stake.jp/sports/high/all
Poll: 2000ms | Player props only: yes
Telegram: enabled
Attached to an existing Chrome session.
Initial sync complete: ... existing candidate rows seeded.
```

Leave the dedicated Chrome window and Command Prompt running during the laptop-based setup. Telegram itself can be closed because Telegram delivers bot messages to your phone independently.

## Configuration

Copy `.env.example` to `.env` if configuring manually:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CDP_URL=http://127.0.0.1:9222
STAKE_URL=https://stake.jp/sports/high/all
PLAYER_PROPS_ONLY=true
POLL_MS=2000
DEBUG=true
LOG_FILE=data/bets.jsonl
```

## Notification example

```text
⚾ MLB Player Prop
Player: Jordan Alvarez
Odds: 3.05
Amount: MX$50,000
User: Hidden
Time: 5:13 AM
```

## Useful commands

```powershell
npm install
npm run setup-telegram
npm start
```

## Troubleshooting

### npm is not recognized
Install Node.js LTS, close the terminal, open a new terminal, then retry.

### Chrome is not detected
Make sure the dedicated Chrome window was started with `--remote-debugging-port=9222` and remains open.

### Stake asks for human verification
Complete the verification normally in Chrome. Do not attempt to automate or bypass it.

### Telegram says no chat was found
Open the bot itself in Telegram, send `/start`, then run `npm run setup-telegram` again.

### No notifications
Check that `Telegram: enabled` appears, that a new candidate appears after `Initial sync complete`, and that both Chrome and `npm start` remain running.

## Project structure

```text
MLB-highroller/
├── src/
│   ├── index.js
│   ├── inspect.js
│   └── setup-telegram.js
├── scripts/
│   ├── start-chrome.bat
│   └── start-watcher.bat
├── data/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

## Security

Do not commit:

- Telegram bot tokens
- `.env`
- Stake credentials
- Browser cookies/session data
- Exported Chrome profiles
- Private account data

The repository ignores `.env`, `node_modules`, and JSONL logs.

## Disclaimer

This is a notification/monitoring utility. It is not financial advice, sports-betting advice, or a guarantee of any outcome. Use it in accordance with applicable laws and platform rules.
