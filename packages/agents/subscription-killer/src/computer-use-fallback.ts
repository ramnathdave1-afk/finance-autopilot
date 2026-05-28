// Fallback path for merchants not in the registry. Uses @fa/claude
// Computer Use (anthropic-computer-use tools) — we expose a lower
// confidence bar (0.5 vs 0.7) since the model is doing more inference.
//
// On failure, the caller MUST call setRefundEligible(actionId).
//
// We stub the actual Computer Use loop here — the real implementation
// will spin up a Browserbase session and stream observe/act calls
// through Claude with the computer-use tool definitions.
//
// TODO(integrate-claude-computer-use): swap stub for real tool-use loop.

import type { BrowserSession } from '@fa/browserbase';
import type { StepRecorder } from '@fa/browserbase';
import { call } from '@fa/claude';

export interface ComputerUseInput {
  session: BrowserSession;
  recorder: StepRecorder;
  merchantHint: string;
  /** Confidence threshold for declaring success. Fallback path: 0.5. */
  confidenceThreshold?: number;
}

export interface ComputerUseResult {
  success: boolean;
  confidence: number;
  reason: string;
  screenshotUrls: string[];
}

export async function computerUseFallback(
  input: ComputerUseInput,
): Promise<ComputerUseResult> {
  const threshold = input.confidenceThreshold ?? 0.5;
  const screenshotUrls: string[] = [];

  await input.recorder.logStep('computer-use:start', true, {
    merchantHint: input.merchantHint,
    threshold,
  });

  // Observation snapshot — model decides what to do next.
  const obs = await input.session.observe();
  const shot = await input.session.screenshot();
  screenshotUrls.push(shot.url);
  await input.recorder.attachScreenshot('computer-use:observed', true, shot);

  // Ask Claude to evaluate the page for cancellation status.
  // TODO(integrate-claude-computer-use): replace with real tool-use loop.
  const verdict = await call({
    system:
      'You analyze post-cancellation pages and decide if a subscription was confirmed cancelled. Respond as JSON {"success": boolean, "confidence": number, "reason": string}.',
    user: `Merchant hint: ${input.merchantHint}\nURL: ${obs.url}\nHTML excerpt:\n${obs.html.slice(0, 4000)}`,
    tag: `subkill:computer-use:${input.merchantHint}`,
    maxTokens: 256,
  });

  let parsed: { success: boolean; confidence: number; reason: string };
  try {
    parsed = JSON.parse(verdict.text);
  } catch {
    parsed = { success: false, confidence: 0, reason: 'unparseable verdict from claude' };
  }

  const success = parsed.success && parsed.confidence >= threshold;
  await input.recorder.logStep('computer-use:verdict', success, parsed);

  return {
    success,
    confidence: parsed.confidence,
    reason: parsed.reason,
    screenshotUrls,
  };
}
