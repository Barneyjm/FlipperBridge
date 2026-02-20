// FlipperBridge — Bridge App for Flipper Zero
// GUI version with event-driven polling
// Connects to the FlipperBridge relay via FlipperHTTP (ESP32 WiFi)
// Place at: /ext/apps/Scripts/flipper_bridge.js
// Config at: /ext/apps_data/flipper_bridge/config.txt
//   Line 1: relay URL
//   Line 2: device token (any string 16+ chars)
//   Line 3 (optional): notify=true or notify=false (default: true)

// --- Modules (require all at top — can only call once per module) ---
// Keep count low to avoid OOM (7 modules max safe)
let eventLoop = require("event_loop");
let gui = require("gui");
let dialogView = require("gui/dialog");
let serial = require("serial");
let storage = require("storage");
let notification = require("notification");
let subghz = require("subghz");

// --- Configuration ---
let CONFIG_PATH = "/ext/apps_data/flipper_bridge/config.txt";
let POLL_INTERVAL = 3000;
let TMP_DIR = "/ext/.tmp/js/bridge";
let tmpNumber = 0;

// --- State ---
let state = {
    phase: "welcome",
    running: true,
    deviceToken: "",
    baseUrl: "",
    notifyEnabled: true,
    pollCount: 0,
};

// --- Views ---
let views = {
    dialog: dialogView.makeWith({
        header: "FlipperBridge",
        text: "WiFi Bridge for Claude",
        center: "Start"
    }),
};

// --- JS eval scope (modules available to loaded scripts) ---
let jsScope = {
    storage: storage,
    notification: notification,
};

// --- SubGHz (setup deferred until first use) ---
let subghzReady = false;
function getSubghz() {
    if (!subghzReady) {
        subghz.setup();
        subghzReady = true;
        jsScope.subghz = subghz;
    }
    return subghz;
}

// --- GUI Helpers ---
function showStatus(header, text) {
    views.dialog.set("header", header);
    views.dialog.set("text", text);
    gui.viewDispatcher.switchTo(views.dialog);
}

function notifySuccess() {
    if (state.notifyEnabled) notification.success();
}

function notifyError() {
    if (state.notifyEnabled) notification.error();
}

// --- Serial Setup ---
function setupSerial() {
    serial.setup("usart", 115200);
    delay(500);
}

// --- Serial Helpers ---
function readResponse(timeoutMs) {
    let result = "";
    let chunks = 10;
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
        // Try unquoted value (numbers, booleans, null)
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

    // Find unescaped closing quote (handles \" in values)
    let end = start;
    while (end < json.length) {
        if (json[end] === '\\') {
            end = end + 2;
        } else if (json[end] === '"') {
            break;
        } else {
            end = end + 1;
        }
    }
    if (end >= json.length) return "";

    let rawVal = json.slice(start, end);

    // Fast path: no escapes, return as-is
    if (rawVal.indexOf('\\') === -1) return rawVal;

    // Unescape JSON sequences
    let result = "";
    let ui = 0;
    for (ui = 0; ui < rawVal.length; ui++) {
        if (rawVal[ui] === '\\' && ui + 1 < rawVal.length) {
            let next = rawVal[ui + 1];
            if (next === '"') { result = result + '"'; ui = ui + 1; }
            else if (next === '\\') { result = result + '\\'; ui = ui + 1; }
            else if (next === 'n') { result = result + '\n'; ui = ui + 1; }
            else if (next === 'r') { result = result + '\r'; ui = ui + 1; }
            else if (next === 't') { result = result + '\t'; ui = ui + 1; }
            else { result = result + rawVal[ui]; }
        } else {
            result = result + rawVal[ui];
        }
    }
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

    state.baseUrl = readLine(file);
    state.deviceToken = readLine(file);
    let notifyLine = readLine(file);
    file.close();

    if (notifyLine === "notify=false") {
        state.notifyEnabled = false;
    }

    if (state.baseUrl.length === 0) {
        print("ERROR: Config is empty");
        return false;
    }

    if (state.baseUrl.indexOf("/", state.baseUrl.length - 1) === -1) {
        state.baseUrl = state.baseUrl + "/";
    }

    if (state.deviceToken.length < 16) {
        print("ERROR: Token too short");
        return false;
    }

    print("Relay: " + state.baseUrl);
    return true;
}

