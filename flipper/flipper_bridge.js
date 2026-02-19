// FlipperBridge — Bridge App for Flipper Zero
// Connects to the FlipperBridge relay via FlipperHTTP (ESP32 WiFi)
// Place at: /ext/apps/Scripts/flipper_bridge.js
// Config at: /ext/apps_data/flipper_bridge/config.txt
//   Line 1: relay URL
//   Line 2: device token (any string 16+ chars)

// --- Configuration ---
let CONFIG_PATH = "/ext/apps_data/flipper_bridge/config.txt";
let POLL_INTERVAL = 3000;
let RETRY_INTERVAL = 10000;

// --- State ---
let deviceToken = "";
let baseUrl = "";
let running = true;

// --- Modules ---
let serial = require("serial");
let math = require("math");
let storage = require("storage");

function setupSerial() {
    serial.setup("usart", 115200);
    delay(500);
}

// --- Serial Helpers ---
function readResponse(timeoutMs) {
    let result = "";
    let chunks = math.ceil(timeoutMs / 500);
    let i = 0;
    for (i = 0; i < chunks; i++) {
        let chunk = serial.readAny(500);
        if (chunk) {
            result = result + chunk;
        }
    }
    return result;
}

function serialCommand(cmd) {
    serial.write(cmd + "\n");
    delay(2000);
    return readResponse(5000);
}

// --- JSON Helpers (no JSON.parse/stringify in mJS) ---
// mJS only supports: slice, indexOf, at, charCodeAt, s[i], length
function jsonValue(raw, key) {
    let json = "" + raw;
    let search = '"' + key + '":"';
    let start = json.indexOf(search);
    if (start === -1) {
        // Try without quotes around value (for numbers, booleans, null)
        search = '"' + key + '":';
        start = json.indexOf(search);
        if (start === -1) return "";
        start = start + search.length;
        // Skip whitespace
        while (start < json.length && json[start] === " ") {
            start = start + 1;
        }
        let end = json.indexOf(",", start);
        if (end === -1) end = json.indexOf("}", start);
        if (end === -1) return "";
        return json.slice(start, end);
    }
    start = start + search.length;
    let end = json.indexOf('"', start);
    if (end === -1) return "";
    return json.slice(start, end);
}

function buildJson(pairs) {
    let result = "{";
    let i = 0;
    for (i = 0; i < pairs.length; i++) {
        if (i > 0) result = result + ",";
        result = result + '"' + pairs[i][0] + '":"' + pairs[i][1] + '"';
    }
    result = result + "}";
    return result;
}

// --- Read one line from a file ---
function readLine(file) {
    let line = "";
    let buf;
    while (true) {
        buf = file.read("ascii", 1);
        if (!buf || buf.length === 0) break;
        if (buf === "\n") break;
        if (buf !== "\r") {
            line = line + buf;
        }
    }
    return line;
}

// --- Config Loading (URL + token) ---
function loadConfig() {
    let file = storage.openFile(CONFIG_PATH, "r", "open_existing");
    if (!file) {
        print("ERROR: Cannot open config");
        print("Expected at:");
        print(CONFIG_PATH);
        return false;
    }

    // Line 1: relay URL
    baseUrl = readLine(file);
    // Line 2: device token
    deviceToken = readLine(file);
    file.close();

    if (baseUrl.length === 0) {
        print("ERROR: Config is empty");
        return false;
    }

    // Ensure URL ends with /
    if (baseUrl.indexOf("/", baseUrl.length - 1) === -1) {
        baseUrl = baseUrl + "/";
    }

    if (deviceToken.length < 16) {
        print("ERROR: Token too short");
        print("Need 16+ chars on line 2");
        return false;
    }

    print("Relay: " + baseUrl);
    print("Token: ok");
    return true;
}

