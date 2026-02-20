# FlipperBridge — Claude Skill

## What This Is

FlipperBridge lets you send commands to a user's Flipper Zero device over the internet. The Flipper connects to a cloud relay via WiFi (ESP32 + FlipperHTTP), and you interact with the relay's API to send commands and receive results.

**Architecture:** Claude → Relay API → Internet → ESP32 WiFi → Flipper Zero

## Prerequisites

The user must have:
1. A Flipper Zero with Momentum firmware
2. An ESP32 WiFi module with FlipperHTTP firmware installed
3. The `flipper_bridge.js` app running on the Flipper (auto-registers on first launch)
4. A config file on the Flipper with the relay URL and device token

## Session Workflow

### 1. Get Session Credentials from the User

The user creates a session from the relay's landing page, or you can create one via API if they give you their device token. Ask the user for:
- **Session ID** (6 characters, e.g., `A7X29K`)
- **Password** (they chose this when creating the session)

Or, if the user provides their device token, create a session:

```
POST https://flipper-bridge.james-e09.workers.dev/api/session
Content-Type: application/json

{"device_id": "a1b2c3d4", "device_token": "their-device-token", "password": "chosen-password"}
```

The `device_id` is the first 8 hex characters of the SHA-256 hash of the device token.

Response:
```json
{"session_id": "A7X29K"}
```

### 2. Verify Flipper is Connected

```
GET https://flipper-bridge.james-e09.workers.dev/api/session/A7X29K
Authorization: Bearer chosen-password
```

Check `device_connected` in the response. Once `true`, the Flipper is online and ready.

### 3. Send Commands

```
POST https://flipper-bridge.james-e09.workers.dev/api/session/A7X29K/command
Authorization: Bearer chosen-password
Content-Type: application/json

{"type": "subghz", "payload": "Filetype: Flipper SubGhz Key File\nVersion: 1\n..."}
```

Only one command can be active at a time. If a command is already queued or running, you'll get a 409 Conflict.

### 4. Poll for Results

```
GET https://flipper-bridge.james-e09.workers.dev/api/session/A7X29K/result
Authorization: Bearer chosen-password
```

Possible statuses:
- `queued` — waiting for Flipper to pick it up
- `running` — Flipper is executing it
- `completed` — done, check `result` field
- `error` — execution failed, check `result` for error message
- `timeout` — Flipper didn't respond within 60 seconds
- `none` — no command pending

### 5. End Session

```
DELETE https://flipper-bridge.james-e09.workers.dev/api/session/A7X29K
Authorization: Bearer chosen-password
```

## Command Types

### `subghz` — Transmit Sub-GHz signals

Transmit a Sub-GHz signal from the Flipper's CC1101 radio. The payload can be either inline `.sub` file content or a path to an existing file on the SD card.

**Inline content (preferred):**
```json
{
  "type": "subghz",
  "payload": "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\nPreset: FuriHalSubGhzPresetOok650Async\nProtocol: Princeton\nBit: 24\nKey: 00 00 00 00 00 95 D5 D4\nTE: 400\n"
}
```

**Path to existing file:**
```json
{"type": "subghz", "payload": "/ext/subghz/garage.sub"}
```

#### .sub file format reference

**Key file (known protocol):**
```
Filetype: Flipper SubGhz Key File
Version: 1
Frequency: 433920000
Preset: FuriHalSubGhzPresetOok650Async
Protocol: Princeton
Bit: 24
Key: 00 00 00 00 00 95 D5 D4
TE: 400
```

**RAW file (arbitrary signal):**
```
Filetype: Flipper SubGhz RAW File
Version: 1
Frequency: 433920000
Preset: FuriHalSubGhzPresetOok650Async
Protocol: RAW
RAW_Data: 29262 361 -68 2635 -66 24113 ...
```

Common frequencies: 300000000, 315000000, 390000000, 433920000, 868350000, 915000000

Presets: `FuriHalSubGhzPresetOok270Async`, `FuriHalSubGhzPresetOok650Async`, `FuriHalSubGhzPreset2FSKDev238Async`, `FuriHalSubGhzPreset2FSKDev476Async`

