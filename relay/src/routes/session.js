/**
 * Session management endpoints (Claude-side).
 */

import {
  jsonResponse,
  errorResponse,
  generateSessionId,
  hashPassword,
  hashToken,
  getSession,
  putSession,
  getDevice,
  putDevice,
  authClaude,
  parseBody,
} from '../utils.js';

export const handleSession = {
  /**
   * POST /api/session — Create a new session bound to a device.
   */
  async create(request, env) {
    const body = await parseBody(request);
    if (!body || !body.password || !body.device_id || !body.device_token) {
      return errorResponse('Missing required fields: password, device_id, device_token');
    }

    if (typeof body.password !== 'string' || body.password.length < 4) {
      return errorResponse('Password must be at least 4 characters');
    }

    // Validate device exists
    const device = await getDevice(env, body.device_id);
    if (!device) {
      return errorResponse('Device not found', 404);
    }

    // Verify the caller knows the device token
    const tokenHash = await hashToken(body.device_token);
    if (tokenHash !== device.token_hash) {
      return errorResponse('Invalid device token', 403);
    }

    // Check if device already has an active session
    if (device.session_id) {
      const existingSession = await getSession(env, device.session_id);
      if (existingSession) {
        return errorResponse('Device already has an active session', 409);
      }
      // Session expired, clear stale reference
      device.session_id = null;
    }

    // Generate unique session ID (retry on collision)
    let sessionId;
    let attempts = 0;
    do {
      sessionId = generateSessionId();
      const existing = await getSession(env, sessionId);
      if (!existing) break;
      attempts++;
    } while (attempts < 5);

    if (attempts >= 5) {
      return errorResponse('Failed to generate unique session ID, try again', 503);
    }

    const passwordHash = await hashPassword(body.password);

    const session = {
      id: sessionId,
      password_hash: passwordHash,
      device_id: body.device_id,
      created_at: Date.now(),
      last_active: Date.now(),
      command: null,
    };

    await putSession(env, sessionId, session);

    // Bind device to session
    device.session_id = sessionId;
    await putDevice(env, body.device_id, device);

    return jsonResponse({ session_id: sessionId }, 201);
  },

  /**
   * GET /api/session/:id — Get session status.
   */
  async get(request, env, sessionId) {
    const session = await authClaude(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    // Refresh TTL
    await putSession(env, sessionId, session);

    // Fetch device info from device record
    let deviceInfo = null;
    let deviceConnected = false;
    if (session.device_id) {
      const device = await getDevice(env, session.device_id);
      if (device) {
        // Check heartbeat key (written by poll) for connection status
        const heartbeat = await env.SESSIONS.get(`heartbeat:${session.device_id}`);
        deviceConnected = heartbeat ? (Date.now() - parseInt(heartbeat)) < 30000 : false;
        deviceInfo = {
          device_id: device.device_id,
          name: device.name,
          firmware: device.firmware,
          last_seen: heartbeat ? parseInt(heartbeat) : device.last_seen,
        };
      }
    }

    return jsonResponse({
      session_id: session.id,
      device_connected: deviceConnected,
      device_info: deviceInfo,
      command: session.command,
    });
  },

  /**
   * DELETE /api/session/:id — End session.
   */
  async delete(request, env, sessionId) {
    const session = await authClaude(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    // Unbind device
    if (session.device_id) {
      const device = await getDevice(env, session.device_id);
      if (device && device.session_id === sessionId) {
        device.session_id = null;
        await putDevice(env, session.device_id, device);
      }
    }

    await env.SESSIONS.delete(`session:${sessionId}`);

    return jsonResponse({ ok: true });
  },
};
