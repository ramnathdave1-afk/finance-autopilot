// Determine the negotiated outcome from a completed call's transcript.
//
// HONESTY: savings are derived from the actual call transcript via Claude, not
// assumed. If there is no transcript (audio-only recording), we cannot claim
// savings — we return savingsAchieved=false with achievedAmount=null and the
// agent records a 'no_savings' / needs-review outcome rather than inventing a
// number.

import { call } from '@fa/claude';

export interface OutcomeInput {
  provider: string;
  currentAmount: number;
  targetAmount: number;
  transcriptText: string | null;
}

export interface NegotiationOutcome {
  savingsAchieved: boolean;
  /** New monthly amount the rep agreed to, or null if none / unknown. */
  achievedAmount: number | null;
  reason: string;
}

const SYSTEM = [
  'You are reviewing a transcript of a phone call where an AI agent negotiated a',
  'recurring bill with a service provider. Decide whether the provider agreed to a',
  'LOWER recurring amount and, if so, what the new amount is.',
  'Respond ONLY with JSON: {"savingsAchieved": boolean, "achievedAmount": number|null, "reason": string}.',
  'achievedAmount is the new monthly dollar figure the rep agreed to (number only).',
  'If no reduction was agreed, set savingsAchieved=false and achievedAmount=null.',
].join(' ');

export async function analyzeOutcome(input: OutcomeInput): Promise<NegotiationOutcome> {
  // No transcript → cannot honestly claim savings.
  if (!input.transcriptText || input.transcriptText.trim().length === 0) {
    return {
      savingsAchieved: false,
      achievedAmount: null,
      reason: 'no transcript available to confirm an agreed reduction',
    };
  }

  const res = await call({
    system: SYSTEM,
    user: [
      `Provider: ${input.provider}`,
      `Original amount: $${input.currentAmount.toFixed(2)}`,
      `Target amount: $${input.targetAmount.toFixed(2)}`,
      'Transcript:',
      input.transcriptText.slice(0, 8000),
    ].join('\n'),
    tag: `bill-neg:outcome:${input.provider}`,
    maxTokens: 256,
  });

  try {
    const parsed = JSON.parse(res.text) as {
      savingsAchieved?: unknown;
      achievedAmount?: unknown;
      reason?: unknown;
    };
    const achieved =
      typeof parsed.achievedAmount === 'number' && Number.isFinite(parsed.achievedAmount)
        ? parsed.achievedAmount
        : null;
    const savings = Boolean(parsed.savingsAchieved);
    // Guard against a contradictory verdict: claiming savings but the "new"
    // amount isn't actually lower than the current one.
    const realSavings = savings && achieved !== null && achieved < input.currentAmount;
    return {
      savingsAchieved: realSavings,
      achievedAmount: realSavings ? achieved : null,
      reason: String(parsed.reason ?? ''),
    };
  } catch {
    return {
      savingsAchieved: false,
      achievedAmount: null,
      reason: 'unparseable outcome verdict',
    };
  }
}
