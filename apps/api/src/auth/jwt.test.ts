import { describe, expect, it } from 'vitest';

import {
  authenticateAccessToken,
  authenticateRequest,
  createToken,
  verifyToken,
} from './jwt.js';

const SECRET = 'test-secret-key-that-is-at-least-32-chars-long';

describe('JWT auth', () => {
  describe('createToken + verifyToken', () => {
    it('creates a valid token that can be verified', () => {
      const token = createToken('user-123', SECRET);
      const payload = verifyToken(token, SECRET);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-123');
    });

    it('rejects token with wrong secret', () => {
      const token = createToken('user-123', SECRET);
      const payload = verifyToken(token, 'wrong-secret-that-is-long-enough');
      expect(payload).toBeNull();
    });

    it('rejects expired token', () => {
      const token = createToken('user-123', SECRET, -1); // expired 1 second ago
      const payload = verifyToken(token, SECRET);
      expect(payload).toBeNull();
    });

    it('rejects malformed token', () => {
      expect(verifyToken('not.a.jwt', SECRET)).toBeNull();
      expect(verifyToken('', SECRET)).toBeNull();
      expect(verifyToken('a.b', SECRET)).toBeNull();
    });

    it('rejects tampered payload', () => {
      const token = createToken('user-123', SECRET);
      const parts = token.split('.');
      // Tamper with payload
      const tampered = `${parts[0]}.${Buffer.from('{"sub":"hacker","iat":0,"exp":9999999999}').toString('base64url')}.${parts[2]}`;
      expect(verifyToken(tampered, SECRET)).toBeNull();
    });

    it('includes iat and exp fields', () => {
      const token = createToken('user-123', SECRET, 3600);
      const payload = verifyToken(token, SECRET);
      expect(payload!.iat).toBeGreaterThan(0);
      expect(payload!.exp).toBe(payload!.iat + 3600);
    });
  });

  describe('authenticateRequest', () => {
    it('returns user for valid Bearer token', () => {
      const token = createToken('user-456', SECRET);
      const user = authenticateRequest(`Bearer ${token}`, SECRET);
      expect(user).not.toBeNull();
      expect(user!.userId).toBe('user-456');
    });

    it('returns null for missing header', () => {
      expect(authenticateRequest(undefined, SECRET)).toBeNull();
    });

    it('returns null for non-Bearer header', () => {
      expect(authenticateRequest('Basic abc123', SECRET)).toBeNull();
    });

    it('returns null for invalid token', () => {
      expect(authenticateRequest('Bearer invalid.token.here', SECRET)).toBeNull();
    });

    it('is case-insensitive for Bearer prefix', () => {
      const token = createToken('user-789', SECRET);
      const user = authenticateRequest(`bearer ${token}`, SECRET);
      expect(user).not.toBeNull();
      expect(user!.userId).toBe('user-789');
    });
  });

  describe('authenticateAccessToken', () => {
    it('accepts exact Bearer token match', () => {
      const user = authenticateAccessToken('Bearer shared-access-token', 'shared-access-token');
      expect(user).not.toBeNull();
      expect(user!.userId).toBe('api-access-token');
    });

    it('rejects mismatched token', () => {
      const user = authenticateAccessToken('Bearer wrong-token', 'shared-access-token');
      expect(user).toBeNull();
    });

    it('rejects missing header', () => {
      const user = authenticateAccessToken(undefined, 'shared-access-token');
      expect(user).toBeNull();
    });
  });
});
