// PRD §8.2 Agent 1 — Subscription Killer.
//
// Flow (per PRD §10 orchestration + §16 trust):
//   1. Lookup merchant spec.
//   2. If subscription already cancelled, no-op (idempotency on top of
//      the Inngest idempotency_key).
//   3. If cancelMethod === 'voice', log TODO(integrate-twilio) and
//      return roi:null — T-future will wire the RKV voice stack.
//   4. Open a Browserbase session, walk the spec steps via stagehand
//      wrappers, screenshot each phase into audit_log.
//   5. Verify success two ways: success selector via extract(), OR ask
//      Claude with the post-cancel HTML for a {success, confidence,
//      reason} verdict. Require confidence > 0.7.
//   6. On success: flip subscription.status=cancelled, compute
//      roi = monthlyAmountEstimate * 12, return.
//   7. On failure: throw — defineAgent retries 3x with backoff, then
//      onFailure sets refund_eligible=true on agent_actions.

import { defineAgent, type AgentRunContext, type AgentRunResult } from '@fa/inngest';
import { call } from '@fa/claude';
import {
  createSession,
  loginAndNavigate,
  clickCancelFlow,
  confirmCancellation,
  stepRecorder,
} from '@fa/browserbase';
import type { Subscription } from '@fa/types';
import { lookupMerchant, type MerchantCancelSpec } from './registry';
import { computerUseFallback } from './computer-use-fallback';
import { setRefundEligible } from './refund-eligible';
import { getSubscription, markSubscriptionCancelled } from './subscription-lookup';

export interface SubKillerInput {
  subscriptionId: string;
  merchantKey: string;
  /** SESSION-ONLY. Never stored, never logged. PRD §16. */
  credentials?: { username: string; password: string };
}

const SUCCESS_CONFIDENCE_THRESHOLD = 0.7;

/** Annualized-month multiplier per billing frequency. */
const FREQUENCY_TO_ANNUAL_MULTIPLIER: Record<Subscription['frequency'], number> = {
  weekly: 52,
  monthly: 12,
  annual: 1,
};

