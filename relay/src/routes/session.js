/**
 * Session management endpoints (Claude-side).
 */

import {
  jsonResponse,
  errorResponse,
  generateSessionId,
  generateDeviceKey,
  hashPassword,
  getSession,
  putSession,
  authClaude,
  parseBody,
} from '../utils.js';

export const handleSession = {
  /**
   * POST /api/session — Create a new session.
   */
  async create(request, env) {
    const body = await parseBody(request);
    if (!body || !body.password) {
      return errorResponse('Missing required field: password');
    }

    if (typeof body.password !== 'string' || body.password.length < 4) {
      return errorResponse('Password must be at least 4 characters');
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

    const deviceKey = generateDeviceKey();
    const passwordHash = await hashPassword(body.password);

    const session = {
      id: sessionId,
      password_hash: passwordHash,
      device_key: deviceKey,
      created_at: Date.now(),
      last_active: Date.now(),
      device_connected: false,
      device_info: null,
      command: null,
    };

    await putSession(env, sessionId, session);

    return jsonResponse({
      session_id: sessionId,
      device_key: deviceKey,
    }, 201);
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

    return jsonResponse({
      session_id: session.id,
      device_connected: session.device_connected,
      device_info: session.device_info,
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

    await env.SESSIONS.delete(`session:${sessionId}`);

    return jsonResponse({ ok: true });
  },
};
