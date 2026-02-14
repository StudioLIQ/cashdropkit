import { describe, expect, it } from 'vitest';

import { parsePagination } from './router.js';

describe('router utilities', () => {
  describe('parsePagination', () => {
    it('returns defaults for empty query', () => {
      const query = new URLSearchParams();
      expect(parsePagination(query)).toEqual({ page: 1, pageSize: 20 });
    });

    it('parses page and pageSize', () => {
      const query = new URLSearchParams('page=3&pageSize=50');
      expect(parsePagination(query)).toEqual({ page: 3, pageSize: 50 });
    });

    it('clamps page to minimum 1', () => {
      const query = new URLSearchParams('page=-1');
      expect(parsePagination(query)).toEqual({ page: 1, pageSize: 20 });
    });

    it('clamps pageSize to maximum 100', () => {
      const query = new URLSearchParams('pageSize=500');
      expect(parsePagination(query)).toEqual({ page: 1, pageSize: 100 });
    });

    it('uses default for pageSize=0', () => {
      const query = new URLSearchParams('pageSize=0');
      expect(parsePagination(query)).toEqual({ page: 1, pageSize: 20 });
    });

    it('handles non-numeric values gracefully', () => {
      const query = new URLSearchParams('page=abc&pageSize=xyz');
      expect(parsePagination(query)).toEqual({ page: 1, pageSize: 20 });
    });
  });
});
