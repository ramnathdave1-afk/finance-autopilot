// Typed wrapper around a remote browser session (Browserbase + Stagehand).
//
// The real Browserbase SDK is NOT imported here. Instead, all browser
// interaction goes through `BrowserAdapter`, which is swappable via
// setBrowserAdapterFactory(). Production wires the real adapter; tests
// inject a MockAdapter. The default adapter throws with a TODO marker
// so any accidental "real" call in a test fails loudly.

import type { ZodSchema } from 'zod';

export interface Screenshot {
  url: string;
  pngBytes: number;
}

export interface Observation {
  html: string;
  url: string;
}

/**
 * Low-level adapter. One instance per session.
 * Implementations: DefaultAdapter (throws), MockAdapter (tests),
 * BrowserbaseAdapter (TODO — wraps real SDK).
 */
export interface BrowserAdapter {
  navigate(url: string): Promise<void>;
  act(instruction: string): Promise<void>;
  /**
   * Pull structured data off the current page. `instruction` steers what the
   * extractor looks for (e.g. the merchant's success selector / banner text) so
   * a generic `{found}` boolean is actually anchored to a real signal. Adapters
   * that ignore the instruction (the HAR fake) still satisfy the contract.
   */
  extract<T>(schema: ZodSchema<T>, instruction?: string): Promise<T>;
  observe(): Promise<Observation>;
  screenshot(): Promise<Screenshot>;
  close(): Promise<void>;
}

export type BrowserAdapterFactory = (userId: string) => Promise<BrowserAdapter>;

class DefaultAdapter implements BrowserAdapter {
  // TODO(integrate-browserbase-sdk): import @browserbasehq/sdk + @browserbasehq/stagehand,
  // construct a real session here (createSession, attach Stagehand, navigate / act / extract
  // wired through). Until then, anyone calling this in prod gets a loud failure.
  async navigate(): Promise<void> {
    throw new Error('[browserbase] real adapter not wired — TODO(integrate-browserbase-sdk)');
  }
  async act(): Promise<void> {
    throw new Error('[browserbase] real adapter not wired — TODO(integrate-browserbase-sdk)');
  }
  async extract<T>(_schema: ZodSchema<T>, _instruction?: string): Promise<T> {
    throw new Error('[browserbase] real adapter not wired — TODO(integrate-browserbase-sdk)');
  }
  async observe(): Promise<Observation> {
    throw new Error('[browserbase] real adapter not wired — TODO(integrate-browserbase-sdk)');
  }
  async screenshot(): Promise<Screenshot> {
    throw new Error('[browserbase] real adapter not wired — TODO(integrate-browserbase-sdk)');
  }
  async close(): Promise<void> {
    /* no-op */
  }
}

const defaultFactory: BrowserAdapterFactory = async () => new DefaultAdapter();

let _factory: BrowserAdapterFactory = defaultFactory;

export function setBrowserAdapterFactory(f: BrowserAdapterFactory): void {
  _factory = f;
}

export function resetBrowserAdapterFactory(): void {
  _factory = defaultFactory;
}

/**
 * High-level session handle. Owns one adapter + tracks lifecycle.
 * Methods mirror the Browserbase + Stagehand surface so swapping in the
 * real SDK is a one-file change inside the adapter.
 *
 * SECURITY: never store credentials on the instance. The agent passes them
 * into act() instructions and they live only in the remote browser memory.
 */
export class BrowserSession {
  private closed = false;
  constructor(
    public readonly userId: string,
    private readonly adapter: BrowserAdapter,
  ) {}

  private ensureOpen(): void {
    if (this.closed) throw new Error('[browserbase] session closed');
  }

  async navigate(url: string): Promise<void> {
    this.ensureOpen();
    return this.adapter.navigate(url);
  }

  /** Natural-language action (Stagehand-style). */
  async act(instruction: string): Promise<void> {
    this.ensureOpen();
    return this.adapter.act(instruction);
  }

  async extract<T>(schema: ZodSchema<T>, instruction?: string): Promise<T> {
    this.ensureOpen();
    return this.adapter.extract(schema, instruction);
  }

  async observe(): Promise<Observation> {
    this.ensureOpen();
    return this.adapter.observe();
  }

  async screenshot(): Promise<Screenshot> {
    this.ensureOpen();
    return this.adapter.screenshot();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.adapter.close();
  }
}

export async function createSession(userId: string): Promise<BrowserSession> {
  const adapter = await _factory(userId);
  return new BrowserSession(userId, adapter);
}