// --- HTTP via FlipperHTTP ---
function httpGet(url) {
    serial.write("[GET]" + url + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpPost(url, body) {
    let payload = '{"url":"' + url + '","headers":{"Content-Type":"application/json","X-Device-Token":"' + deviceToken + '"},"payload":"' + body + '"}';
    serial.write("[POST/HTTP]" + payload + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpGetWithAuth(url) {
    let payload = '{"url":"' + url + '","headers":{"X-Device-Token":"' + deviceToken + '"},"payload":""}';
    serial.write("[GET/HTTP]" + payload + "\n");
    delay(3000);
    return readResponse(5000);
}

// --- WiFi Check ---
function checkWifi() {
    print("Checking WiFi...");
    let resp = serialCommand("[PING]");
    if (resp.indexOf("PONG") !== -1) {
        print("WiFi: Connected");
        return true;
    }

    print("WiFi: Not connected, attempting...");
    serialCommand("[WIFI/CONNECT]");
    delay(3000);
    resp = serialCommand("[PING]");
    if (resp.indexOf("PONG") !== -1) {
        print("WiFi: Connected");
        return true;
    }

    print("WiFi: FAILED");
    return false;
}

// --- Register with Relay ---
function registerDevice() {
    print("Registering with relay...");
    let url = baseUrl + "api/device/register";
    let escapedBody = '{\\"firmware\\":\\"Momentum\\",\\"name\\":\\"FlipperZero\\"}';

    let resp = httpPost(url, escapedBody);

    if (resp.indexOf("ok") !== -1) {
        let devId = jsonValue(resp, "device_id");
        print("Device ID: " + devId);
        return true;
    }

    print("Register failed:");
    print(resp.slice(0, 100));
    return false;
}

// --- Execute Command ---
function executeCommand(type, payload) {
    if (type === "get") {
        return httpGet(payload);
    }

    if (type === "post") {
        serial.write("[POST/HTTP]" + payload + "\n");
        delay(3000);
        return readResponse(5000);
    }

    if (type === "cli") {
        return "ERROR: CLI commands are not supported over FlipperBridge v1. The UART is used by FlipperHTTP.";
    }

    return "ERROR: Unknown command type: " + type;
}

// --- Poll for Commands ---
function pollOnce() {
    let url = baseUrl + "api/device/poll";
    let resp = httpGetWithAuth(url);

    // Check if there is a command
    let commandId = jsonValue(resp, "command_id");
    if (commandId === "" || commandId === "null") {
        return; // No command pending
    }

    let type = jsonValue(resp, "type");
    let payload = jsonValue(resp, "payload");

    print("CMD: " + type);
    print("  " + payload.slice(0, 60));

    // Execute the command
    let result = executeCommand(type, payload);

    // Truncate result for display
    if (result.length > 80) {
        print("Result: " + result.slice(0, 80) + "...");
    } else {
        print("Result: " + result);
    }

    // Submit result back to relay
    submitResult(commandId, result);
}

function submitResult(commandId, rawResult) {
    let url = baseUrl + "api/device/result";
    let result = "" + rawResult;

    // Double-escape result for two JSON levels:
    // Level 1: FlipperHTTP payload JSON string
    // Level 2: actual POST body JSON sent to relay
    let escaped = "";
    let ri = 0;
    for (ri = 0; ri < result.length; ri++) {
        let ch = result[ri];
        if (ch === "\\") {
            escaped = escaped + "\\\\\\\\";
        } else if (ch === '"') {
            escaped = escaped + '\\\\\\"';
        } else if (ch === "\n") {
            escaped = escaped + "\\\\n";
        } else if (ch === "\r") {
            // skip carriage returns
        } else {
            escaped = escaped + ch;
        }
    }

    // Truncate if too long (mJS memory constraints)
    if (escaped.length > 4000) {
        escaped = escaped.slice(0, 4000) + "...(truncated)";
    }

    let body = '{\\"command_id\\":\\"' + commandId + '\\",\\"result\\":\\"' + escaped + '\\"}';
    httpPost(url, body);
}

// --- Main ---
function main() {
    print("=== FlipperBridge ===");
    print("v2.1");
    print("");

    setupSerial();

    // Check WiFi
    let wifiOk = false;
    while (!wifiOk) {
        wifiOk = checkWifi();
        if (!wifiOk) {
            print("Retry in 10s...");
            delay(RETRY_INTERVAL);
        }
    }

    // Load config (URL + token)
    if (!loadConfig()) {
        print("Fix config and restart.");
        serial.end();
        return;
    }

    print("");

    // Register device
    let registered = false;
    let attempts = 0;
    while (!registered && attempts < 5) {
        registered = registerDevice();
        if (!registered) {
            attempts = attempts + 1;
            print("Retry " + attempts.toString() + "/5...");
            delay(5000);
        }
    }

    if (!registered) {
        print("FAILED to register.");
        serial.end();
        return;
    }

    print("");
    print("Waiting for session...");
    print("(polling every " + (POLL_INTERVAL / 1000).toString() + "s)");

    // Main poll loop
    while (running) {
        pollOnce();
        delay(POLL_INTERVAL);
    }

    serial.end();
    print("Bridge stopped.");
}

main();
