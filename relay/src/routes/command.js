/**
 * Command endpoints (Claude-side).
 */

import {
  jsonResponse,
  errorResponse,
  authClaude,
  putSession,
  parseBody,
  generateCommandId,
  checkRateLimit,
  COMMAND_RATE_LIMIT,
} from '../utils.js';

const VALID_COMMAND_TYPES = ['get', 'post', 'subghz', 'js', 'write_file'];

export const handleCommand = {
  /**
   * POST /api/session/:id/command — Submit a command for the Flipper.
   */
  async submit(request, env, sessionId) {
    const session = await authClaude(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    // Rate limit: 10 commands per minute per session
    const allowed = await checkRateLimit(env, `cmd:${sessionId}`, COMMAND_RATE_LIMIT);
    if (!allowed) {
      return errorResponse('Rate limit exceeded: max 10 commands per minute', 429);
    }

    // Only one command at a time
    if (session.command && (session.command.status === 'queued' || session.command.status === 'running')) {
      return errorResponse('A command is already pending or running', 409);
    }

    const body = await parseBody(request);
    if (!body || !body.type || !body.payload) {
      return errorResponse('Missing required fields: type, payload');
    }

    if (!VALID_COMMAND_TYPES.includes(body.type)) {
      return errorResponse('Invalid command type. Must be: get, post, subghz, js, or write_file');
    }

    if (typeof body.payload !== 'string') {
      return errorResponse('Payload must be a string');
    }

    const commandId = generateCommandId();

    session.command = {
      id: commandId,
      type: body.type,
      payload: body.payload,
      status: 'queued',
      result: null,
      created_at: Date.now(),
    };

    await putSession(env, sessionId, session);

    return jsonResponse({
      command_id: commandId,
      status: 'queued',
    }, 201);
  },

  /**
   * GET /api/session/:id/result — Poll for command result.
   */
  async result(request, env, sessionId) {
    const session = await authClaude(request, env, sessionId);
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }

    // Refresh TTL
    await putSession(env, sessionId, session);

    if (!session.command) {
      return jsonResponse({ status: 'none' });
    }

    // Check for command timeout (60 seconds)
    if (
      (session.command.status === 'queued' || session.command.status === 'running') &&
      Date.now() - session.command.created_at > 60000
    ) {
      session.command.status = 'timeout';
      session.command.result = 'Command timed out after 60 seconds';
      await putSession(env, sessionId, session);
    }

    return jsonResponse({
      command_id: session.command.id,
      status: session.command.status,
      result: session.command.result,
    });
  },
};
