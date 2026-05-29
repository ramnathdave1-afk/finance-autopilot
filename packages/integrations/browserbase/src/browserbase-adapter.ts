// BrowserbaseAdapter — the live, env-key-driven implementation of BrowserAdapter.
//
// This is the production seam for Subscription Killer's web automation. It is
// NEVER used by unit tests of the agent (those inject a MockAdapter via
// setBrowserAdapterFactory). It wraps a real Stagehand v3 instance running on
// Browserbase (env: 'BROWSERBASE').
//
// Honesty contract (matches @fa/twilio RealTwilioAdapter): construction reads
// BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID from the environment and throws
// LOUDLY when either is missing. Nothing here fakes a session or fabricates a
// result — every method either returns what the remote browser actually did or
// throws. Credentials are never logged.
//
// To go live: call `useRealBrowserbase()` once at app boot with the env vars set.

import { Stagehand } from '@browserbasehq/stagehand';
import type { ZodSchema } from 'zod';

import {
  type BrowserAdapter,
  type BrowserAdapterFactory,
  type Observation,
  type Screenshot,
  setBrowserAdapterFactory,
} from './session';

interface BrowserbaseEnv {
  apiKey: string;
  projectId: string;
}

/**
 * Read the Browserbase credentials from the environment. Throws loudly (with a
 * clear, credential-free message) when either is missing — we never construct a
 * session against a fake/empty key, which would silently produce bogus results.
 */
function readEnv(): BrowserbaseEnv {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey) {
    throw new Error('[browserbase] BROWSERBASE_API_KEY not set — refusing to start a fake session');
  }
  if (!projectId) {
    throw new Error(
      '[browserbase] BROWSERBASE_PROJECT_ID not set — refusing to start a fake session',
    );
  }
  return { apiKey, projectId };
}

/**
 * Live adapter backed by Stagehand v3 on Browserbase.
 *
 * Construction is split from initialization: the constructor validates env and
 * builds the Stagehand instance; `ensureInit()` performs the async `init()` on
 * first use so a single user-facing call chain (navigate → act → extract …)
 * shares one initialized session.
 */
export class BrowserbaseAdapter implements BrowserAdapter {
  private readonly stagehand: Stagehand;
  private initialized = false;

  constructor() {
    const env = readEnv();
    this.stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: env.apiKey,
      projectId: env.projectId,
    });
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    await this.stagehand.init();
    this.initialized = true;
  }

  /**
   * Resolve the active Stagehand v3 Page (the Playwright-style page surface used
   * for raw navigation / screenshot / html). Throws if no page is available
   * rather than fabricating an empty observation.
   */
  private activePage() {
    const page = this.stagehand.context.activePage();
    if (!page) {
      throw new Error('[browserbase] no active page — session not navigated yet');
    }
    return page;
  }

  async navigate(url: string): Promise<void> {
    await this.ensureInit();
    await this.activePage().goto(url);
  }

  async act(instruction: string): Promise<void> {
    await this.ensureInit();
    await this.stagehand.act(instruction);
  }

  async extract<T>(schema: ZodSchema<T>): Promise<T> {
    await this.ensureInit();
    // Stagehand v3 extract<T extends StagehandZodSchema>(instruction, schema)
    // returns the schema-inferred shape. ZodSchema<T> satisfies StagehandZodSchema
    // and infers back to T, but the two zod type families (the SDK's bundled zod
    // vs. our workspace zod) are nominally distinct, so we narrow the result.
    const result = await this.stagehand.extract(
      'Extract the structured data described by the provided schema from the current page.',
      schema as never,
    );
    return result as T;
  }

  async observe(): Promise<Observation> {
    await this.ensureInit();
    const page = this.activePage();
    // Stagehand v3 Page has no content() helper; read the live document HTML via
    // an in-page evaluate, and the synchronous cached url().
    const html = await page.evaluate<string>(() => document.documentElement.outerHTML);
    return { html, url: page.url() };
  }

  async screenshot(): Promise<Screenshot> {
    await this.ensureInit();
    // Stagehand v3 Page.screenshot() returns the raw PNG Buffer. There is no
    // hosted URL, so we surface the real byte length and a data: ref so callers
    // can tell a real capture from a fabricated one without us inventing a URL.
    const png = await this.activePage().screenshot({ type: 'png' });
    const bytes = new Uint8Array(png);
    return {
      url: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
      pngBytes: bytes.byteLength,
    };
  }

  async close(): Promise<void> {
    if (!this.initialized) return;
    await this.stagehand.close();
    this.initialized = false;
  }
}

/**
 * Factory matching BrowserAdapterFactory. Validates credentials eagerly (in the
 * constructor) so a misconfigured deploy fails at session creation, not mid-run.
 */
export const browserbaseAdapterFactory: BrowserAdapterFactory = async (_userId: string) =>
  new BrowserbaseAdapter();

/**
 * Install the real Browserbase adapter as the process-wide factory. Call once at
 * app boot. After this, createSession() drives real remote browsers.
 */
export function useRealBrowserbase(): void {
  setBrowserAdapterFactory(browserbaseAdapterFactory);
}
