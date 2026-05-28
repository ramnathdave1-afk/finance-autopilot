import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from '../src/subscriptions-detect';

describe('normalizeMerchant', () => {
  it('lowercases and strips digits/punct', () => {
    expect(normalizeMerchant('NETFLIX.COM #1234')).toBe('netflix com');
  });

  it('collapses whitespace', () => {
    expect(normalizeMerchant('  PLANET   FITNESS  ')).toBe('planet fitness');
  });

  it('drops store ids', () => {
    expect(normalizeMerchant('Starbucks Store 8821')).toBe('starbucks store');
  });

  it('treats different cases / store numbers as same merchant', () => {
    expect(normalizeMerchant('Comcast XFINITY #91')).toBe(normalizeMerchant('comcast xfinity 142'));
  });
});
