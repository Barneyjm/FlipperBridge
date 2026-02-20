/**
 * Tests for the FlipperBridge relay service.
 *
 * These test the Worker handler directly with a mock KV store,
 * without needing wrangler or miniflare.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';

// --- Mock KV Store ---
function createMockKV() {
  const store = new Map();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expireAt && Date.now() > entry.expireAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, opts) {
      const entry = { value };
      if (opts && opts.expirationTtl) {
        entry.expireAt = Date.now() + opts.expirationTtl * 1000;
      }
      store.set(key, entry);
    },
    async delete(key) {
      store.delete(key);
    },
    async list(opts) {
      const prefix = opts && opts.prefix ? opts.prefix : '';
      const keys = [];
      for (const [key, entry] of store) {
        if (key.startsWith(prefix)) {
          if (!entry.expireAt || Date.now() <= entry.expireAt) {
            keys.push({ name: key });
          }
        }
      }
      return { keys, list_complete: true, cursor: '' };
    },
    _store: store,
  };
}

function createEnv() {
  return { SESSIONS: createMockKV() };
}

function makeRequest(method, path, body, headers = {}) {
  const url = `https://flipperbridge.dev${path}`;
  const init = { method, headers: { ...headers } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(url, init);
}

async function jsonBody(response) {
  return JSON.parse(await response.text());
}

// --- Test helpers ---
const DEVICE_TOKEN = 'abcdefghij1234567890abcdefghij12'; // 32 chars

async function registerDevice(env) {
  const req = makeRequest('POST', '/api/device/register',
    { firmware: 'Momentum', name: 'TestFlipper' },
    { 'X-Device-Token': DEVICE_TOKEN }
  );
  const resp = await worker.fetch(req, env);
  const data = await jsonBody(resp);
  return data.device_id;
}

async function createSessionForDevice(env, deviceId, password = 'testpassword', token = DEVICE_TOKEN) {
  const req = makeRequest('POST', '/api/session', {
    device_id: deviceId,
    password,
    device_token: token,
  });
  const resp = await worker.fetch(req, env);
  return { resp, data: await jsonBody(resp) };
}

// --- Tests ---

describe('FlipperBridge Relay', () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  describe('Landing page', () => {
    it('serves HTML at /', async () => {
      const req = makeRequest('GET', '/');
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Content-Type')).toContain('text/html');
    });
  });

  describe('CORS', () => {
    it('handles OPTIONS preflight', async () => {
      const req = makeRequest('OPTIONS', '/api/session');
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(204);
      expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(resp.headers.get('Access-Control-Allow-Headers')).toContain('X-Device-Token');
    });
  });

  describe('Device registration', () => {
    it('registers a new device with token', async () => {
      const req = makeRequest('POST', '/api/device/register',
        { firmware: 'Momentum MNTM-011', name: 'MyFlipper' },
        { 'X-Device-Token': DEVICE_TOKEN }
      );
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.device_id).toHaveLength(8);
    });

    it('returns consistent device_id for same token', async () => {
      const id1 = await registerDevice(env);
      const id2 = await registerDevice(env);
      expect(id1).toBe(id2);
    });

    it('rejects missing token header', async () => {
      const req = makeRequest('POST', '/api/device/register',
        { firmware: 'test', name: 'test' }
      );
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('rejects short token', async () => {
      const req = makeRequest('POST', '/api/device/register',
        { firmware: 'test', name: 'test' },
        { 'X-Device-Token': 'tooshort' }
      );
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('preserves session_id on re-registration', async () => {
      const deviceId = await registerDevice(env);
      const { data } = await createSessionForDevice(env, deviceId);
      const sessionId = data.session_id;

      // Re-register
      const req = makeRequest('POST', '/api/device/register',
        { firmware: 'NewFW', name: 'UpdatedName' },
        { 'X-Device-Token': DEVICE_TOKEN }
      );
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(200);

      // Verify session is still bound
      const devRaw = await env.SESSIONS.get(`device:${deviceId}`);
      const dev = JSON.parse(devRaw);
      expect(dev.session_id).toBe(sessionId);
      expect(dev.name).toBe('UpdatedName');
      expect(dev.firmware).toBe('NewFW');
    });
  });

  describe('Device listing', () => {
    it('lists registered devices', async () => {
      await registerDevice(env);

      const req = makeRequest('GET', '/api/devices', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0].name).toBe('TestFlipper');
      expect(data.devices[0].firmware).toBe('Momentum');
      expect(data.devices[0].has_session).toBe(false);
    });

    it('rejects listing without token', async () => {
      const req = makeRequest('GET', '/api/devices');
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('does not expose token_hash', async () => {
      await registerDevice(env);

      const req = makeRequest('GET', '/api/devices', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.devices[0].token_hash).toBeUndefined();
    });

    it('shows has_session when device has active session', async () => {
      const deviceId = await registerDevice(env);
      await createSessionForDevice(env, deviceId);

      const req = makeRequest('GET', '/api/devices', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.devices[0].has_session).toBe(true);
    });
  });

  describe('Session creation (new flow)', () => {
    let deviceId;

    beforeEach(async () => {
      deviceId = await registerDevice(env);
    });

    it('creates session with device_id and password', async () => {
      const { resp, data } = await createSessionForDevice(env, deviceId);

      expect(resp.status).toBe(201);
      expect(data.session_id).toMatch(/^[A-Z0-9]{6}$/);
      // Should NOT return device_key
      expect(data.device_key).toBeUndefined();
    });

    it('rejects missing device_id', async () => {
      const req = makeRequest('POST', '/api/session', { password: 'test1234' });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(400);
    });

    it('rejects non-existent device_id', async () => {
      const req = makeRequest('POST', '/api/session', {
        device_id: 'xxxxxxxx',
        password: 'test1234',
        device_token: DEVICE_TOKEN,
      });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(404);
    });

    it('rejects short password', async () => {
      const req = makeRequest('POST', '/api/session', {
        device_id: deviceId,
        password: 'ab',
      });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(400);
    });

    it('rejects session when device already has one', async () => {
      await createSessionForDevice(env, deviceId);

      const { resp } = await createSessionForDevice(env, deviceId, 'another1234');
      expect(resp.status).toBe(409);
    });

    it('binds session to device record', async () => {
      const { data } = await createSessionForDevice(env, deviceId);

      const devRaw = await env.SESSIONS.get(`device:${deviceId}`);
      const dev = JSON.parse(devRaw);
      expect(dev.session_id).toBe(data.session_id);
    });
  });

  describe('Session lifecycle', () => {
    let deviceId, sessionId;
    const password = 'testpassword';

    beforeEach(async () => {
      deviceId = await registerDevice(env);
      const { data } = await createSessionForDevice(env, deviceId, password);
      sessionId = data.session_id;
    });

    it('gets session status with correct auth', async () => {
      const req = makeRequest('GET', `/api/session/${sessionId}`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(data.session_id).toBe(sessionId);
      expect(data.device_info).not.toBeNull();
      expect(data.device_info.name).toBe('TestFlipper');
      expect(data.command).toBeNull();
    });

    it('rejects wrong password', async () => {
      const req = makeRequest('GET', `/api/session/${sessionId}`, null, {
        Authorization: 'Bearer wrongpassword',
      });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('rejects missing auth header', async () => {
      const req = makeRequest('GET', `/api/session/${sessionId}`);
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('deletes session and unbinds device', async () => {
      const req = makeRequest('DELETE', `/api/session/${sessionId}`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.ok).toBe(true);

      // Verify session is gone
      const req2 = makeRequest('GET', `/api/session/${sessionId}`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resp2 = await worker.fetch(req2, env);
      expect(resp2.status).toBe(401);

      // Verify device is unbound
      const devRaw = await env.SESSIONS.get(`device:${deviceId}`);
      const dev = JSON.parse(devRaw);
      expect(dev.session_id).toBeNull();
    });
  });

  describe('Command flow', () => {
    let deviceId, sessionId;
    const password = 'testpassword';

    beforeEach(async () => {
      deviceId = await registerDevice(env);
      const { data } = await createSessionForDevice(env, deviceId, password);
      sessionId = data.session_id;
    });

    it('submits a command and retrieves result (full lifecycle)', async () => {
      // Submit command
      const cmdReq = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://httpbin.org/ip' },
        { Authorization: `Bearer ${password}` }
      );
      const cmdResp = await worker.fetch(cmdReq, env);
      const cmdData = await jsonBody(cmdResp);
      expect(cmdResp.status).toBe(201);
      expect(cmdData.status).toBe('queued');
      const commandId = cmdData.command_id;

      // Flipper polls and gets the command
      const pollReq = makeRequest('GET', '/api/device/poll', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      const pollResp = await worker.fetch(pollReq, env);
      const pollData = await jsonBody(pollResp);
      expect(pollData.command_id).toBe(commandId);
      expect(pollData.type).toBe('get');
      expect(pollData.payload).toBe('https://httpbin.org/ip');

      // Check result shows running
      const resultReq1 = makeRequest('GET', `/api/session/${sessionId}/result`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resultResp1 = await worker.fetch(resultReq1, env);
      const resultData1 = await jsonBody(resultResp1);
      expect(resultData1.status).toBe('running');

      // Flipper submits result
      const submitReq = makeRequest(
        'POST',
        '/api/device/result',
        { command_id: commandId, result: '{"origin": "1.2.3.4"}' },
        { 'X-Device-Token': DEVICE_TOKEN }
      );
      const submitResp = await worker.fetch(submitReq, env);
      const submitData = await jsonBody(submitResp);
      expect(submitData.ok).toBe(true);

      // Check result shows completed
      const resultReq2 = makeRequest('GET', `/api/session/${sessionId}/result`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resultResp2 = await worker.fetch(resultReq2, env);
      const resultData2 = await jsonBody(resultResp2);
      expect(resultData2.status).toBe('completed');
      expect(resultData2.result).toBe('{"origin": "1.2.3.4"}');
    });

    it('rejects second command while one is pending', async () => {
      const cmd1 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com' },
        { Authorization: `Bearer ${password}` }
      );
      await worker.fetch(cmd1, env);

      const cmd2 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com/2' },
        { Authorization: `Bearer ${password}` }
      );
      const resp = await worker.fetch(cmd2, env);
      expect(resp.status).toBe(409);
    });

    it('allows new command after previous completes', async () => {
      // Submit first command
      const cmd1 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com' },
        { Authorization: `Bearer ${password}` }
      );
      const resp1 = await worker.fetch(cmd1, env);
      const data1 = await jsonBody(resp1);

      // Flipper polls
      const poll = makeRequest('GET', '/api/device/poll', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      await worker.fetch(poll, env);

      // Flipper submits result
      const submit = makeRequest(
        'POST',
        '/api/device/result',
        { command_id: data1.command_id, result: 'done' },
        { 'X-Device-Token': DEVICE_TOKEN }
      );
      await worker.fetch(submit, env);

      // Submit second command
      const cmd2 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com/2' },
        { Authorization: `Bearer ${password}` }
      );
      const resp2 = await worker.fetch(cmd2, env);
      expect(resp2.status).toBe(201);
    });

    it('returns none when no command pending', async () => {
      const req = makeRequest('GET', `/api/session/${sessionId}/result`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.status).toBe('none');
    });

    it('device poll returns null when no command', async () => {
      const req = makeRequest('GET', '/api/device/poll', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.command).toBeNull();
    });

    it('device poll returns null when no session', async () => {
      // Register a second device with no session
      const token2 = 'zzzzzzzzzz9876543210zzzzzzzzzz99';
      const regReq = makeRequest('POST', '/api/device/register',
        { firmware: 'test', name: 'NoSession' },
        { 'X-Device-Token': token2 }
      );
      await worker.fetch(regReq, env);

      const pollReq = makeRequest('GET', '/api/device/poll', null, {
        'X-Device-Token': token2,
      });
      const resp = await worker.fetch(pollReq, env);
      const data = await jsonBody(resp);
      expect(data.command).toBeNull();
    });

    it('rejects invalid command type', async () => {
      const req = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'invalid', payload: 'test' },
        { Authorization: `Bearer ${password}` }
      );
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(400);
    });

    it('handles error result from device', async () => {
      // Submit command
      const cmdReq = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://bad.example.com' },
        { Authorization: `Bearer ${password}` }
      );
      const cmdResp = await worker.fetch(cmdReq, env);
      const cmdData = await jsonBody(cmdResp);

      // Flipper polls
      const poll = makeRequest('GET', '/api/device/poll', null, {
        'X-Device-Token': DEVICE_TOKEN,
      });
      await worker.fetch(poll, env);

      // Flipper submits error
      const submit = makeRequest(
        'POST',
        '/api/device/result',
        { command_id: cmdData.command_id, error: 'DNS resolution failed' },
        { 'X-Device-Token': DEVICE_TOKEN }
      );
      await worker.fetch(submit, env);

      // Check result
      const resultReq = makeRequest('GET', `/api/session/${sessionId}/result`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resultResp = await worker.fetch(resultReq, env);
      const resultData = await jsonBody(resultResp);
      expect(resultData.status).toBe('error');
      expect(resultData.result).toBe('DNS resolution failed');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const req = makeRequest('GET', '/api/unknown');
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(404);
    });

    it('returns 401 for non-existent session', async () => {
      const req = makeRequest('GET', '/api/session/ZZZZZZ', null, {
        Authorization: 'Bearer somepassword',
      });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });
  });
});
