---
name: flipper-bridge
description: >
  Send commands to a Flipper Zero device over the internet via a cloud relay.
  Transmit Sub-GHz radio signals, write files to the SD card, execute mJS code,
  and make HTTP requests from the Flipper's network. Use when the user wants to
  interact with their Flipper Zero remotely: transmitting signals, managing files
  on the device, reading device data, or making network requests from the
  Flipper's location. Requires the user to have a Flipper Zero with Momentum
  firmware, an ESP32 WiFi module, and the bridge app running.
---

# FlipperBridge

Send commands to a Flipper Zero via: Claude → Relay API → ESP32 WiFi → Flipper Zero

## Session Setup

Ask the user for their **session ID** and **password**, or create a session if they provide their device token:

```
POST https://flipper-bridge.james-e09.workers.dev/api/session
{"device_id": "<first-8-hex-of-sha256(token)>", "device_token": "...", "password": "..."}
→ {"session_id": "A7X29K"}
```

All subsequent requests use `Authorization: Bearer <password>`.

Verify connection before sending commands:
```
GET /api/session/{id}
→ {"device_connected": true, "device_info": {...}, "command": ...}
```

## Sending Commands

```
POST /api/session/{id}/command
{"type": "<type>", "payload": "<payload>"}
→ {"command_id": "...", "status": "queued"}
```

One command at a time (409 if busy). Poll for results:
```
GET /api/session/{id}/result
→ {"status": "completed", "result": "..."}
```

Statuses: `queued` → `running` → `completed` | `error` | `timeout` (60s)

## Command Types

### `subghz` — Transmit Sub-GHz signals

Inline .sub file content (preferred) or path to existing file on SD card:
```json
{"type": "subghz", "payload": "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\nPreset: FuriHalSubGhzPresetOok650Async\nProtocol: Princeton\nBit: 24\nKey: 00 00 00 00 00 95 D5 D4\nTE: 400\n"}
```
```json
{"type": "subghz", "payload": "/ext/subghz/saved_signal.sub"}
```

For .sub file format details, see [references/signal-formats.md](references/signal-formats.md).

### `write_file` — Write a file to the SD card

First line = destination path, rest = content. Parent dirs created automatically.
```json
{"type": "write_file", "payload": "/ext/infrared/tv.ir\nFiletype: IR signals file\nVersion: 1\n#\nname: Power\ntype: parsed\nprotocol: NECext\naddress: EE 87 00 00\ncommand: 5D A0 00 00\n"}
```

Use to stage .ir, .sub, .nfc, .rfid files. For file format details, see [references/signal-formats.md](references/signal-formats.md).

### `js` — Execute mJS on the Flipper

Last expression returned as result. Scope: `storage`, `notification`, `subghz`.
```json
{"type": "js", "payload": "let f = storage.openFile('/ext/test.txt', 'r', 'open_existing');\nlet data = f.read('ascii', 256);\nf.close();\ndata;"}
```

mJS constraints: no JSON.parse, no arrow functions, no const/template literals. String methods: `slice`, `indexOf`, `[i]` only. No `substring`, `lastIndexOf`, `charAt`.

### `get` / `post` — HTTP requests from the Flipper

```json
{"type": "get", "payload": "https://httpbin.org/ip"}
```
```json
{"type": "post", "payload": "{\"url\":\"https://...\",\"headers\":{\"Content-Type\":\"application/json\"},\"payload\":\"{\\\"key\\\":\\\"value\\\"}\"}"}
```

## Limitations

- **IR/NFC/RFID transmission not available** — no mJS modules. Use `write_file` to stage files for manual use from the Flipper's apps.
- **One command at a time**, polling only (3s intervals), 64KB payload limit, results truncated to 4000 chars.

## Safety

- Confirm with user before transmitting Sub-GHz signals — affects physical world.
- Never relay credentials — payloads stored in plaintext temporarily.
- Rate limits: 10 commands/min, 30 polls/min. Sessions expire after 1 hour.
