/**
 * Landing page for FlipperBridge.
 */

import { corsHeaders } from '../utils.js';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlipperBridge</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      max-width: 780px;
      width: 100%;
      padding: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      margin: 2rem 0 0.5rem;
      color: #ff8c00;
    }
    h1 span { color: #58a6ff; }
    .subtitle {
      color: #8b949e;
      font-size: 1.1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card h2 {
      color: #ff8c00;
      font-size: 1.2rem;
      margin-bottom: 0.75rem;
    }
    .card p, .card li {
      color: #8b949e;
      line-height: 1.6;
    }
    .card ul {
      list-style: none;
      padding: 0;
    }
    .card li::before {
      content: "\\25B8 ";
      color: #ff8c00;
    }
    input[type="password"], input[type="text"], textarea, select {
      background: #0d1117;
      border: 1px solid #30363d;
      color: #e6edf3;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 1rem;
      width: 100%;
      font-family: monospace;
    }
    input[type="password"] { max-width: 300px; margin-bottom: 1rem; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #ff8c00; }
    select { cursor: pointer; }
    select option { background: #0d1117; color: #e6edf3; }
    textarea { resize: vertical; min-height: 60px; }
    button {
      background: #ff8c00;
      color: #0d1117;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      font-family: monospace;
    }
    button:hover { background: #ffaa33; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm {
      padding: 0.4rem 1rem;
      font-size: 0.85rem;
    }
    .btn-secondary {
      background: #30363d;
      color: #e6edf3;
    }
    .btn-secondary:hover { background: #484f58; }
    .btn-danger {
      background: #da3633;
      color: #e6edf3;
    }
    .btn-danger:hover { background: #f85149; }
    .btn-success {
      background: #238636;
      color: #e6edf3;
    }
    .btn-success:hover { background: #2ea043; }
    code {
      background: #0d1117;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
      color: #ff8c00;
    }
    .status-indicator {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 0.5rem;
      vertical-align: middle;
    }
    .status-indicator.connected { background: #3fb950; }
    .status-indicator.waiting { background: #d29922; animation: pulse 1.5s infinite; }
    .status-indicator.disconnected { background: #f85149; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .device-list { min-height: 60px; }
    .device-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }
    .device-info { flex: 1; }
    .device-name {
      color: #e6edf3;
      font-weight: 600;
      font-size: 1rem;
    }
    .device-meta {
      color: #8b949e;
      font-size: 0.8rem;
      margin-top: 0.2rem;
    }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-available { background: #238636; color: #e6edf3; }
    .badge-busy { background: #9e6a03; color: #e6edf3; }
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #484f58;
    }
    .session-form {
      text-align: center;
      padding: 1rem 0;
      display: none;
    }
    .session-form.show { display: block; }
    .session-form-target {
      color: #58a6ff;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }
    .footer {
      margin-top: 2rem;
      padding: 1rem;
      text-align: center;
      color: #484f58;
      font-size: 0.85rem;
    }
    .architecture {
      font-family: monospace;
      font-size: 0.85rem;
      color: #8b949e;
      text-align: center;
      padding: 1rem;
      line-height: 1.8;
    }

    /* --- Control Panel styles --- */
    .panel { display: none; }
    .panel.show { display: block; }

    .session-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      margin-bottom: 1rem;
    }
    .session-bar-left {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .session-id-display {
      font-size: 1.4rem;
      font-weight: bold;
      color: #58a6ff;
      letter-spacing: 0.2em;
      cursor: pointer;
    }
    .session-id-display:hover { color: #79c0ff; }
    .copied-toast {
      font-size: 0.75rem;
      color: #3fb950;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .copied-toast.show { opacity: 1; }

    .cmd-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .cmd-row select { flex: 0 0 120px; }
    .cmd-row input { flex: 1; }
    .cmd-body { margin-bottom: 0.75rem; }
    .cmd-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .cmd-status {
      color: #8b949e;
      font-size: 0.85rem;
      margin-left: 0.5rem;
    }

    .result-box {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      margin-top: 1rem;
      display: none;
    }
    .result-box.show { display: block; }
    .result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .result-label { color: #8b949e; font-size: 0.85rem; }
    .result-badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .result-badge.queued { background: #30363d; color: #8b949e; }
    .result-badge.running { background: #9e6a03; color: #e6edf3; }
    .result-badge.completed { background: #238636; color: #e6edf3; }
    .result-badge.error { background: #da3633; color: #e6edf3; }
    .result-badge.timeout { background: #da3633; color: #e6edf3; }
    .result-content {
      background: #010409;
      border: 1px solid #21262d;
      border-radius: 4px;
      padding: 0.75rem;
      font-family: monospace;
      font-size: 0.85rem;
      color: #e6edf3;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }
    .result-content.error-text { color: #f85149; }

    .history-list { max-height: 400px; overflow-y: auto; }
    .history-item {
      padding: 0.75rem;
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }
    .history-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.25rem;
    }
    .history-cmd {
      font-family: monospace;
      font-size: 0.85rem;
      color: #e6edf3;
    }
    .history-cmd .cmd-type {
      color: #ff8c00;
      font-weight: 600;
      margin-right: 0.5rem;
    }
    .history-time {
      color: #484f58;
      font-size: 0.75rem;
    }
    .history-result {
      font-family: monospace;
      font-size: 0.8rem;
      color: #8b949e;
      margin-top: 0.25rem;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 100px;
      overflow-y: auto;
    }
    .history-result.error-text { color: #f85149; }
    .history-empty {
      text-align: center;
      padding: 1.5rem;
      color: #484f58;
      font-size: 0.85rem;
    }

    .quick-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }
    .quick-actions button {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Flipper<span>Bridge</span></h1>
    <p class="subtitle">Cloud relay for controlling your Flipper Zero through Claude</p>

    <div class="architecture">
      Claude &nbsp;&#8596;&nbsp; Relay (this server) &nbsp;&#8596;&nbsp; WiFi &nbsp;&#8596;&nbsp; Flipper Zero
    </div>

    <!-- ===== Token Entry ===== -->
    <div class="card" id="tokenCard">
      <h2>Connect to Your Device</h2>
      <p style="color:#8b949e;margin-bottom:1rem;">Enter the device token from line 2 of your Flipper's config.txt</p>
      <input type="password" id="deviceToken" placeholder="Device token" />
      <br>
      <button onclick="connectWithToken()">Connect</button>
    </div>

    <!-- ===== Device List ===== -->
    <div class="card" id="deviceCard" style="display:none;">
      <h2>Device <button class="btn-sm btn-secondary" onclick="loadDevices()" style="margin-left:0.5rem;vertical-align:middle;">Refresh</button></h2>
      <div class="device-list" id="deviceList">
        <div class="empty-state">Loading...</div>
      </div>
    </div>

    <!-- ===== Session Creation Form ===== -->
    <div class="card session-form" id="sessionForm">
      <h2>Create Session</h2>
      <p class="session-form-target">for <span id="targetDeviceName"></span> (<span id="targetDeviceIdDisplay"></span>)</p>
      <input type="hidden" id="targetDeviceId" />
      <input type="password" id="password" placeholder="Session password (min 4 chars)" />
      <br>
      <button id="createBtn" onclick="createSession()">Create Session</button>
      <button class="btn-sm btn-secondary" onclick="cancelSession()" style="margin-left:0.5rem;">Cancel</button>
    </div>

    <!-- ===== Session Control Panel (shown after session created) ===== -->
    <div class="panel" id="controlPanel">

      <!-- Session Info Bar -->
      <div class="card">
        <div class="session-bar">
          <div class="session-bar-left">
            <span class="session-id-display" id="panelSessionId" title="Click to copy" onclick="copySessionId()"></span>
            <span class="copied-toast" id="copiedToast">Copied!</span>
            <span>
              <span class="status-indicator waiting" id="statusDot"></span>
              <span id="statusText" style="font-size:0.9rem;">Connecting...</span>
            </span>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn-sm btn-secondary" onclick="showCredentials()">Share Info</button>
            <button class="btn-sm btn-danger" onclick="endSession()">End Session</button>
          </div>
        </div>
      </div>

      <!-- Command Console -->
      <div class="card">
        <h2>Send Command</h2>
        <div class="quick-actions">
          <button class="btn-sm btn-secondary" onclick="quickCmd('cli','info')">Device Info</button>
          <button class="btn-sm btn-secondary" onclick="quickCmd('cli','!uptime')">Uptime</button>
          <button class="btn-sm btn-secondary" onclick="quickCmd('cli','!power info')">Battery</button>
          <button class="btn-sm btn-secondary" onclick="quickCmd('cli','!storage list /ext')">List /ext</button>
        </div>
        <div class="cmd-row">
          <select id="cmdType">
            <option value="cli">CLI</option>
            <option value="get">GET</option>
            <option value="post">POST</option>
          </select>
          <input type="text" id="cmdPayload" placeholder="Command or URL..." onkeydown="if(event.key==='Enter')sendCommand()" />
        </div>
        <div class="cmd-body" id="cmdBodyRow" style="display:none;">
          <textarea id="cmdBody" placeholder="POST body (JSON)..." rows="3"></textarea>
        </div>
        <div class="cmd-actions">
          <button id="sendBtn" onclick="sendCommand()">Send</button>
          <span class="cmd-status" id="cmdStatus"></span>
        </div>

        <!-- Live Result -->
        <div class="result-box" id="resultBox">
          <div class="result-header">
            <span class="result-label">Result</span>
            <span class="result-badge" id="resultBadge"></span>
          </div>
          <div class="result-content" id="resultContent"></div>
        </div>
      </div>

      <!-- Command History -->
      <div class="card">
        <h2>History <button class="btn-sm btn-secondary" onclick="clearHistory()" style="margin-left:0.5rem;vertical-align:middle;">Clear</button></h2>
        <div class="history-list" id="historyList">
          <div class="history-empty">No commands sent yet</div>
        </div>
      </div>
    </div>

    <!-- ===== Info cards (hidden when session active) ===== -->
    <div id="infoCards">
      <div class="card">
        <h2>Setup Instructions</h2>
        <ul>
          <li>Install <a href="https://github.com/jblanked/FlipperHTTP" style="color:#58a6ff">FlipperHTTP</a> firmware on your ESP32 module</li>
          <li>Copy <code>flipper_bridge.js</code> to <code>/ext/apps/Scripts/</code> on your Flipper SD card</li>
          <li>Create config at <code>/ext/apps_data/flipper_bridge/config.txt</code> (see format below)</li>
          <li>Run the bridge app on your Flipper &mdash; it will register with the relay</li>
          <li>Enter your device token above to see your device and create a session</li>
          <li>Tell Claude the session ID and password to start sending commands</li>
        </ul>
      </div>

      <div class="card">
        <h2>Config File Format</h2>
        <p>Create <code>/ext/apps_data/flipper_bridge/config.txt</code> with two lines:</p>
        <pre style="margin-top:0.5rem;color:#e6edf3;background:#0d1117;padding:0.75rem;border-radius:4px;font-size:0.9rem;line-height:1.6;"><span style="color:#58a6ff">https://your-relay-url.dev/</span>  &larr; Relay URL
<span style="color:#ff8c00">your-secret-token-here</span>     &larr; Device token (16+ chars)</pre>
      </div>

      <div class="card">
        <h2>What Can It Do?</h2>
        <ul>
          <li>Make HTTP requests from the Flipper's network</li>
          <li>Let Claude interact with local network devices through the Flipper</li>
          <li>Read Flipper device info (firmware version, name)</li>
          <li>Sessions are ephemeral &mdash; auto-expire after 1 hour of inactivity</li>
          <li>Device tokens persist across sessions &mdash; no reconfiguration needed</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      FlipperBridge is open source. Sessions auto-expire after 1 hour of inactivity.
    </div>
  </div>

  <!-- Credentials modal -->
  <div id="credModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:none;align-items:center;justify-content:center;">
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;max-width:420px;width:90%;">
      <h2 style="color:#ff8c00;margin-bottom:1rem;font-size:1.1rem;">Session Credentials</h2>
      <p style="color:#8b949e;font-size:0.85rem;margin-bottom:0.75rem;">Give these to Claude to start controlling your Flipper:</p>
      <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:1rem;font-family:monospace;font-size:0.9rem;margin-bottom:1rem;">
        <div style="color:#8b949e;font-size:0.75rem;">Session ID</div>
        <div id="modalSessionId" style="color:#58a6ff;font-size:1.3rem;font-weight:bold;letter-spacing:0.2em;margin:0.25rem 0;"></div>
        <div style="color:#8b949e;font-size:0.75rem;margin-top:0.5rem;">Password</div>
        <div id="modalPassword" style="color:#ff8c00;font-size:1.1rem;margin:0.25rem 0;">****</div>
        <button class="btn-sm btn-secondary" onclick="togglePasswordReveal()" style="margin-top:0.5rem;font-size:0.75rem;">Show/Hide</button>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <button class="btn-sm btn-secondary" onclick="copyCredentials()">Copy All</button>
        <button class="btn-sm" onclick="hideCredentials()">Done</button>
      </div>
    </div>
  </div>

  <script>
    let currentSessionId = null;
    let currentPassword = null;
    let currentToken = null;
    let currentDeviceId = null;
    let pollInterval = null;
    let resultPollInterval = null;
    let deviceRefreshInterval = null;
    let commandHistory = [];
    let activeCommandId = null;

    // --- Token & Device ---

    async function connectWithToken() {
      const token = document.getElementById('deviceToken').value;
      if (!token || token.length < 16) {
        alert('Device token must be at least 16 characters');
        return;
      }
      currentToken = token;
      document.getElementById('tokenCard').style.display = 'none';
      document.getElementById('deviceCard').style.display = 'block';
      await loadDevices();
      startDeviceRefresh();
    }

    async function loadDevices() {
      if (!currentToken) return;
      try {
        const resp = await fetch('/api/devices', {
          headers: { 'X-Device-Token': currentToken },
        });
        const data = await resp.json();
        const list = document.getElementById('deviceList');

        if (!resp.ok || !data.devices || data.devices.length === 0) {
          list.innerHTML = '<div class="empty-state">No device found for this token. Make sure the bridge is running on your Flipper.</div>';
          return;
        }

        let html = '';
        for (const d of data.devices) {
          const ago = timeAgo(d.last_seen);
          const badge = d.has_session
            ? '<span class="badge badge-busy">In Session</span>'
            : '<span class="badge badge-available">Available</span>';
          const btn = d.has_session
            ? '<button class="btn-sm btn-danger" onclick="evictSession(&#39;' + escAttr(d.device_id) + '&#39;)">Evict</button>'
            : '<button class="btn-sm" onclick="selectDevice(&#39;' + escAttr(d.device_id) + '&#39;, &#39;' + escAttr(d.name) + '&#39;)">Create Session</button>';
          html += '<div class="device-item">'
            + '<div class="device-info">'
            + '<div class="device-name">' + escHtml(d.name) + ' ' + badge + '</div>'
            + '<div class="device-meta">' + escHtml(d.firmware) + ' &middot; ' + escHtml(d.device_id) + ' &middot; ' + ago + '</div>'
            + '</div>'
            + btn
            + '</div>';
        }
        list.innerHTML = html;
      } catch (e) {
        document.getElementById('deviceList').innerHTML = '<div class="empty-state">Failed to load devices.</div>';
      }
    }

    async function evictSession(deviceId) {
      if (!confirm('Evict the current session from this device?')) return;
      try {
        await fetch('/api/device/' + deviceId + '/session', {
          method: 'DELETE',
          headers: { 'X-Device-Token': currentToken },
        });
        await loadDevices();
      } catch (e) {
        alert('Failed to evict: ' + e.message);
      }
    }

    function selectDevice(deviceId, deviceName) {
      currentDeviceId = deviceId;
      document.getElementById('targetDeviceId').value = deviceId;
      document.getElementById('targetDeviceName').textContent = deviceName;
      document.getElementById('targetDeviceIdDisplay').textContent = deviceId;
      document.getElementById('sessionForm').classList.add('show');
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
      if (deviceRefreshInterval) clearInterval(deviceRefreshInterval);
    }

    function cancelSession() {
      document.getElementById('sessionForm').classList.remove('show');
      startDeviceRefresh();
    }

    // --- Session Creation ---

    async function createSession() {
      const btn = document.getElementById('createBtn');
      const pw = document.getElementById('password').value;
      const deviceId = document.getElementById('targetDeviceId').value;
      if (!pw || pw.length < 4) {
        alert('Password must be at least 4 characters');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        const resp = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: deviceId, password: pw, device_token: currentToken }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert('Error: ' + (data.error || 'Unknown error'));
          return;
        }
        currentSessionId = data.session_id;
        currentPassword = pw;
        enterControlPanel();
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Session';
      }
    }

    // --- Control Panel ---

    function enterControlPanel() {
      // Hide setup UI, show control panel
      document.getElementById('deviceCard').style.display = 'none';
      document.getElementById('sessionForm').classList.remove('show');
      document.getElementById('infoCards').style.display = 'none';
      document.getElementById('controlPanel').classList.add('show');
      document.getElementById('panelSessionId').textContent = currentSessionId;
      if (deviceRefreshInterval) clearInterval(deviceRefreshInterval);
      commandHistory = [];
      activeCommandId = null;
      renderHistory();
      startSessionPolling();

      // Show POST body when POST selected
      document.getElementById('cmdType').addEventListener('change', function() {
        document.getElementById('cmdBodyRow').style.display = this.value === 'post' ? 'block' : 'none';
      });

      document.getElementById('cmdPayload').focus();
    }

    function exitControlPanel() {
      document.getElementById('controlPanel').classList.remove('show');
      document.getElementById('deviceCard').style.display = 'block';
      document.getElementById('infoCards').style.display = 'block';
      if (pollInterval) clearInterval(pollInterval);
      if (resultPollInterval) clearInterval(resultPollInterval);
      currentSessionId = null;
      currentPassword = null;
      activeCommandId = null;
      loadDevices();
      startDeviceRefresh();
    }

    async function endSession() {
      if (!confirm('End this session? The Flipper will stop receiving commands.')) return;
      try {
        await fetch('/api/session/' + currentSessionId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + currentPassword },
        });
      } catch (e) { /* best effort */ }
      exitControlPanel();
    }

    // --- Session Status Polling ---

    function startSessionPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollSession();
      pollInterval = setInterval(pollSession, 3000);
    }

    async function pollSession() {
      if (!currentSessionId) return;
      try {
        const resp = await fetch('/api/session/' + currentSessionId, {
          headers: { 'Authorization': 'Bearer ' + currentPassword },
        });
        if (!resp.ok) {
          if (resp.status === 401) {
            // Session gone
            document.getElementById('statusDot').className = 'status-indicator disconnected';
            document.getElementById('statusText').textContent = 'Session expired';
            if (pollInterval) clearInterval(pollInterval);
          }
          return;
        }
        const data = await resp.json();
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        if (data.device_connected) {
          dot.className = 'status-indicator connected';
          let info = 'Connected';
          if (data.device_info) {
            info += ' \\u2014 ' + (data.device_info.name || '') + ' (' + (data.device_info.firmware || '') + ')';
          }
          text.textContent = info;
        } else {
          dot.className = 'status-indicator waiting';
          text.textContent = 'Waiting for Flipper...';
        }

        // Also update active command status from session poll
        if (activeCommandId && data.command && data.command.id === activeCommandId) {
          updateResultDisplay(data.command);
          if (data.command.status === 'completed' || data.command.status === 'error' || data.command.status === 'timeout') {
            finalizeCommand(data.command);
          }
        }
      } catch(e) { /* ignore */ }
    }

    // --- Commands ---

    function quickCmd(type, payload) {
      document.getElementById('cmdType').value = type;
      document.getElementById('cmdPayload').value = payload;
      document.getElementById('cmdBodyRow').style.display = type === 'post' ? 'block' : 'none';
      sendCommand();
    }

    async function sendCommand() {
      const type = document.getElementById('cmdType').value;
      const payload = document.getElementById('cmdPayload').value.trim();
      if (!payload) return;

      if (activeCommandId) {
        alert('A command is still running. Wait for it to finish.');
        return;
      }

      const btn = document.getElementById('sendBtn');
      const status = document.getElementById('cmdStatus');
      btn.disabled = true;
      status.textContent = 'Sending...';

      // Build payload — for POST, include body
      let finalPayload = payload;
      if (type === 'post') {
        const body = document.getElementById('cmdBody').value.trim();
        if (body) {
          finalPayload = payload + '|||' + body;
        }
      }

      try {
        const resp = await fetch('/api/session/' + currentSessionId + '/command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentPassword,
          },
          body: JSON.stringify({ type: type, payload: finalPayload }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          status.textContent = 'Error: ' + (data.error || 'Failed');
          btn.disabled = false;
          return;
        }
        activeCommandId = data.command_id;
        status.textContent = '';

        // Show result box with queued status
        showResult({ id: data.command_id, status: 'queued', type: type, payload: payload });

        // Start polling for result
        startResultPolling();
      } catch (e) {
        status.textContent = 'Network error';
        btn.disabled = false;
      }
    }

    function startResultPolling() {
      if (resultPollInterval) clearInterval(resultPollInterval);
      resultPollInterval = setInterval(pollResult, 1500);
    }

    async function pollResult() {
      if (!activeCommandId) {
        if (resultPollInterval) clearInterval(resultPollInterval);
        return;
      }
      try {
        const resp = await fetch('/api/session/' + currentSessionId + '/result', {
          headers: { 'Authorization': 'Bearer ' + currentPassword },
        });
        const data = await resp.json();
        if (data.command_id === activeCommandId) {
          updateResultDisplay(data);
          if (data.status === 'completed' || data.status === 'error' || data.status === 'timeout') {
            finalizeCommand(data);
          }
        }
      } catch (e) { /* ignore */ }
    }

    function showResult(cmd) {
      const box = document.getElementById('resultBox');
      const badge = document.getElementById('resultBadge');
      const content = document.getElementById('resultContent');
      box.classList.add('show');
      badge.textContent = cmd.status;
      badge.className = 'result-badge ' + cmd.status;
      content.textContent = cmd.status === 'queued' ? 'Waiting for Flipper to pick up command...' : (cmd.result || '');
      content.className = 'result-content';
    }

    function updateResultDisplay(cmd) {
      const badge = document.getElementById('resultBadge');
      const content = document.getElementById('resultContent');
      badge.textContent = cmd.status;
      badge.className = 'result-badge ' + cmd.status;
      if (cmd.status === 'running') {
        content.textContent = 'Flipper is executing...';
        content.className = 'result-content';
      } else if (cmd.status === 'completed') {
        content.textContent = cmd.result || '(empty response)';
        content.className = 'result-content';
      } else if (cmd.status === 'error') {
        content.textContent = cmd.result || 'Unknown error';
        content.className = 'result-content error-text';
      } else if (cmd.status === 'timeout') {
        content.textContent = cmd.result || 'Command timed out';
        content.className = 'result-content error-text';
      }
    }

    function finalizeCommand(cmd) {
      if (resultPollInterval) clearInterval(resultPollInterval);
      const type = document.getElementById('cmdType').value;
      const payload = document.getElementById('cmdPayload').value.trim();

      commandHistory.unshift({
        type: type,
        payload: payload,
        status: cmd.status,
        result: cmd.result || '',
        time: Date.now(),
      });
      if (commandHistory.length > 50) commandHistory.pop();
      renderHistory();

      activeCommandId = null;
      document.getElementById('sendBtn').disabled = false;
      document.getElementById('cmdStatus').textContent = '';
      document.getElementById('cmdPayload').value = '';
      document.getElementById('cmdPayload').focus();
    }

    // --- History ---

    function renderHistory() {
      const list = document.getElementById('historyList');
      if (commandHistory.length === 0) {
        list.innerHTML = '<div class="history-empty">No commands sent yet</div>';
        return;
      }
      let html = '';
      for (const h of commandHistory) {
        const isErr = h.status === 'error' || h.status === 'timeout';
        const badgeClass = isErr ? 'error' : h.status;
        html += '<div class="history-item">'
          + '<div class="history-item-header">'
          + '<span class="history-cmd"><span class="cmd-type">' + escHtml(h.type.toUpperCase()) + '</span>' + escHtml(h.payload) + '</span>'
          + '<span class="result-badge ' + badgeClass + '">' + escHtml(h.status) + '</span>'
          + '</div>'
          + '<div class="history-result' + (isErr ? ' error-text' : '') + '">' + escHtml(h.result || '(no output)') + '</div>'
          + '<div class="history-time">' + timeAgo(h.time) + '</div>'
          + '</div>';
      }
      list.innerHTML = html;
    }

    function clearHistory() {
      commandHistory = [];
      renderHistory();
    }

    // --- Credentials Modal ---

    function showCredentials() {
      document.getElementById('modalSessionId').textContent = currentSessionId;
      document.getElementById('modalPassword').textContent = '****';
      document.getElementById('credModal').style.display = 'flex';
    }

    function hideCredentials() {
      document.getElementById('credModal').style.display = 'none';
    }

    function togglePasswordReveal() {
      const el = document.getElementById('modalPassword');
      el.textContent = el.textContent === '****' ? currentPassword : '****';
    }

    function copyCredentials() {
      const text = 'Session ID: ' + currentSessionId + '\\nPassword: ' + currentPassword;
      navigator.clipboard.writeText(text).then(function() {
        alert('Credentials copied to clipboard');
      });
    }

    function copySessionId() {
      navigator.clipboard.writeText(currentSessionId).then(function() {
        const toast = document.getElementById('copiedToast');
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 1500);
      });
    }

    // --- Utilities ---

    function startDeviceRefresh() {
      if (deviceRefreshInterval) clearInterval(deviceRefreshInterval);
      deviceRefreshInterval = setInterval(loadDevices, 5000);
    }

    function timeAgo(ts) {
      const diff = Math.floor((Date.now() - ts) / 1000);
      if (diff < 10) return 'just now';
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function escAttr(s) {
      return escHtml(s);
    }

    // Close modal on backdrop click
    document.getElementById('credModal').addEventListener('click', function(e) {
      if (e.target === this) hideCredentials();
    });

    // Focus the token input
    document.getElementById('deviceToken').focus();
  </script>
</body>
</html>`;

export function handleLanding() {
  return new Response(HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}
