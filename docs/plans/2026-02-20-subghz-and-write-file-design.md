# SubGHz Transmission & File Writing Support

## Problem

The bridge advertises SubGHz support but it has never been tested and has a critical OOM risk. The bridge loads 7 mJS modules (the safe max), and lazy-loading `subghz` as #8 will likely crash. The two-step workflow (write file via `js` command, then transmit via `subghz` command) is also unnecessarily fragile.

## Design

### Bridge (`flipper_bridge.js`)

**Free a module slot:** Drop `require("math")`. Its only use is `math.ceil(timeoutMs / 500)` in `readResponse()`, which always resolves to 10. Hardcode that value. Remove `math` from `jsScope`.

Module count: 6 at startup, 7 after lazy-loading `subghz`.

**Rewrite `subghz` handler:** Accept file content as the payload. The bridge writes it to a temp file, transmits, and cleans up. If the payload starts with `/ext/`, treat it as a path to an existing file and transmit directly.

**Add `write_file` handler:** Payload format is `path\ncontent` (first line = destination path, rest = file content). Writes the file and returns OK. Useful for staging IR/NFC/RFID files for future use when mJS modules become available.

**Drop `cli` handler:** It only returns an error message. Remove dead code.

### Relay (`relay/src/routes/command.js`)

- Update `VALID_COMMAND_TYPES` to `['get', 'post', 'subghz', 'js', 'write_file']`
- Fix error message to list all valid types

No other relay changes needed -- it is a passthrough that queues commands for the Flipper.

## Command Types Summary

| Type | Payload | What happens |
|------|---------|-------------|
| `get` | URL | HTTP GET via FlipperHTTP |
| `post` | FlipperHTTP JSON | HTTP POST via FlipperHTTP |
| `subghz` | .sub file content OR `/ext/...` path | Write temp file + transmit, or transmit existing file |
| `js` | mJS code | Write to temp file, execute via `load()` |
| `write_file` | `path\ncontent` | Write file to SD card |
