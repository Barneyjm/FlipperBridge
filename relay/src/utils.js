/**
 * Shared utilities for the FlipperBridge relay service.
 */

const SESSION_TTL = 3600; // 1 hour in seconds
const MAX_PAYLOAD_SIZE = 65536; // 64KB
const COMMAND_RATE_LIMIT = 10; // commands per minute
const POLL_RATE_LIMIT = 30; // requests per minute per IP

// Characters for session IDs — no ambiguous chars (O/0/I/1/L)
const SESSION_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function generateSessionId() {
  let id = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    id += SESSION_CHARS[array[i] % SESSION_CHARS.length];
  }
  return id;
}

export function generateDeviceKey() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  let key = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 16; i++) {
    key += chars[array[i] % chars.length];
  }
  return key;
}

export function generateCommandId() {
  return crypto.randomUUID();
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Retrieve a session from KV. Returns null if not found or expired.
 */
export async function getSession(env, sessionId) {
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Save a session to KV with TTL refresh.
 */
export async function putSession(env, sessionId, session) {
  session.last_active = Date.now();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
}

/**
 * Authenticate a Claude-side request using Bearer token.
 * Returns the session or null.
 */
export async function authClaude(request, env, sessionId) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const password = authHeader.slice(7);
  const session = await getSession(env, sessionId);
  if (!session) return null;

  const hash = await hashPassword(password);
  if (hash !== session.password_hash) return null;

  return session;
}

/**
 * Authenticate a Flipper-side request using X-Device-Key header.
 * Returns the session or null.
 */
export async function authDevice(request, env, sessionId) {
  const deviceKey = request.headers.get('X-Device-Key');
  if (!deviceKey) return null;

  const session = await getSession(env, sessionId);
  if (!session) return null;

  if (deviceKey !== session.device_key) return null;

  return session;
}

/**
 * Simple rate limiter using KV. Returns true if the request is allowed.
 */
export async function checkRateLimit(env, key, limit, windowSeconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;
  const current = parseInt(await env.SESSIONS.get(windowKey)) || 0;

  if (current >= limit) {
    return false;
  }

  await env.SESSIONS.put(windowKey, String(current + 1), {
    expirationTtl: windowSeconds * 2,
  });
  return true;
}

/**
 * Validate request body size.
 */
export async function parseBody(request) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
    return null;
  }
  try {
    const text = await request.text();
    if (text.length > MAX_PAYLOAD_SIZE) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export { SESSION_TTL, MAX_PAYLOAD_SIZE, COMMAND_RATE_LIMIT, POLL_RATE_LIMIT };
