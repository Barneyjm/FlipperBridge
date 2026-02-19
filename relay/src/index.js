/**
 * FlipperBridge Relay Service
 * Cloudflare Worker that brokers messages between Claude and a Flipper Zero.
 */

import { handleSession } from './routes/session.js';
import { handleCommand } from './routes/command.js';
import { handleDevice } from './routes/device.js';
import { handleLanding } from './routes/landing.js';
import { corsHeaders, jsonResponse, errorResponse } from './utils.js';

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

      // --- Flipper-side endpoints ---

      // Device routes: /api/device/:id/...
      const deviceMatch = path.match(/^\/api\/device\/([A-Z0-9]{6})(\/.*)?$/);
      if (deviceMatch) {
        const sessionId = deviceMatch[1];
        const subpath = deviceMatch[2] || '';

        if (request.method === 'POST' && subpath === '/register') {
          return handleDevice.register(request, env, sessionId);
        }
        if (request.method === 'GET' && subpath === '/poll') {
          return handleDevice.poll(request, env, sessionId);
        }
        if (request.method === 'POST' && subpath === '/result') {
          return handleDevice.result(request, env, sessionId);
        }
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      console.error('Unhandled error:', err);
      return errorResponse('Internal server error', 500);
    }
  },
};
