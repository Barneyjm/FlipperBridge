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
      content: "▸ ";
      color: #ff8c00;
    }
    .session-box {
      text-align: center;
      padding: 2rem;
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
    .result .device-key {
      color: #ff8c00;
      font-size: 1rem;
      font-family: monospace;
      word-break: break-all;
    }
    .copy-btn {
      background: #30363d;
      color: #e6edf3;
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
      margin-left: 0.5rem;
    }
    .copy-btn:hover { background: #484f58; }
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

    <div class="card session-box">
      <h2>Create a Session</h2>
      <p style="margin-bottom: 1rem;">Choose a password to protect your session.</p>
      <input type="password" id="password" placeholder="Session password" />
      <br>
      <button id="createBtn" onclick="createSession()">Create Session</button>
      <div class="result" id="sessionResult">
        <div class="label">Session ID</div>
        <div class="value" id="sessionId"></div>
        <div class="label">Device Key</div>
        <div class="device-key" id="deviceKey"></div>
        <button class="copy-btn" onclick="copyConfig()">Copy Config</button>
        <p style="margin-top: 1rem; color: #8b949e; font-size: 0.85rem;">
          Enter these in your Flipper's config file to connect.
        </p>
        <div style="margin-top: 1rem;">
          <div class="label">
            <span class="status-indicator waiting" id="statusDot"></span>
            <span id="statusText">Waiting for Flipper to connect...</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Setup Instructions</h2>
      <ul>
        <li>Install <a href="https://github.com/jblanked/FlipperHTTP" style="color:#58a6ff">FlipperHTTP</a> firmware on your ESP32 module</li>
        <li>Copy <code>flipper_bridge.js</code> to <code>/ext/apps/Scripts/</code> on your Flipper SD card</li>
        <li>Create config at <code>/ext/apps_data/flipper_bridge/config.txt</code></li>
        <li>Enter the Session ID, Device Key, and relay URL in the config</li>
        <li>Run the bridge app from Apps &rarr; Scripts &rarr; flipper_bridge</li>
        <li>Tell Claude your session ID and password to start sending commands</li>
      </ul>
    </div>

    <div class="card">
      <h2>Config File Format</h2>
      <p>Create <code>/ext/apps_data/flipper_bridge/config.txt</code> with three lines:</p>
      <pre style="margin-top:0.5rem;color:#e6edf3;background:#0d1117;padding:0.75rem;border-radius:4px;font-size:0.9rem;"><span style="color:#3fb950">A7X29K</span>              &larr; Session ID
<span style="color:#ff8c00">abc123device456</span>     &larr; Device Key
<span style="color:#58a6ff">https://flipperbridge.dev</span>  &larr; Relay URL</pre>
    </div>

    <div class="card">
      <h2>What Can It Do?</h2>
      <ul>
        <li>Make HTTP requests from the Flipper's network</li>
        <li>Let Claude interact with local network devices through the Flipper</li>
        <li>Read Flipper device info (firmware version, name)</li>
        <li>Sessions are ephemeral &mdash; auto-expire after 1 hour of inactivity</li>
      </ul>
    </div>

    <div class="footer">
      FlipperBridge is open source. Sessions auto-expire after 1 hour of inactivity.
    </div>
  </div>

  <script>
    let currentSessionId = null;
    let currentPassword = null;
    let pollInterval = null;

    async function createSession() {
      const btn = document.getElementById('createBtn');
      const pw = document.getElementById('password').value;
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
          body: JSON.stringify({ password: pw }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert('Error: ' + (data.error || 'Unknown error'));
          return;
        }
        currentSessionId = data.session_id;
        currentPassword = pw;
        document.getElementById('sessionId').textContent = data.session_id;
        document.getElementById('deviceKey').textContent = data.device_key;
        document.getElementById('sessionResult').classList.add('show');
        startPolling();
      } catch (e) {
        alert('Network error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Session';
      }
    }

    function copyConfig() {
      const sid = document.getElementById('sessionId').textContent;
      const dk = document.getElementById('deviceKey').textContent;
      const url = window.location.origin;
      navigator.clipboard.writeText(sid + '\\n' + dk + '\\n' + url);
    }

    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async function() {
        try {
          const resp = await fetch('/api/session/' + currentSessionId, {
            headers: { 'Authorization': 'Bearer ' + currentPassword },
          });
          const data = await resp.json();
          if (data.device_connected) {
            const dot = document.getElementById('statusDot');
            const text = document.getElementById('statusText');
            dot.className = 'status-indicator connected';
            let info = 'Flipper connected';
            if (data.device_info) {
              info += ' — ' + (data.device_info.name || '') + ' (' + (data.device_info.firmware || '') + ')';
            }
            text.textContent = info;
            clearInterval(pollInterval);
          }
        } catch(e) {
          // ignore poll errors
        }
      }, 3000);
    }
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
