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
      max-width: 720px;
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
    input[type="password"] {
      background: #0d1117;
      border: 1px solid #30363d;
      color: #e6edf3;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 1rem;
      width: 100%;
      max-width: 300px;
      margin-bottom: 1rem;
      font-family: monospace;
    }
    input:focus { outline: none; border-color: #ff8c00; }
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
    .result {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      display: none;
    }
    .result.show { display: block; }
    .result .label { color: #8b949e; font-size: 0.85rem; }
    .result .value {
      color: #58a6ff;
      font-size: 1.5rem;
      font-weight: bold;
      letter-spacing: 0.3em;
      margin: 0.5rem 0;
    }
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
  </style>
</head>
<body>
  <div class="container">
    <h1>Flipper<span>Bridge</span></h1>
    <p class="subtitle">Cloud relay for controlling your Flipper Zero through Claude</p>

    <div class="architecture">
      Claude &nbsp;&#8596;&nbsp; Relay (this server) &nbsp;&#8596;&nbsp; WiFi &nbsp;&#8596;&nbsp; Flipper Zero
    </div>

    <div class="card" id="tokenCard">
      <h2>Connect to Your Device</h2>
      <p style="color:#8b949e;margin-bottom:1rem;">Enter the device token from line 2 of your Flipper's config.txt</p>
      <input type="password" id="deviceToken" placeholder="Device token" />
      <br>
      <button onclick="connectWithToken()">Connect</button>
    </div>

    <div class="card" id="deviceCard" style="display:none;">
      <h2>Device <button class="btn-sm btn-secondary" onclick="loadDevices()" style="margin-left:0.5rem;vertical-align:middle;">Refresh</button></h2>
      <div class="device-list" id="deviceList">
        <div class="empty-state">Loading...</div>
      </div>
    </div>

    <div class="card session-form" id="sessionForm">
      <h2>Create Session</h2>
      <p class="session-form-target">for <span id="targetDeviceName"></span> (<span id="targetDeviceIdDisplay"></span>)</p>
      <input type="hidden" id="targetDeviceId" />
      <input type="password" id="password" placeholder="Session password (min 4 chars)" />
      <br>
      <button id="createBtn" onclick="createSession()">Create Session</button>
      <button class="btn-sm btn-secondary" onclick="cancelSession()" style="margin-left:0.5rem;">Cancel</button>
      <div class="result" id="sessionResult">
        <div class="label">Session ID</div>
        <div class="value" id="sessionId"></div>
        <p style="margin-top: 0.5rem; color: #8b949e; font-size: 0.85rem;">
          Give Claude this session ID and your password to start sending commands.
        </p>
        <div style="margin-top: 1rem;">
          <div class="label">
            <span class="status-indicator waiting" id="statusDot"></span>
            <span id="statusText">Waiting for activity...</span>
          </div>
        </div>
      </div>
    </div>

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

    <div class="footer">
      FlipperBridge is open source. Sessions auto-expire after 1 hour of inactivity.
    </div>
  </div>

  <script>
    let currentSessionId = null;
    let currentPassword = null;
    let currentToken = null;
    let pollInterval = null;
    let deviceRefreshInterval = null;

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
            ? ''
            : '<button class="btn-sm" onclick="selectDevice(\\'' + d.device_id + '\\', \\'' + escHtml(d.name) + '\\')">Create Session</button>';
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

    function selectDevice(deviceId, deviceName) {
      document.getElementById('targetDeviceId').value = deviceId;
      document.getElementById('targetDeviceName').textContent = deviceName;
      document.getElementById('targetDeviceIdDisplay').textContent = deviceId;
      document.getElementById('sessionForm').classList.add('show');
      document.getElementById('sessionResult').classList.remove('show');
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
      if (deviceRefreshInterval) clearInterval(deviceRefreshInterval);
    }

    function cancelSession() {
      document.getElementById('sessionForm').classList.remove('show');
      if (pollInterval) clearInterval(pollInterval);
      currentSessionId = null;
      currentPassword = null;
      startDeviceRefresh();
    }

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
        document.getElementById('sessionId').textContent = data.session_id;
        document.getElementById('sessionResult').classList.add('show');
        startPolling();
        loadDevices();
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Session';
      }
    }

    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async function() {
        try {
          const resp = await fetch('/api/session/' + currentSessionId, {
            headers: { 'Authorization': 'Bearer ' + currentPassword },
          });
          const data = await resp.json();
          const dot = document.getElementById('statusDot');
          const text = document.getElementById('statusText');
          if (data.device_connected) {
            dot.className = 'status-indicator connected';
            let info = 'Flipper connected';
            if (data.device_info) {
              info += ' \\u2014 ' + (data.device_info.name || '') + ' (' + (data.device_info.firmware || '') + ')';
            }
            text.textContent = info;
          } else {
            dot.className = 'status-indicator waiting';
            text.textContent = 'Waiting for Flipper to poll...';
          }
        } catch(e) {
          // ignore poll errors
        }
      }, 3000);
    }

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
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

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