/** Normalize a merchant string for identity comparison (case/punctuation/space insensitive). */
function normalizeMerchant(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Guard: the subscription row we're about to flip must actually be the merchant
 * we cancelled in the browser. Without this the agent can cancel merchant A in
 * the remote browser while marking a DIFFERENT subscription row (merchant B)
 * cancelled — silent data corruption + false ROI. Match the row's free-text
 * merchant against the spec's key/displayName.
 */
function subscriptionMatchesSpec(sub: Subscription, spec: MerchantCancelSpec): boolean {
  const rowMerchant = normalizeMerchant(sub.merchant);
  if (!rowMerchant) return false;
  const key = normalizeMerchant(spec.merchantKey);
  const display = normalizeMerchant(spec.displayName);
  // Accept exact match or containment either direction — transaction merchant
  // strings are noisy ("NETFLIX.COM", "Netflix Premium") but must share the brand.
  return (
    rowMerchant === key ||
    rowMerchant === display ||
    rowMerchant.includes(key) ||
    key.includes(rowMerchant) ||
    rowMerchant.includes(display) ||
    display.includes(rowMerchant)
  );
}

/**
 * Compute annual ROI from the actual subscription row (real amount + billing
 * frequency), not a hardcoded registry estimate. Falls back to the registry
 * estimate only when the row has no usable amount.
 */
function computeRoi(sub: Subscription, spec: MerchantCancelSpec): number | null {
  if (typeof sub.amount === 'number' && sub.amount > 0) {
    const multiplier = FREQUENCY_TO_ANNUAL_MULTIPLIER[sub.frequency] ?? 12;
    return Number((sub.amount * multiplier).toFixed(2));
  }
  return spec.monthlyAmountEstimate
    ? Number((spec.monthlyAmountEstimate * 12).toFixed(2))
    : null;
}

/**
 * Inspect post-cancellation page with Claude and return a verdict.
 * Used when the success selector can't be confirmed directly.
 */
async function verifyViaClaude(
  html: string,
  url: string,
  merchantKey: string,
): Promise<{ success: boolean; confidence: number; reason: string }> {
  const res = await call({
    system:
      'You are reviewing a web page captured immediately after attempting to cancel a subscription. Decide whether the page confirms cancellation. Respond ONLY with JSON: {"success": boolean, "confidence": number between 0 and 1, "reason": string}.',
    user: `Merchant: ${merchantKey}\nURL: ${url}\nHTML excerpt:\n${html.slice(0, 6000)}`,
    tag: `subkill:verify:${merchantKey}`,
    maxTokens: 256,
  });
  try {
    const parsed = JSON.parse(res.text);
    return {
      success: Boolean(parsed.success),
      confidence: Number(parsed.confidence) || 0,
      reason: String(parsed.reason ?? ''),
    };
  } catch {
    return { success: false, confidence: 0, reason: 'unparseable verdict' };
  }
}

async function runCancellation(
  input: SubKillerInput,
  ctx: AgentRunContext,
): Promise<AgentRunResult> {
  const spec = lookupMerchant(input.merchantKey);
  const recorder = stepRecorder(ctx.actionId);

  await recorder.logStep('lookup-merchant', !!spec, { merchantKey: input.merchantKey });

  // Idempotency on top of Inngest: if already cancelled, no-op.
  const sub = await getSubscription(input.subscriptionId);
  if (!sub) {
    // No row → nothing legitimate to flip. Refuse rather than cancel a merchant
    // in the browser with no subscription to bind the result to.
    throw new Error(`subscription not found: ${input.subscriptionId}`);
  }
  if (sub.status === 'cancelled') {
    await recorder.logStep('already-cancelled', true, { subscriptionId: input.subscriptionId });
    return { roi: 0, data: { alreadyCancelled: true } };
  }

  // Voice path — stubbed until Twilio is wired.
  if (spec?.cancelMethod === 'voice') {
    await recorder.logStep('voice-cancel:stub', true, {
      merchantKey: input.merchantKey,
      // TODO(integrate-twilio): drive the call via Twilio + the RKV voice stack.
      note: 'TODO(integrate-twilio): wire voice cancellation flow',
    });
    return { roi: null, data: { method: 'voice', stubbed: true } };
  }

  // Unknown merchant — use Computer Use fallback (lower confidence bar).
  if (!spec) {
    if (!input.credentials) {
      throw new Error('credentials required for computer-use fallback');
    }
    const session = await createSession(ctx.userId);
    try {
      const fallback = await computerUseFallback({
        session,
        recorder,
        merchantHint: input.merchantKey,
      });
      if (!fallback.success) {
        throw new Error(
          `computer-use fallback failed (confidence=${fallback.confidence}): ${fallback.reason}`,
        );
      }
      await markSubscriptionCancelled(input.subscriptionId, 'web');
      return {
        roi: null,
        data: {
          merchantKey: input.merchantKey,
          method: 'computer-use',
          screenshotUrls: fallback.screenshotUrls,
        },
      };
    } finally {
      await session.close();
    }
  }

  // Registry-driven web flow.
  if (!input.credentials) {
    throw new Error(`credentials required for ${spec.merchantKey} web cancel`);
  }

  // Bind the browser cancellation to THIS subscription row. If the row's
  // merchant doesn't match the merchant we're about to cancel in the browser,
  // refuse — otherwise we'd cancel one service and flip a different row's status.
  if (!subscriptionMatchesSpec(sub, spec)) {
    await recorder.logStep('merchant-mismatch', false, {
      subscriptionId: input.subscriptionId,
      rowMerchant: sub.merchant,
      merchantKey: spec.merchantKey,
    });
    throw new Error(
      `merchant mismatch: subscription "${sub.merchant}" does not match cancel target "${spec.merchantKey}"`,
    );
  }

  const session = await createSession(ctx.userId);
  const screenshotUrls: string[] = [];

  try {
    const login = await loginAndNavigate(
      session,
      spec.loginUrl,
      input.credentials,
      spec.billingUrl,
    );
    screenshotUrls.push(login.screenshot.url);
    await recorder.attachScreenshot('login', login.ok, login.screenshot, {
      merchantKey: spec.merchantKey,
    });
    if (!login.ok) throw new Error(`login failed: ${login.reason ?? 'unknown'}`);

    const click = await clickCancelFlow(
      session,
      `Click the cancel-subscription element on the page. Look for selectors like ${spec.successSelector} after the click is processed.`,
    );
    screenshotUrls.push(click.screenshot.url);
    await recorder.attachScreenshot('click-cancel', click.ok, click.screenshot, {
      merchantKey: spec.merchantKey,
    });
    if (!click.ok) throw new Error(`cancel click failed: ${click.reason ?? 'unknown'}`);

    const confirm = await confirmCancellation(
      session,
      `Confirm the cancellation. Verify the page now shows the success state matching: ${spec.successSelector}`,
      spec.successSelector,
    );
    screenshotUrls.push(confirm.screenshot.url);
    await recorder.attachScreenshot('confirm', confirm.ok, confirm.screenshot, {
      merchantKey: spec.merchantKey,
    });

    // Either the selector matched OR fall back to Claude verdict.
    let verified = confirm.ok;
    let verdict: { success: boolean; confidence: number; reason: string } | null = null;
    if (!verified) {
      const obs = await session.observe();
      verdict = await verifyViaClaude(obs.html, obs.url, spec.merchantKey);
      verified = verdict.success && verdict.confidence > SUCCESS_CONFIDENCE_THRESHOLD;
      await recorder.logStep('claude-verify', verified, verdict);
    }

    if (!verified) {
      throw new Error(
        `cancellation not confirmed (selector miss + claude verdict ${
          verdict ? `${verdict.confidence}: ${verdict.reason}` : 'n/a'
        })`,
      );
    }

    await markSubscriptionCancelled(input.subscriptionId, 'web');

    // ROI from the actual subscription row (real amount + billing frequency),
    // not the hardcoded registry estimate.
    const roi = computeRoi(sub, spec);

    return {
      roi,
      data: {
        merchantKey: spec.merchantKey,
        method: 'web',
        screenshotUrls,
      },
    };
  } finally {
    await session.close();
  }
}

export const subscriptionKillerAgent = defineAgent<SubKillerInput>({
  type: 'subscription_killer',
  actionType: 'cancel',
  requiresApproval: true,
  idempotencyKey: ({ subscriptionId }) => `cancel:${subscriptionId}`,
  run: runCancellation,
  onFailure: async (_input, ctx) => {
    // PRD §16: failed cancellations → user owed credit. T5 sweeps refund_eligible
    // rows during the nightly Stripe job.
    const result = await setRefundEligible(ctx.actionId);
    await ctx.log('refund-eligible:set', result.ok, {
      reason: result.reason ?? null,
    });
  },
});
