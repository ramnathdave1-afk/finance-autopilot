import { describe, it, expect, afterEach } from 'vitest';
import { mxAdapter } from '../src/fallback/mx';
import { finicityAdapter } from '../src/fallback/finicity';

const ENV = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ENV)) delete process.env[k];
  }
  Object.assign(process.env, ENV);
}

afterEach(restoreEnv);

describe('mxAdapter', () => {
  it('isConfigured is false without creds', () => {
    delete process.env.MX_CLIENT_ID;
    delete process.env.MX_API_KEY;
    expect(mxAdapter.isConfigured()).toBe(false);
  });

  it('isConfigured is true with creds', () => {
    process.env.MX_CLIENT_ID = 'cid';
    process.env.MX_API_KEY = 'key';
    expect(mxAdapter.isConfigured()).toBe(true);
  });

  it('exposes a syncItem function', () => {
    expect(typeof mxAdapter.syncItem).toBe('function');
    expect(typeof mxAdapter.refreshBalances).toBe('function');
  });
});

describe('finicityAdapter', () => {
  it('isConfigured is false without creds', () => {
    delete process.env.FINICITY_PARTNER_ID;
    delete process.env.FINICITY_PARTNER_SECRET;
    delete process.env.FINICITY_APP_KEY;
    expect(finicityAdapter.isConfigured()).toBe(false);
  });

  it('isConfigured needs all three creds', () => {
    process.env.FINICITY_PARTNER_ID = 'pid';
    process.env.FINICITY_PARTNER_SECRET = 'psec';
    expect(finicityAdapter.isConfigured()).toBe(false);
    process.env.FINICITY_APP_KEY = 'app';
    expect(finicityAdapter.isConfigured()).toBe(true);
  });

  it('adapter name matches data_provider enum value', () => {
    expect(mxAdapter.name).toBe('mx');
    expect(finicityAdapter.name).toBe('finicity');
  });
});
