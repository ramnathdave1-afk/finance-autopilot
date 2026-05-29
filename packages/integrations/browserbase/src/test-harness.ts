// replayFromHar — load a recorded HAR JSON file and serve canned responses
// to a fake BrowserAdapter. The HAR shape we use is a *small subset* of the
// real HAR spec — just enough to drive happy + failure paths in tests.
//
// Each entry in `entries` maps to one expected browser action ('navigate',
// 'act', 'extract', 'observe', 'screenshot'). The fake adapter walks through
// them in order; if a call doesn't match the next expected entry, it throws,
// so tests fail loudly when the agent diverges from the recorded path.

import { readFileSync } from 'node:fs';
import type { ZodSchema } from 'zod';
import type { BrowserAdapter, Observation, Screenshot } from './session';

export type HarEntryKind = 'navigate' | 'act' | 'extract' | 'observe' | 'screenshot' | 'close';

export interface HarEntry {
  kind: HarEntryKind;
  /** Matches navigate(url) or act(instruction). Optional for observe/screenshot. */
  match?: string;
  /** Response payload — shape depends on `kind`. */
  response?: {
    /** For observe. */
    html?: string;
    url?: string;
    /** For extract. */
    data?: unknown;
    /** For screenshot. */
    screenshotUrl?: string;
    pngBytes?: number;
    /** Force an error instead of a success. */
    throwMessage?: string;
  };
}

export interface HarScenario {
  name: string;
  entries: HarEntry[];
}

export interface HarFile {
  scenarios: HarScenario[];
}

export interface FakeAdapterFromHar extends BrowserAdapter {
  /** Number of entries consumed so far — handy in assertions. */
  cursor(): number;
  /** Remaining entry count. */
  remaining(): number;
}

export function loadHar(path: string): HarFile {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as HarFile;
}

export function replayFromHar(harPath: string, scenarioName: string): FakeAdapterFromHar {
  const har = loadHar(harPath);
  const scenario = har.scenarios.find((s) => s.name === scenarioName);
  if (!scenario) {
    throw new Error(`[har] scenario "${scenarioName}" not found in ${harPath}`);
  }
  return makeFakeAdapter(scenario);
}

export function makeFakeAdapter(scenario: HarScenario): FakeAdapterFromHar {
  let i = 0;
  const next = (expected: HarEntryKind, match?: string): HarEntry => {
    const entry = scenario.entries[i];
    if (!entry) {
      throw new Error(`[har:${scenario.name}] ran past end of script at call #${i} (${expected})`);
    }
    if (entry.kind !== expected) {
      throw new Error(
        `[har:${scenario.name}] call #${i} expected ${entry.kind} got ${expected}`,
      );
    }
    if (entry.match !== undefined && match !== undefined && !match.includes(entry.match)) {
      throw new Error(
        `[har:${scenario.name}] call #${i} match mismatch — wanted "${entry.match}" in "${match}"`,
      );
    }
    if (entry.response?.throwMessage) {
      i += 1;
      throw new Error(entry.response.throwMessage);
    }
    i += 1;
    return entry;
  };

  return {
    cursor: () => i,
    remaining: () => scenario.entries.length - i,
    async navigate(url) {
      next('navigate', url);
    },
    async act(instruction) {
      next('act', instruction);
    },
    async extract<T>(_schema: ZodSchema<T>, _instruction?: string): Promise<T> {
      const entry = next('extract');
      return (entry.response?.data ?? {}) as T;
    },
    async observe(): Promise<Observation> {
      const entry = next('observe');
      return {
        html: entry.response?.html ?? '',
        url: entry.response?.url ?? '',
      };
    },
    async screenshot(): Promise<Screenshot> {
      const entry = next('screenshot');
      return {
        url: entry.response?.screenshotUrl ?? 'https://test/screenshot.png',
        pngBytes: entry.response?.pngBytes ?? 1024,
      };
    },
    async close() {
      // close is optional in the script
      const entry = scenario.entries[i];
      if (entry && entry.kind === 'close') i += 1;
    },
  };
}
