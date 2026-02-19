# FlipperBridge

Cloud relay that lets Claude send commands to a Flipper Zero over the internet.

## Architecture

```
Claude  <-->  Relay (Cloudflare Worker)  <-->  WiFi (ESP32)  <-->  Flipper Zero
```

## Components

### 1. Relay Service (`relay/`)
Cloudflare Worker with KV storage that brokers messages between Claude and the Flipper.

- Password-protected ephemeral sessions (1-hour TTL)
- One command at a time per session
- Rate limiting (10 commands/min, 30 polls/min)
- No accounts — just session passwords

### 2. Flipper Bridge App (`flipper/`)
JavaScript app running on the Flipper Zero (mJS on Momentum firmware) that polls the relay and executes commands via FlipperHTTP.

- Communicates with ESP32 WiFi module over UART
- Polls relay every 3 seconds for pending commands
- Executes HTTP GET/POST through FlipperHTTP serial protocol
- Returns results back to relay

### 3. Claude Skill (`skill/`)
SKILL.md that teaches Claude how to use the relay API.

## Requirements

- Flipper Zero with [Momentum firmware](https://momentum-fw.dev)
- ESP32-S2 WiFi dev board with [FlipperHTTP](https://github.com/jblanked/FlipperHTTP) firmware
- Cloudflare account (free tier works)

## Quick Start

### Deploy the Relay

```bash
cd relay
npm install
# Edit wrangler.toml with your KV namespace ID
npm run deploy
```

### Set Up the Flipper

1. Copy `flipper/flipper_bridge.js` to `/ext/apps/Scripts/` on the Flipper SD card
2. Create `/ext/apps_data/flipper_bridge/config.txt`:
   ```
   A7X29K
   abc123device456
   https://your-relay.workers.dev
   ```
3. Run from Apps → Scripts → flipper_bridge

### Use with Claude

Give Claude the SKILL.md from `skill/` and provide your session ID and password.

## Development

```bash
cd relay
npm install
npm run dev     # local dev server on :8787
npm test        # run tests
```

## API Overview

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/session` | POST | — | Create session |
| `/api/session/:id` | GET | Bearer | Get session status |
| `/api/session/:id` | DELETE | Bearer | End session |
| `/api/session/:id/command` | POST | Bearer | Submit command |
| `/api/session/:id/result` | GET | Bearer | Poll for result |
| `/api/device/:id/register` | POST | X-Device-Key | Register Flipper |
| `/api/device/:id/poll` | GET | X-Device-Key | Poll for command |
| `/api/device/:id/result` | POST | X-Device-Key | Submit result |

## v1 Limitations

- HTTP commands only (GET, POST via FlipperHTTP)
- No CLI commands (nfc, ir, subghz, etc.) — UART is used by FlipperHTTP
- Polling-based (3s interval), not real-time
- 64KB payload limit
- Single command at a time

## License

See [LICENSE](LICENSE).
