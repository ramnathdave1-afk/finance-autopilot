import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock the real Stagehand SDK so these tests are fully deterministic and never
// touch the network or launch a browser. The mocks record calls so we can
// assert the adapter maps BrowserAdapter methods onto the v3 surface.
//
// vi.mock() is hoisted above module-level code, so the mock objects are created
// inside vi.hoisted() (which runs first) and shared with the factory below.
const { page, stagehandInstance, StagehandMock } = vi.hoisted(() => {
  const page = {
    goto: vi.fn(async () => null),
    url: vi.fn(() => 'https://billing.example.com/account'),
    evaluate: vi.fn(async () => '<html><body>account</body></html>'),
    screenshot: vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])),
  };
  const stagehandInstance = {
    init: vi.fn(async () => undefined),
    act: vi.fn(async () => ({ success: true })),
    extract: vi.fn(async () => ({ plan: 'Pro', priceUsd: 20 })),
    close: vi.fn(async () => undefined),
    context: { activePage: () => page },
  };
  const StagehandMock = vi.fn(() => stagehandInstance);
  return { page, stagehandInstance, StagehandMock };
});

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: StagehandMock,
}));

import { BrowserbaseAdapter, browserbaseAdapterFactory } from '../src/browserbase-adapter';

const ENV = {
  BROWSERBASE_API_KEY: 'bb_test_key',
  BROWSERBASE_PROJECT_ID: 'proj_test',
};

describe('BrowserbaseAdapter — honesty contract (env validation)', () => {
  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k as keyof typeof ENV];
  });

  it('throws when BROWSERBASE_API_KEY is unset', () => {
    delete process.env.BROWSERBASE_API_KEY;
    process.env.BROWSERBASE_PROJECT_ID = ENV.BROWSERBASE_PROJECT_ID;
    expect(() => new BrowserbaseAdapter()).toThrow(/BROWSERBASE_API_KEY not set/);
  });

  it('throws when BROWSERBASE_PROJECT_ID is unset', () => {
    process.env.BROWSERBASE_API_KEY = ENV.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    expect(() => new BrowserbaseAdapter()).toThrow(/BROWSERBASE_PROJECT_ID not set/);
  });

  it('factory rejects when env vars are unset (no fake session)', async () => {
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    await expect(browserbaseAdapterFactory('user-1')).rejects.toThrow(/BROWSERBASE_API_KEY not set/);
  });
});

describe('BrowserbaseAdapter — maps onto Stagehand v3', () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    vi.clearAllMocks();
  });
  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k as keyof typeof ENV];
  });

  it('constructs Stagehand with BROWSERBASE env + credentials', () => {
    new BrowserbaseAdapter();
    expect(StagehandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: 'BROWSERBASE',
        apiKey: 'bb_test_key',
        projectId: 'proj_test',
      }),
    );
  });

  it('navigate() inits once then calls page.goto', async () => {
    const adapter = new BrowserbaseAdapter();
    await adapter.navigate('https://billing.example.com');
    await adapter.navigate('https://billing.example.com/account');
    expect(stagehandInstance.init).toHaveBeenCalledTimes(1); // init is idempotent
    expect(page.goto).toHaveBeenCalledWith('https://billing.example.com');
    expect(page.goto).toHaveBeenCalledWith('https://billing.example.com/account');
  });

  it('act() delegates to stagehand.act', async () => {
    const adapter = new BrowserbaseAdapter();
    await adapter.act('Click cancel subscription');
    expect(stagehandInstance.act).toHaveBeenCalledWith('Click cancel subscription');
  });

  it('extract() passes the zod schema and returns the inferred result typed as T', async () => {
    const adapter = new BrowserbaseAdapter();
    const schema = z.object({ plan: z.string(), priceUsd: z.number() });
    const result = await adapter.extract(schema);
    // schema is forwarded as the second arg to stagehand.extract.
    expect(stagehandInstance.extract).toHaveBeenCalledWith(expect.any(String), schema);
    expect(result).toEqual({ plan: 'Pro', priceUsd: 20 });
  });

  it('observe() builds {html,url} from the page', async () => {
    const adapter = new BrowserbaseAdapter();
    await adapter.navigate('https://billing.example.com/account');
    const obs = await adapter.observe();
    expect(obs).toEqual({
      html: '<html><body>account</body></html>',
      url: 'https://billing.example.com/account',
    });
  });

  it('screenshot() returns real byte length and a data ref (never fabricated)', async () => {
    const adapter = new BrowserbaseAdapter();
    await adapter.navigate('https://billing.example.com/account');
    const shot = await adapter.screenshot();
    expect(shot.pngBytes).toBe(6); // length of the mocked PNG buffer
    expect(shot.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(page.screenshot).toHaveBeenCalledWith({ type: 'png' });
  });

  it('close() closes the stagehand session only after init', async () => {
    const adapter = new BrowserbaseAdapter();
    await adapter.close(); // not initialized yet → no-op
    expect(stagehandInstance.close).not.toHaveBeenCalled();
    await adapter.navigate('https://billing.example.com');
    await adapter.close();
    expect(stagehandInstance.close).toHaveBeenCalledTimes(1);
  });
});
