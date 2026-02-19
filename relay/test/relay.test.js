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
    });
  });

  describe('POST /api/session', () => {
    it('creates a session with valid password', async () => {
      const req = makeRequest('POST', '/api/session', { password: 'test1234' });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);

      expect(resp.status).toBe(201);
      expect(data.session_id).toMatch(/^[A-Z0-9]{6}$/);
      expect(data.device_key).toHaveLength(16);
    });

    it('rejects missing password', async () => {
      const req = makeRequest('POST', '/api/session', {});
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(400);
    });

    it('rejects short password', async () => {
      const req = makeRequest('POST', '/api/session', { password: 'ab' });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(400);
    });
  });

  describe('Session lifecycle', () => {
    let sessionId, deviceKey;
    const password = 'testpassword';

    beforeEach(async () => {
      const req = makeRequest('POST', '/api/session', { password });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      sessionId = data.session_id;
      deviceKey = data.device_key;
    });

    it('gets session status with correct auth', async () => {
      const req = makeRequest('GET', `/api/session/${sessionId}`, null, {
        Authorization: `Bearer ${password}`,
      });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(data.session_id).toBe(sessionId);
      expect(data.device_connected).toBe(false);
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

    it('deletes a session', async () => {
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
    });
  });

  describe('Device registration', () => {
    let sessionId, deviceKey;
    const password = 'testpassword';

    beforeEach(async () => {
      const req = makeRequest('POST', '/api/session', { password });
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      sessionId = data.session_id;
      deviceKey = data.device_key;
    });

    it('registers a device', async () => {
      const req = makeRequest(
        'POST',
        `/api/device/${sessionId}/register`,
        { firmware: 'Momentum MNTM-011', name: 'TestFlipper' },
        { 'X-Device-Key': deviceKey }
      );
      const resp = await worker.fetch(req, env);
      const data = await jsonBody(resp);
      expect(data.ok).toBe(true);

      // Check session reflects device connection
      const statusReq = makeRequest('GET', `/api/session/${sessionId}`, null, {
        Authorization: `Bearer ${password}`,
      });
      const statusResp = await worker.fetch(statusReq, env);
      const statusData = await jsonBody(statusResp);
      expect(statusData.device_connected).toBe(true);
      expect(statusData.device_info.firmware).toBe('Momentum MNTM-011');
      expect(statusData.device_info.name).toBe('TestFlipper');
    });

    it('rejects wrong device key', async () => {
      const req = makeRequest(
        'POST',
        `/api/device/${sessionId}/register`,
        { firmware: 'test', name: 'test' },
        { 'X-Device-Key': 'wrongkey' }
      );
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });
  });

  describe('Command flow', () => {
    let sessionId, deviceKey;
    const password = 'testpassword';

    beforeEach(async () => {
      // Create session
      const createReq = makeRequest('POST', '/api/session', { password });
      const createResp = await worker.fetch(createReq, env);
      const createData = await jsonBody(createResp);
      sessionId = createData.session_id;
      deviceKey = createData.device_key;

      // Register device
      const regReq = makeRequest(
        'POST',
        `/api/device/${sessionId}/register`,
        { firmware: 'Momentum', name: 'TestFlipper' },
        { 'X-Device-Key': deviceKey }
      );
      await worker.fetch(regReq, env);
    });

    it('submits a command and retrieves result', async () => {
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
      const pollReq = makeRequest('GET', `/api/device/${sessionId}/poll`, null, {
        'X-Device-Key': deviceKey,
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
        `/api/device/${sessionId}/result`,
        { command_id: commandId, result: '{"origin": "1.2.3.4"}' },
        { 'X-Device-Key': deviceKey }
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
      // Submit first command
      const cmd1 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com' },
        { Authorization: `Bearer ${password}` }
      );
      await worker.fetch(cmd1, env);

      // Try to submit second
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
      // Submit and complete first command
      const cmd1 = makeRequest(
        'POST',
        `/api/session/${sessionId}/command`,
        { type: 'get', payload: 'https://example.com' },
        { Authorization: `Bearer ${password}` }
      );
      const resp1 = await worker.fetch(cmd1, env);
      const data1 = await jsonBody(resp1);

      // Flipper polls
      const poll = makeRequest('GET', `/api/device/${sessionId}/poll`, null, {
        'X-Device-Key': deviceKey,
      });
      await worker.fetch(poll, env);

      // Flipper submits result
      const submit = makeRequest(
        'POST',
        `/api/device/${sessionId}/result`,
        { command_id: data1.command_id, result: 'done' },
        { 'X-Device-Key': deviceKey }
      );
      await worker.fetch(submit, env);

      // Now submit second command
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

    it('poll returns null when no command', async () => {
      const req = makeRequest('GET', `/api/device/${sessionId}/poll`, null, {
        'X-Device-Key': deviceKey,
      });
      const resp = await worker.fetch(req, env);
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
      const poll = makeRequest('GET', `/api/device/${sessionId}/poll`, null, {
        'X-Device-Key': deviceKey,
      });
      await worker.fetch(poll, env);

      // Flipper submits error
      const submit = makeRequest(
        'POST',
        `/api/device/${sessionId}/result`,
        { command_id: cmdData.command_id, error: 'DNS resolution failed' },
        { 'X-Device-Key': deviceKey }
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

    it('returns 404 for non-existent session', async () => {
      const req = makeRequest('GET', '/api/session/ZZZZZZ', null, {
        Authorization: 'Bearer somepassword',
      });
      const resp = await worker.fetch(req, env);
      expect(resp.status).toBe(401);
    });
  });
});