Protocols: Princeton, Nice FLO, CAME, Linear, GateTX, Holtek, etc.

### `write_file` — Write a file to the Flipper's SD card

Write arbitrary file content to any path on the SD card. The payload format is `path\ncontent` — first line is the destination path, everything after the first newline is the file content.

```json
{
  "type": "write_file",
  "payload": "/ext/infrared/tv_power.ir\nFiletype: IR signals file\nVersion: 1\n#\nname: Power\ntype: parsed\nprotocol: NECext\naddress: EE 87 00 00\ncommand: 5D A0 00 00\n"
}
```

Use this to:
- Stage `.ir`, `.sub`, `.nfc`, `.rfid` files on the SD card for manual use
- Write configuration files
- Store data for later retrieval

Parent directories are created automatically.

### `js` — Execute mJS code on the Flipper

Run arbitrary mJS (embedded JavaScript) code on the Flipper. The code runs via `load()` with access to `storage`, `notification`, and `subghz` modules.

```json
{
  "type": "js",
  "payload": "let f = storage.openFile('/ext/test.txt', 'r', 'open_existing');\nlet data = f.read('ascii', 256);\nf.close();\ndata;"
}
```

The last expression's value is returned as the result. Available in the scope:
- `storage` — file I/O (openFile, read, write, remove, makeDirectory, etc.)
- `notification` — success/error buzzer
- `subghz` — Sub-GHz radio (after first subghz command initializes it)

**mJS limitations:** No JSON.parse, no arrow functions, no const, no template literals. Use `var` or `let`. String methods limited to `slice`, `indexOf`, bracket notation.

### `get` — HTTP GET from the Flipper

The Flipper makes an HTTP GET request via its ESP32 WiFi module.

```json
{"type": "get", "payload": "https://api.example.com/data"}
```

### `post` — HTTP POST from the Flipper

The Flipper makes an HTTP request with headers and body via FlipperHTTP.

```json
{
  "type": "post",
  "payload": "{\"url\":\"https://api.example.com/data\",\"headers\":{\"Content-Type\":\"application/json\"},\"payload\":\"{\\\"key\\\":\\\"value\\\"}\"}"
}
```

## What You CAN Do

- **Transmit Sub-GHz signals** — generate and send .sub files (garage doors, smart home, etc.)
- **Write files to the SD card** — stage .ir, .sub, .nfc, .rfid files for manual use
- **Execute mJS code** — read files, manipulate storage, run computations on-device
- **Make HTTP requests** — GET/POST from the Flipper's network position
- **Read device info** — firmware, name, connection status via session endpoint

## What You CANNOT Do (Current Limitations)

- **Transmit IR signals** — no mJS IR module yet (can write .ir files for manual use)
- **Emulate NFC/RFID** — no mJS modules (can write files for manual use)
- **Send Flipper CLI commands** — UART is used by FlipperHTTP
- **Stream data** — polling only (3s intervals)

## Safety Rules

1. **Always confirm before transmitting signals.** Sub-GHz transmission affects the physical world. Confirm frequency, protocol, and intent with the user.
2. **Never send credentials through the relay.** Command payloads are stored temporarily in plaintext.
3. **Sessions are ephemeral.** Auto-expire after 1 hour. Nothing persists.
4. **Rate limits apply.** Max 10 commands/min, 30 polls/min per session.
5. **64KB payload limit.** Large responses truncated to 4000 chars by Flipper memory.

## Example Interactions

**User:** "Transmit this garage door signal at 433MHz"

1. Verify session and device connection
2. Generate the .sub file content with the correct protocol/frequency/key
3. Send as `subghz` command with inline content
4. Poll for result — "OK: transmitted" means success

**User:** "Save this IR remote signal to my Flipper"

1. Generate the .ir file content
2. Send as `write_file` command to `/ext/infrared/remote_name.ir`
3. Tell user the file is saved and they can use it from the Flipper's IR app

**User:** "Read a file from the Flipper's SD card"

1. Send a `js` command that opens and reads the file using `storage`
2. The file content is returned as the result
