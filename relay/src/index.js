/**
 * FlipperBridge Relay Service
 * Cloudflare Worker that brokers messages between Claude and a Flipper Zero.
 */

import { handleSession } from './routes/session.js';
import { handleCommand } from './routes/command.js';
import { handleDevice } from './routes/device.js';
import { handleLanding } from './routes/landing.js';
import { corsHeaders, errorResponse } from './utils.js';

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Landing page
      if (path === '/' && request.method === 'GET') {
        return handleLanding();
      }

      // --- Claude-side endpoints ---

      // POST /api/session — create session
      if (path === '/api/session' && request.method === 'POST') {
        return handleSession.create(request, env);
      }

      // Session-specific routes: /api/session/:id[/...]
      const sessionMatch = path.match(/^\/api\/session\/([A-Z0-9]{6})(\/.*)?$/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        const subpath = sessionMatch[2] || '';

        if (request.method === 'GET' && subpath === '') {
          return handleSession.get(request, env, sessionId);
        }
        if (request.method === 'DELETE' && subpath === '') {
          return handleSession.delete(request, env, sessionId);
        }
        if (request.method === 'POST' && subpath === '/command') {
          return handleCommand.submit(request, env, sessionId);
        }
        if (request.method === 'GET' && subpath === '/result') {
          return handleCommand.result(request, env, sessionId);
        }
      }

      // --- Flipper-side endpoints (no session ID in path) ---

      if (path === '/api/device/register' && request.method === 'POST') {
        return handleDevice.register(request, env);
      }
      if (path === '/api/device/poll' && request.method === 'GET') {
        return handleDevice.poll(request, env);
      }
      if (path === '/api/device/result' && request.method === 'POST') {
        return handleDevice.result(request, env);
      }

      // --- Device management ---

      if (path === '/api/devices' && request.method === 'GET') {
        return handleDevice.list(request, env);
      }

      const deviceSessionMatch = path.match(/^\/api\/device\/([a-f0-9]+)\/session$/);
      if (deviceSessionMatch && request.method === 'DELETE') {
        return handleDevice.evictSession(request, env, deviceSessionMatch[1]);
      }

      const deviceDeleteMatch = path.match(/^\/api\/device\/([a-f0-9]+)$/);
      if (deviceDeleteMatch && request.method === 'DELETE') {
        return handleDevice.delete(request, env, deviceDeleteMatch[1]);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      console.error('Unhandled error:', err);
      return errorResponse('Internal server error', 500);
    }
  },
};
