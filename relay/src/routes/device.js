/**
 * Device endpoints (Flipper-side).
 */

import {
  jsonResponse,
  errorResponse,
  authDevice,
  hashToken,
  deriveDeviceId,
  getDevice,
  putDevice,
  getSession,
  putSession,
  parseBody,
  checkRateLimit,
  POLL_RATE_LIMIT,
} from '../utils.js';

export const handleDevice = {
  /**
   * POST /api/device/register — Register a Flipper with the relay.
   * Device identifies itself via X-Device-Token header.
   */
  async register(request, env) {
    const token = request.headers.get('X-Device-Token');
    if (!token || token.length < 16) {
      return errorResponse('Missing or invalid X-Device-Token header', 401);
    }

    const body = await parseBody(request);
    if (!body) {
      return errorResponse('Invalid request body');
    }

    const tokenHash = await hashToken(token);
    const deviceId = tokenHash.substring(0, 8);

    // Check for hash collision with a different token
    const existing = await getDevice(env, deviceId);
    if (existing && existing.token_hash !== tokenHash) {
      return errorResponse('Device ID conflict', 409);
    }

    const device = {
      device_id: deviceId,
      token_hash: tokenHash,
      name: body.name || 'Flipper',
      firmware: body.firmware || 'unknown',
      last_seen: Date.now(),
      session_id: existing ? existing.session_id : null,
    };

    await putDevice(env, deviceId, device);

    return jsonResponse({ ok: true, device_id: deviceId });
  },

  /**
   * GET /api/device/poll — Check for a pending command.
   * Device identifies itself via X-Device-Token header.
   */
  async poll(request, env) {
    const auth = await authDevice(request, env);
    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }
    const { device, deviceId } = auth;

    // Rate limit by device ID
    const allowed = await checkRateLimit(env, `poll:${deviceId}`, POLL_RATE_LIMIT);
    if (!allowed) {
      return errorResponse('Rate limit exceeded', 429);
    }

    // Refresh device TTL
    await putDevice(env, deviceId, device);

    // No session bound
    if (!device.session_id) {
      return jsonResponse({ command: null });
    }

    const session = await getSession(env, device.session_id);
    if (!session) {
      // Session expired, clear the binding
      device.session_id = null;
      await putDevice(env, deviceId, device);
      return jsonResponse({ command: null });
    }

    // Return pending command if one exists in "queued" state
    if (session.command && session.command.status === 'queued') {
      session.command.status = 'running';
      await putSession(env, device.session_id, session);

      return jsonResponse({
        command_id: session.command.id,
        type: session.command.type,
        payload: session.command.payload,
      });
    }

    return jsonResponse({ command: null });
  },

  /**
   * POST /api/device/result — Submit command execution result.
   * Device identifies itself via X-Device-Token header.
   */
  async result(request, env) {
    const auth = await authDevice(request, env);
    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }
    const { device } = auth;

    if (!device.session_id) {
      return errorResponse('No active session', 404);
    }

    const body = await parseBody(request);
    if (!body || !body.command_id) {
      return errorResponse('Missing required field: command_id');
    }

    const session = await getSession(env, device.session_id);
    if (!session) {
      return errorResponse('Session expired', 404);
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

    await putSession(env, device.session_id, session);

    return jsonResponse({ ok: true });
  },

  /**
   * DELETE /api/device/:id/session — Force-evict a device's session.
   */
  async evictSession(request, env, deviceId) {
    const device = await getDevice(env, deviceId);
    if (!device) {
      return errorResponse('Device not found', 404);
    }

    if (!device.session_id) {
      return jsonResponse({ ok: true, message: 'No session to evict' });
    }

    // Delete the session from KV
    await env.SESSIONS.delete(`session:${device.session_id}`);

    // Clear the session binding on the device
    device.session_id = null;
    await putDevice(env, deviceId, device);

    return jsonResponse({ ok: true, message: 'Session evicted' });
  },

  /**
   * DELETE /api/device/:id — Delete a device record.
   */
  async delete(request, env, deviceId) {
    const device = await getDevice(env, deviceId);
    if (!device) {
      return errorResponse('Device not found', 404);
    }

    // Clean up any bound session
    if (device.session_id) {
      await env.SESSIONS.delete(`session:${device.session_id}`);
    }

    await env.SESSIONS.delete(`device:${deviceId}`);

    return jsonResponse({ ok: true, message: 'Device deleted' });
  },

  /**
   * GET /api/devices — List registered devices. Requires X-Device-Token header.
   * Only returns the device matching the provided token.
   */
  async list(request, env) {
    const auth = await authDevice(request, env);
    if (!auth) {
      return errorResponse('Unauthorized — X-Device-Token required', 401);
    }
    const { device } = auth;

    return jsonResponse({
      devices: [{
        device_id: device.device_id,
        name: device.name,
        firmware: device.firmware,
        last_seen: device.last_seen,
        has_session: !!device.session_id,
      }],
    });
  },
};
