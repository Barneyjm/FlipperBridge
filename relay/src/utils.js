/**
 * Shared utilities for the FlipperBridge relay service.
 */

const SESSION_TTL = 3600; // 1 hour in seconds
const DEVICE_TTL = 86400; // 24 hours in seconds
const MAX_PAYLOAD_SIZE = 65536; // 64KB
const COMMAND_RATE_LIMIT = 10; // commands per minute
const POLL_RATE_LIMIT = 30; // requests per minute per device

// Characters for session IDs — no ambiguous chars (O/0/I/1/L)
const SESSION_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token',
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
 * Hash a device token with SHA-256.
 */
export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive an 8-char device ID from a token.
 */
export async function deriveDeviceId(token) {
  const fullHash = await hashToken(token);
  return fullHash.substring(0, 8);
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
 * Retrieve a device from KV. Returns null if not found or expired.
 */
export async function getDevice(env, deviceId) {
  const raw = await env.SESSIONS.get(`device:${deviceId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Save a device to KV with TTL refresh.
 */
export async function putDevice(env, deviceId, device) {
  device.last_seen = Date.now();
  await env.SESSIONS.put(`device:${deviceId}`, JSON.stringify(device), {
    expirationTtl: DEVICE_TTL,
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
 * Authenticate a Flipper-side request using X-Device-Token header.
 * Returns { device, deviceId } or null.
 */
export async function authDevice(request, env) {
  const token = request.headers.get('X-Device-Token');
  if (!token) return null;

  const deviceId = await deriveDeviceId(token);
  const device = await getDevice(env, deviceId);
  if (!device) return null;

  const tokenHash = await hashToken(token);
  if (tokenHash !== device.token_hash) return null;

  return { device, deviceId };
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

export { SESSION_TTL, DEVICE_TTL, MAX_PAYLOAD_SIZE, COMMAND_RATE_LIMIT, POLL_RATE_LIMIT };
