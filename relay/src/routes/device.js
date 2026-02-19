/**
 * Device endpoints (Flipper-side).
 */

import {
  jsonResponse,
  errorResponse,
  authDevice,
  putSession,
  parseBody,
  checkRateLimit,
  POLL_RATE_LIMIT,
} from '../utils.js';

export const handleDevice = {
  /**
   * POST /api/device/:id/register — Register the Flipper with the session.
   */
  async register(request, env, sessionId) {
    const session = await authDevice(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await parseBody(request);
    if (!body) {
      return errorResponse('Invalid request body');
    }

    session.device_connected = true;
    session.device_info = {
      firmware: body.firmware || 'unknown',
      name: body.name || 'Flipper',
    };

    await putSession(env, sessionId, session);

    return jsonResponse({ ok: true });
  },

  /**
   * GET /api/device/:id/poll — Check for a pending command.
   */
  async poll(request, env, sessionId) {
    const session = await authDevice(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    // Rate limit: 30 polls per minute per IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(env, `poll:${ip}`, POLL_RATE_LIMIT);
    if (!allowed) {
      return errorResponse('Rate limit exceeded', 429);
    }

    // Refresh TTL
    await putSession(env, sessionId, session);

    // Return pending command if one exists in "queued" state
    if (session.command && session.command.status === 'queued') {
      session.command.status = 'running';
      await putSession(env, sessionId, session);

      return jsonResponse({
        command_id: session.command.id,
        type: session.command.type,
        payload: session.command.payload,
      });
    }

    return jsonResponse({ command: null });
  },

  /**
   * POST /api/device/:id/result — Submit command execution result.
   */
  async result(request, env, sessionId) {
    const session = await authDevice(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await parseBody(request);
    if (!body || !body.command_id) {
      return errorResponse('Missing required field: command_id');
    }

    if (!session.command || session.command.id !== body.command_id) {
      return errorResponse('Command ID mismatch or no pending command', 404);
    }

    if (body.error) {
      session.command.status = 'error';
      session.command.result = body.error;
    } else {
      session.command.status = 'completed';
      session.command.result = body.result || '';
    }

    await putSession(env, sessionId, session);

    return jsonResponse({ ok: true });
  },
};
