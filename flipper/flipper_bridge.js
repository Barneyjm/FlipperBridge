// FlipperBridge — Bridge App for Flipper Zero
// GUI version with dialog/loading views
// Connects to the FlipperBridge relay via FlipperHTTP (ESP32 WiFi)
// Place at: /ext/apps/Scripts/flipper_bridge.js
// Config at: /ext/apps_data/flipper_bridge/config.txt
//   Line 1: relay URL
//   Line 2: device token (any string 16+ chars)
//   Line 3 (optional): notify=true or notify=false (default: true)

// --- Modules (require all at top — can only call once per module) ---
let eventLoop = require("event_loop");
let gui = require("gui");
let dialogView = require("gui/dialog");
let loadingView = require("gui/loading");
let serial = require("serial");
let math = require("math");
let storage = require("storage");
let notification = require("notification");

// --- Configuration ---
let CONFIG_PATH = "/ext/apps_data/flipper_bridge/config.txt";
let POLL_INTERVAL = 3000;

// --- State ---
let deviceToken = "";
let baseUrl = "";
let notifyEnabled = true;
let running = true;
let pollCount = 0;

// --- Views ---
let views = {
    dialog: dialogView.makeWith({
        header: "FlipperBridge",
        text: "WiFi Bridge for Claude",
        center: "Start"
    }),
    loading: loadingView.make(),
};

// --- GUI Helpers ---
function showStatus(header, text) {
    views.dialog.set("header", header);
    views.dialog.set("text", text);
    gui.viewDispatcher.switchTo(views.dialog);
}

function showLoading() {
    gui.viewDispatcher.switchTo(views.loading);
}

function notifySuccess() {
    if (notifyEnabled) notification.success();
}

function notifyError() {
    if (notifyEnabled) notification.error();
}

// --- Serial Setup ---
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
function jsonValue(raw, key) {
    let json = "" + raw;
    let search = '"' + key + '":"';
    let start = json.indexOf(search);
    if (start === -1) {
        search = '"' + key + '":';
        start = json.indexOf(search);
        if (start === -1) return "";
        start = start + search.length;
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

// --- Config Loading ---
function loadConfig() {
    let file = storage.openFile(CONFIG_PATH, "r", "open_existing");
    if (!file) {
        print("ERROR: Cannot open config");
        return false;
    }

    baseUrl = readLine(file);
    deviceToken = readLine(file);
    let notifyLine = readLine(file);
    file.close();

    if (notifyLine === "notify=false") {
        notifyEnabled = false;
    }

    if (baseUrl.length === 0) {
        print("ERROR: Config is empty");
        return false;
    }

    if (baseUrl.indexOf("/", baseUrl.length - 1) === -1) {
        baseUrl = baseUrl + "/";
    }

    if (deviceToken.length < 16) {
        print("ERROR: Token too short");
        return false;
    }

    print("Relay: " + baseUrl);
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

    print("WiFi: Connecting...");
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
    print("Registering...");
    let url = baseUrl + "api/device/register";
    let escapedBody = '{\\"firmware\\":\\"Momentum\\",\\"name\\":\\"FlipperZero\\"}';

    let resp = httpPost(url, escapedBody);

    if (resp.indexOf("ok") !== -1) {
        let devId = jsonValue(resp, "device_id");
        print("Device: " + devId);
        return true;
    }

    print("Register failed");
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
        return "ERROR: CLI not supported. UART used by FlipperHTTP.";
    }

    return "ERROR: Unknown type: " + type;
}

// --- Submit Result ---
function submitResult(commandId, rawResult) {
    let url = baseUrl + "api/device/result";
    let result = "" + rawResult;

    // Double-escape for two JSON levels (FlipperHTTP + POST body)
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
            // skip
        } else {
            escaped = escaped + ch;
        }
    }

    if (escaped.length > 4000) {
        escaped = escaped.slice(0, 4000) + "...(truncated)";
    }

    let body = '{\\"command_id\\":\\"' + commandId + '\\",\\"result\\":\\"' + escaped + '\\"}';
    httpPost(url, body);
}

// --- Poll for Commands ---
function pollOnce() {
    let url = baseUrl + "api/device/poll";
    let resp = httpGetWithAuth(url);

    let commandId = jsonValue(resp, "command_id");
    if (commandId === "" || commandId === "null") {
        pollCount = pollCount + 1;
        if (pollCount % 5 === 0) {
            showStatus("Polling", "Waiting... (" + pollCount.toString() + ")");
        }
        return;
    }

    let type = jsonValue(resp, "type");
    let payload = jsonValue(resp, "payload");

    notifySuccess();

    let shortPayload = payload;
    if (shortPayload.length > 30) {
        shortPayload = shortPayload.slice(0, 30) + "...";
    }
    showStatus("Command", type + "\n" + shortPayload);
    print("CMD: " + type + " " + payload.slice(0, 60));

    showLoading();
    let result = executeCommand(type, payload);

    let preview = result.slice(0, 40);
    if (result.length > 40) {
        preview = preview + "...";
    }

    notifySuccess();
    showStatus("Done", preview);
    print("Result: " + result.slice(0, 80));

    submitResult(commandId, result);

    delay(2000);
    pollCount = 0;
    showStatus("Polling", "Waiting...");
}

// --- Main Run Function ---
function run() {
    views.dialog.set("center", "");

    // Serial setup
    showLoading();
    setupSerial();

    // WiFi
    showStatus("WiFi", "Checking connection...");
    delay(300);

    let wifiOk = false;
    let wifiAttempts = 0;
    while (!wifiOk) {
        showLoading();
        wifiOk = checkWifi();
        if (!wifiOk) {
            wifiAttempts = wifiAttempts + 1;
            if (wifiAttempts >= 5) break;
            showStatus("WiFi", "Retry " + wifiAttempts.toString() + "/5...");
            delay(10000);
        }
    }

    if (!wifiOk) {
        notifyError();
        showStatus("Error", "WiFi failed after 5 tries");
        delay(5000);
        return;
    }

    showStatus("WiFi", "Connected!");
    delay(500);

    // Config
    showStatus("Config", "Loading...");
    delay(300);

    if (!loadConfig()) {
        notifyError();
        showStatus("Error", "Bad config.\nCheck config.txt");
        delay(5000);
        return;
    }

    showStatus("Config", "OK");
    delay(300);

    // Register
    showStatus("Register", "Connecting to relay...");

    let registered = false;
    let regAttempts = 0;
    while (!registered && regAttempts < 5) {
        showLoading();
        registered = registerDevice();
        if (!registered) {
            regAttempts = regAttempts + 1;
            showStatus("Register", "Retry " + regAttempts.toString() + "/5...");
            delay(5000);
        }
    }

    if (!registered) {
        notifyError();
        showStatus("Error", "Registration failed");
        delay(5000);
        return;
    }

    notifySuccess();
    showStatus("Ready", "Waiting for commands...");

    // Main poll loop
    while (running) {
        pollOnce();
        delay(POLL_INTERVAL);
    }
}

// --- Entry Point ---

// Welcome screen event handlers
eventLoop.subscribe(views.dialog.input, function(_sub, button, eventLoop) {
    if (button === "center") {
        running = true;
        eventLoop.stop();
    }
}, eventLoop);

eventLoop.subscribe(gui.viewDispatcher.navigation, function(_sub, _, eventLoop) {
    running = false;
    eventLoop.stop();
}, eventLoop);

// Show welcome
gui.viewDispatcher.switchTo(views.dialog);
print("FlipperBridge v3.0 — Press Start on screen");
eventLoop.run();

if (running) {
    run();
    serial.end();
}

print("Bridge stopped.");
