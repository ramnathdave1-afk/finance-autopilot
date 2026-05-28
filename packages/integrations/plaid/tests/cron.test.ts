import { describe, it, expect } from 'vitest';
import { cronSpecs } from '../src/cron';

describe('cronSpecs', () => {
  it('nightly runs at 03:00 UTC', () => {
    expect(cronSpecs.nightly.cron).toBe('0 3 * * *');
    expect(cronSpecs.nightly.id).toBe('plaid-nightly-sync');
    expect(typeof cronSpecs.nightly.handler).toBe('function');
  });

  it('hourly runs on the hour and fans out via plaid.user.sync', () => {
    expect(cronSpecs.hourly.cron).toBe('0 * * * *');
    expect(cronSpecs.hourly.eventName).toBe('plaid.user.sync');
    expect(typeof cronSpecs.hourly.handler).toBe('function');
  });
});