// --- HTTP via FlipperHTTP ---
function httpGet(url) {
    serial.write("[GET]" + url + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpPost(url, body) {
    let payload = '{"url":"' + url + '","headers":{"Content-Type":"application/json","X-Device-Token":"' + state.deviceToken + '"},"payload":"' + body + '"}';
    serial.write("[POST/HTTP]" + payload + "\n");
    delay(3000);
    return readResponse(5000);
}

function httpGetWithAuth(url) {
    let payload = '{"url":"' + url + '","headers":{"X-Device-Token":"' + state.deviceToken + '"},"payload":""}';
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
    let url = state.baseUrl + "api/device/register";
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

// --- JS Eval via load() ---
function resultToString(result) {
    if (result === null) return "null";
    if (typeof result === "string") return result;
    if (typeof result === "number") return "" + result;
    if (typeof result === "boolean") return result ? "true" : "false";
    if (typeof result === "undefined") return "undefined";
    if (typeof result === "array") {
        let out = "[";
        let ai = 0;
        for (ai = 0; ai < result.length; ai++) {
            if (ai > 0) out = out + ",";
            out = out + resultToString(result[ai]);
            if (out.length > 3000) {
                out = out + "...(truncated)";
                break;
            }
        }
        return out + "]";
    }
    if (typeof result === "object") return "[object]";
    if (typeof result === "function") return "[function]";
    return "unknown:" + typeof result;
}

function executeJs(code) {
    storage.makeDirectory("/ext/.tmp");
    storage.makeDirectory("/ext/.tmp/js");
    storage.makeDirectory(TMP_DIR);

    let codePath = TMP_DIR + "/" + tmpNumber.toString();
    let resultPath = TMP_DIR + "/r" + tmpNumber.toString();
    tmpNumber = tmpNumber + 1;

    // Remove stale result file
    storage.remove(resultPath);

    let file = storage.openFile(codePath, "w", "create_always");
    if (!file) return "ERROR: Cannot create temp file";
    file.write(code);
    file.close();

    gui.viewDispatcher.sendTo("back");
    let result = load(codePath, jsScope);
    gui.viewDispatcher.sendTo("front");

    storage.remove(codePath);
    return resultToString(result);
}

// --- Execute Command ---
function executeCommand(type, payload) {
    // Rebuild params as local strings (mJS string methods can fail on parameters)
    var cmd = "" + type;
    var p = "" + payload;

    if (cmd === "get") {
        return httpGet(p);
    }

    if (cmd === "post") {
        serial.write("[POST/HTTP]" + p + "\n");
        delay(3000);
        return readResponse(5000);
    }

    if (cmd === "subghz") {
        var txPath;
        var needsCleanup = false;

        if (p.indexOf("/ext/") === 0) {
            // Path to existing file on SD card
            txPath = p;
        } else {
            // Payload is .sub file content — write to temp file
            storage.makeDirectory("/ext/.tmp");
            storage.makeDirectory("/ext/.tmp/js");
            storage.makeDirectory(TMP_DIR);
            txPath = TMP_DIR + "/tx.sub";
            var f = storage.openFile(txPath, "w", "create_always");
            if (!f) return "ERROR: Cannot create tx.sub";
            f.write(p);
            f.close();
            needsCleanup = true;
        }

        var sg = getSubghz();
        var sent = sg.transmitFile(txPath);

        if (needsCleanup) storage.remove(txPath);

        if (sent) return "OK: transmitted";
        return "ERROR: transmit failed";
    }

    if (cmd === "write_file") {
        // Payload format: first line = dest path, rest = content
        var nlIdx = p.indexOf("\n");
        if (nlIdx === -1) return "ERROR: write_file payload must be path\\ncontent";
        var destPath = p.slice(0, nlIdx);
        var content = p.slice(nlIdx + 1);

        // Create parent directories (no lastIndexOf in mJS)
        var lastSlash = -1;
        var si = 0;
        for (si = 0; si < destPath.length; si++) {
            if (destPath[si] === "/") lastSlash = si;
        }
        if (lastSlash > 0) {
            var dir = destPath.slice(0, lastSlash);
            storage.makeDirectory(dir);
        }

        var wf = storage.openFile(destPath, "w", "create_always");
        if (!wf) return "ERROR: Cannot write " + destPath;
        wf.write(content);
        wf.close();
        return "OK: wrote " + destPath;
    }

    if (cmd === "js") {
        return executeJs(p);
    }

    return "ERROR: Unknown type: " + cmd;
}

// --- Submit Result ---
function submitResult(commandId, rawResult) {
    let url = state.baseUrl + "api/device/result";
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
    let url = state.baseUrl + "api/device/poll";
    let resp = httpGetWithAuth(url);

    let commandId = jsonValue(resp, "command_id");
    if (commandId === "" || commandId === "null") {
        state.pollCount = state.pollCount + 1;
        if (state.pollCount % 5 === 0) {
            showStatus("Polling", "Waiting... (" + state.pollCount.toString() + ")\nBack = exit");
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

    showStatus("Working", "...");
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
    state.pollCount = 0;
    showStatus("Polling", "Waiting...\nBack = exit");
}

// --- Startup (blocking) ---
function startup() {
    views.dialog.set("center", "");

    showStatus("Working", "...");
    setupSerial();

    // WiFi
    showStatus("WiFi", "Checking connection...");
    delay(300);

    let wifiOk = false;
    let wifiAttempts = 0;
    while (!wifiOk) {
        showStatus("Working", "...");
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
        return false;
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
        return false;
    }

    showStatus("Config", "OK");
    delay(300);

    // Register
    showStatus("Register", "Connecting to relay...");

    let registered = false;
    let regAttempts = 0;
    while (!registered && regAttempts < 5) {
        showStatus("Working", "...");
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
        return false;
    }

    notifySuccess();
    return true;
}

// --- Entry Point ---

// Event handlers (persist across all eventLoop.run() calls)
eventLoop.subscribe(views.dialog.input, function(_sub, button, state, eventLoop) {
    if (state.phase === "welcome" && button === "center") {
        state.phase = "starting";
        eventLoop.stop();
    }
}, state, eventLoop);

eventLoop.subscribe(gui.viewDispatcher.navigation, function(_sub, _, state, eventLoop) {
    state.running = false;
    eventLoop.stop();
}, state, eventLoop);

// Welcome screen
gui.viewDispatcher.switchTo(views.dialog);
print("FlipperBridge v4.0 — Press Start on screen");
eventLoop.run();

if (state.running) {
    // Blocking startup
    let ok = startup();

    if (ok && state.running) {
        state.phase = "polling";

        // Event-driven poll loop: timer fires every 3s, back button exits
        let pollTimer = eventLoop.timer("periodic", POLL_INTERVAL);
        eventLoop.subscribe(pollTimer, function(_sub, _item) {
            pollOnce();
        });

        showStatus("Ready", "Waiting for commands...\nBack = exit");
        pollOnce();
        eventLoop.run();
    }

    serial.end();
}

storage.rmrf(TMP_DIR);
print("Bridge stopped.");
