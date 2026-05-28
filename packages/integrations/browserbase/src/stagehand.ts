// Thin wrapper over BrowserSession.act/extract for the common cancellation
// patterns that show up across the merchant registry: login, navigate to
// billing, click cancel, confirm. Each helper returns a StagehandResult so
// the agent can record an audit step + screenshot per phase.

import { z } from 'zod';
import type { BrowserSession, Screenshot } from './session';

export type StagehandStep =
  | { kind: 'login'; loginUrl: string }
  | { kind: 'navigate'; url: string; label?: string }
  | { kind: 'click'; instruction: string }
  | { kind: 'confirm'; instruction: string };

export interface StagehandResult {
  ok: boolean;
  screenshot: Screenshot;
  reason?: string;
}

/**
 * Open login URL and submit credentials. Credentials are passed into the
 * adapter via the natural-language instruction — they never get logged.
 */
export async function loginAndNavigate(
  session: BrowserSession,
  loginUrl: string,
  credentials: { username: string; password: string },
  postLoginUrl?: string,
): Promise<StagehandResult> {
  await session.navigate(loginUrl);
  // The literal credential values are passed inline. Adapters MUST NOT echo
  // them into logs or screenshots metadata. The DefaultAdapter throws so
  // there's no accidental logging in prod paths.
  await session.act(
    `Enter username "${credentials.username}" and password "${credentials.password}" then submit the login form.`,
  );
  if (postLoginUrl) await session.navigate(postLoginUrl);
  const screenshot = await session.screenshot();
  return { ok: true, screenshot };
}

export async function clickCancelFlow(
  session: BrowserSession,
  clickInstruction: string,
): Promise<StagehandResult> {
  try {
    await session.act(clickInstruction);
    const screenshot = await session.screenshot();
    return { ok: true, screenshot };
  } catch (e) {
    const screenshot = await session.screenshot();
    return {
      ok: false,
      screenshot,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function confirmCancellation(
  session: BrowserSession,
  confirmInstruction: string,
  successSelector?: string,
): Promise<StagehandResult> {
  try {
    await session.act(confirmInstruction);
    const screenshot = await session.screenshot();
    if (successSelector) {
      const extracted = await session.extract(
        z.object({ found: z.boolean(), text: z.string().optional() }),
      );
      if (!extracted.found) {
        return { ok: false, screenshot, reason: `success selector not found: ${successSelector}` };
      }
    }
    return { ok: true, screenshot };
  } catch (e) {
    const screenshot = await session.screenshot();
    return {
      ok: false,
      screenshot,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
