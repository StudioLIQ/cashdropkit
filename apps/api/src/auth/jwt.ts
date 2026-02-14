/**
 * JWT Authentication for CashDrop Kit API
 *
 * Uses HMAC-SHA256 for token signing/verification.
 * Implemented using Node.js built-in crypto (no external JWT library needed for MVP).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string; // user ID
  iat: number; // issued at (seconds)
  exp: number; // expiration (seconds)
}

export interface AuthUser {
  userId: string;
}

const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function sign(header: string, payload: string, secret: string): string {
  const data = `${header}.${payload}`;
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Create a JWT token for a user.
 */
export function createToken(userId: string, secret: string, expirySeconds = DEFAULT_EXPIRY_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + expirySeconds,
    }),
  );

  const signature = sign(header, payload, secret);
  return `${header}.${payload}.${signature}`;
}

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, or null if invalid/expired.
 */
export function verifyToken(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  // Verify signature using timing-safe comparison
  const expectedSig = sign(header, payload, secret);
  const sigBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSig, 'base64url');

  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  // Decode payload
  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract Authorization header and verify JWT.
 * Returns AuthUser if valid, null otherwise.
 */
export function authenticateRequest(authHeader: string | undefined, secret: string): AuthUser | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const payload = verifyToken(match[1], secret);
  if (!payload) return null;

  return { userId: payload.sub };
}

/**
 * Get the JWT secret from environment, fail-fast if missing.
 */
export function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is required for JWT authentication.\n' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.');
  }
  return secret;
}
