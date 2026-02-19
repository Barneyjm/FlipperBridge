# FlipperBridge — Claude Skill

## What This Is

FlipperBridge lets you send commands to a user's Flipper Zero device over the internet. The Flipper connects to a cloud relay via WiFi (ESP32 + FlipperHTTP), and you interact with the relay's API to send commands and receive results.

**Architecture:** Claude → Relay API → Internet → ESP32 WiFi → Flipper Zero

## Prerequisites

The user must have:
1. A Flipper Zero with Momentum firmware
2. An ESP32 WiFi module with FlipperHTTP firmware installed
3. The `flipper_bridge.js` app running on the Flipper (auto-registers on first launch)
4. A config file on the Flipper with just the relay URL

## Session Workflow

### 1. Get Session Credentials from the User

The user creates a session from the relay's landing page (or you can create one via API if they give you their device ID). Ask the user for:
- **Session ID** (6 characters, e.g., `A7X29K`)
- **Password** (they chose this when creating the session)

Or, if the user provides their device ID, create a session:

```
POST https://flipperbridge.dev/api/session
Content-Type: application/json

{"device_id": "a1b2c3d4", "password": "user-chosen-password"}
```

Response:
```json
{"session_id": "A7X29K"}
```

### 2. Verify Flipper is Connected

```
GET https://flipperbridge.dev/api/session/A7X29K
Authorization: Bearer user-chosen-password
```

Check `device_connected` in the response. Once `true`, the Flipper is online and ready. The `device_info` field shows the device name and firmware.

### 3. Send Commands

```
POST https://flipperbridge.dev/api/session/A7X29K/command
Authorization: Bearer user-chosen-password
Content-Type: application/json

{"type": "get", "payload": "https://httpbin.org/ip"}
```

Only one command can be active at a time. If a command is already queued or running, you'll get a 409 Conflict.

### 4. Poll for Results

```
GET https://flipperbridge.dev/api/session/A7X29K/result
Authorization: Bearer user-chosen-password
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
DELETE https://flipperbridge.dev/api/session/A7X29K
Authorization: Bearer user-chosen-password
```

## Command Types

### `get` — HTTP GET from the Flipper

The Flipper makes an HTTP GET request to the specified URL and returns the response.

```json
{"type": "get", "payload": "https://api.example.com/data"}
```

Use this for:
- Fetching data from APIs on the Flipper's local network
- Checking the Flipper's public IP
- Accessing local network resources (e.g., `http://192.168.1.1/status`)

### `post` — HTTP POST/PUT/DELETE from the Flipper

The Flipper makes an HTTP request with headers and body. The payload is a JSON string matching the FlipperHTTP format:

```json
{
  "type": "post",
  "payload": "{\"url\":\"https://api.example.com/data\",\"headers\":{\"Content-Type\":\"application/json\"},\"payload\":\"{\\\"key\\\":\\\"value\\\"}\"}"
}
```

The inner payload structure:
```json
{
  "url": "https://...",
  "headers": {"Content-Type": "application/json"},
  "payload": "{\"key\":\"value\"}"
}
```

### `cli` — NOT SUPPORTED in v1

CLI commands like `nfc detect`, `ir rx`, `subghz rx`, etc. cannot be sent through FlipperBridge v1. The UART connection is used by FlipperHTTP for WiFi, so there is no channel available for Flipper CLI commands.

If the user asks for CLI-style Flipper commands, explain this limitation and suggest they use the Flipper directly or wait for a future version that supports CLI passthrough.

## What You CAN Do

- Make HTTP GET/POST/PUT/DELETE requests from the Flipper's IP address and network
- Access local network resources through the Flipper
- Read Flipper device info (firmware, name) via the session status
- Check the Flipper's WiFi status

## What You CANNOT Do (v1 Limitations)

- Send Flipper CLI commands (nfc, ir, subghz, rfid, gpio, etc.)
- Execute arbitrary JavaScript on the Flipper
- Access Flipper's storage directly
- Use SubGHz radio, NFC, RFID, or IR through the bridge
- Stream data or maintain persistent connections (polling only)

## Safety Rules

1. **Always confirm before sending commands that could affect external systems.** If the user asks you to POST to an API, confirm the target URL and payload before sending.
2. **Never send credentials or sensitive data through the relay.** The relay stores command payloads temporarily in plaintext. Don't relay passwords, API keys, or tokens.
3. **Sessions are ephemeral.** They auto-expire after 1 hour of inactivity. Remind the user that nothing persists.
4. **Rate limits apply.** Maximum 10 commands per minute per session. Space out requests if doing bulk operations.
5. **64KB payload limit.** Large responses will be truncated by the Flipper's limited memory.

## Interpreting Results

FlipperHTTP responses typically include status info:
- Success: The response body from the HTTP request
- Errors: Prefixed with `[ERROR]` — could be network issues, DNS failures, or HTTP errors
- Timeouts: The Flipper didn't get a response within its timeout window

Parse the result and explain it naturally to the user. If the response is JSON, format and explain the relevant fields.

## Example Interaction

**User:** "Can you check what my Flipper's public IP is?"

1. Ask user for session ID and password (they create sessions from the landing page)
2. Verify device is connected
3. Send command: `{"type": "get", "payload": "https://httpbin.org/ip"}`
4. Poll for result
5. Parse and share: "Your Flipper's public IP is 203.0.113.42"

**User:** "Can you scan my local network from the Flipper?"

Explain that while you can make HTTP requests to local IPs (e.g., `http://192.168.1.1`), you cannot do a full network scan. You could try requesting common local addresses to check for responses.

**User:** "Can you read an NFC tag?"

Explain that NFC commands require CLI access, which isn't available in FlipperBridge v1. They'll need to use the Flipper directly for NFC operations.
