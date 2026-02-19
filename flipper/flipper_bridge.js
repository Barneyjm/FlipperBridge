// FlipperBridge — Bridge App for Flipper Zero
// Connects to the FlipperBridge relay via FlipperHTTP (ESP32 WiFi)
// Place at: /ext/apps/Scripts/flipper_bridge.js
// Config at: /ext/apps_data/flipper_bridge/config.txt

// --- Configuration ---
let CONFIG_PATH = "/ext/apps_data/flipper_bridge/config.txt";
let POLL_INTERVAL = 3000;
let RETRY_INTERVAL = 10000;

// --- State ---
let sessionId = "";
let deviceKey = "";
let baseUrl = "";
let running = true;

// --- Serial Setup ---
let serial = require("serial");

function setupSerial() {
    serial.setup("usart", 115200);
    delay(500);
}

// --- Serial Helpers ---
function readResponse(timeoutMs) {
    let result = "";
    let chunks = Math.ceil(timeoutMs / 500);
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
function jsonValue(json, key) {
    let search = '"' + key + '":"';
    let start = json.indexOf(search);
    if (start === -1) {
        // Try without quotes around value (for numbers, booleans, null)
        search = '"' + key + '":';
        start = json.indexOf(search);
        if (start === -1) return "";
        start = start + search.length;
        // Skip whitespace
        while (start < json.length && json.substring(start, start + 1) === " ") {
            start = start + 1;
        }
        let end = json.indexOf(",", start);
        if (end === -1) end = json.indexOf("}", start);
        if (end === -1) return "";
        return json.substring(start, end);
    }
    start = start + search.length;
    let end = json.indexOf('"', start);
    if (end === -1) return "";
    return json.substring(start, end);
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

// --- Config Loading ---
function loadConfig() {
    // Read config file using storage module
    let storage = require("storage");
    let file = storage.openFile(CONFIG_PATH, "r", "open_existing");
    if (!file) {
        print("ERROR: Cannot open config file");
        print("Expected at:");
        print(CONFIG_PATH);
        return false;
    }

    let content = "";
    let buf;
    while (true) {
        buf = file.read("ascii", 128);
        if (!buf || buf.length === 0) break;
        content = content + buf;
    }
    file.close();

    if (content.length === 0) {
        print("ERROR: Config file is empty");
        return false;
    }

    // Parse three lines: sessionId, deviceKey, baseUrl
    let firstNewline = content.indexOf("\n");
    if (firstNewline === -1) {
        print("ERROR: Invalid config format");
        return false;
    }
    sessionId = content.substring(0, firstNewline);

    let rest = content.substring(firstNewline + 1, content.length);
    let secondNewline = rest.indexOf("\n");
    if (secondNewline === -1) {
        print("ERROR: Invalid config format");
        return false;
    }
    deviceKey = rest.substring(0, secondNewline);

    let rest2 = rest.substring(secondNewline + 1, rest.length);
    // Trim trailing newline if present
    let thirdNewline = rest2.indexOf("\n");
    if (thirdNewline !== -1) {
        baseUrl = rest2.substring(0, thirdNewline);
    } else {
        baseUrl = rest2;
    }

    // Strip trailing carriage returns (Windows line endings)
    if (sessionId.indexOf("\r") !== -1) {
        sessionId = sessionId.substring(0, sessionId.indexOf("\r"));
    }
    if (deviceKey.indexOf("\r") !== -1) {
        deviceKey = deviceKey.substring(0, deviceKey.indexOf("\r"));
    }
    if (baseUrl.indexOf("\r") !== -1) {
        baseUrl = baseUrl.substring(0, baseUrl.indexOf("\r"));
    }

    print("Session: " + sessionId);
    print("Relay:   " + baseUrl);
    return true;
}

// --- HTTP via FlipperHTTP ---
function httpGet(url) {
    serial.write("[GET]" + url + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpPost(url, body) {
    let payload = '{"url":"' + url + '","headers":{"Content-Type":"application/json","X-Device-Key":"' + deviceKey + '"},"payload":"' + body + '"}';
    serial.write("[POST/HTTP]" + payload + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpGetWithAuth(url) {
    let payload = '{"url":"' + url + '","headers":{"X-Device-Key":"' + deviceKey + '"},"payload":""}';
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
    let url = baseUrl + "/api/device/" + sessionId + "/register";
    // Build a simple body — escape quotes for nested JSON
    let body = buildJson([
        ["firmware", "Momentum"],
        ["name", "FlipperZero"]
    ]);

    // Need to escape the body for the outer JSON
    let escapedBody = "";
    let ci = 0;
    for (ci = 0; ci < body.length; ci++) {
        let ch = body.substring(ci, ci + 1);
        if (ch === '"') {
            escapedBody = escapedBody + '\\"';
        } else {
            escapedBody = escapedBody + ch;
        }
    }

    let resp = httpPost(url, escapedBody);

    if (resp.indexOf("ok") !== -1) {
        print("Registered OK");
        return true;
    }

    print("Register failed:");
    print(resp.substring(0, 100));
    return false;
}

// --- Execute Command ---
function executeCommand(type, payload) {
    if (type === "get") {
        return httpGet(payload);
    }

    if (type === "post") {
        // Payload is already a JSON string for POST/HTTP
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
    let url = baseUrl + "/api/device/" + sessionId + "/poll";
    let resp = httpGetWithAuth(url);

    // Check if there is a command
    let commandId = jsonValue(resp, "command_id");
    if (commandId === "" || commandId === "null") {
        return; // No command pending
    }

    let type = jsonValue(resp, "type");
    let payload = jsonValue(resp, "payload");

    print("CMD: " + type);
    print("  " + payload.substring(0, 60));

    // Execute the command
    let result = executeCommand(type, payload);

    // Truncate result for display
    if (result.length > 80) {
        print("Result: " + result.substring(0, 80) + "...");
    } else {
        print("Result: " + result);
    }

    // Submit result back to relay
    submitResult(commandId, result);
}

function submitResult(commandId, result) {
    let url = baseUrl + "/api/device/" + sessionId + "/result";

    // Escape result for JSON embedding
    let escaped = "";
    let ri = 0;
    for (ri = 0; ri < result.length; ri++) {
        let ch = result.substring(ri, ri + 1);
        if (ch === '"') {
            escaped = escaped + '\\"';
        } else if (ch === "\n") {
            escaped = escaped + "\\n";
        } else if (ch === "\r") {
            // skip carriage returns
        } else {
            escaped = escaped + ch;
        }
    }

    // Truncate if too long (mJS memory constraints)
    if (escaped.length > 4000) {
        escaped = escaped.substring(0, 4000) + "...(truncated)";
    }

    let body = '{\\"command_id\\":\\"' + commandId + '\\",\\"result\\":\\"' + escaped + '\\"}';
    httpPost(url, body);
}

// --- Main ---
function main() {
    print("=== FlipperBridge ===");
    print("v1.0");
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

    // Load config
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
            print("Retry " + to_string(attempts) + "/5...");
            delay(5000);
        }
    }

    if (!registered) {
        print("FAILED to register.");
        print("Check session ID & key.");
        serial.end();
        return;
    }

    print("");
    print("Polling for commands...");
    print("(every " + to_string(POLL_INTERVAL / 1000) + "s)");

    // Main poll loop
    while (running) {
        pollOnce();
        delay(POLL_INTERVAL);
    }

    serial.end();
    print("Bridge stopped.");
}

main();
