// Call-script generation via @fa/claude. The agent hands this script to the
// Twilio voice layer, which voices it / uses it as the negotiating playbook.

import { call } from '@fa/claude';

export interface ScriptInput {
  provider: string;
  currentAmount: number;
  targetAmount: number;
  /** Optional account context the rep may ask for (masked). */
  accountNumberMasked?: string | undefined;
  billingPeriod?: string | undefined;
}

export interface NegotiationScript {
  /** The text the AI voice works from on the call. */
  script: string;
}

const SYSTEM = [
  'You are a polite, firm consumer advocate writing a phone script for an AI voice agent',
  'that will call a service provider to negotiate a recurring bill DOWN.',
  'Write a natural spoken script: a greeting, the ask (lower the rate), 2-3 concrete',
  'leverage points (loyalty, competitor pricing, threat to cancel), how to handle a',
  '"no", and a graceful close. Stay truthful — never invent account facts.',
  'Respond ONLY with JSON: {"script": string}.',
].join(' ');

/**
 * Build a negotiation call script. Throws if Claude returns something that
 * can't be parsed into a usable script (the agent treats that as a failure,
 * never a silent empty-script success).
 */
export async function generateScript(input: ScriptInput): Promise<NegotiationScript> {
  const user = [
    `Provider: ${input.provider}`,
    `Current charge: $${input.currentAmount.toFixed(2)} per ${input.billingPeriod ?? 'month'}`,
    `Target charge: $${input.targetAmount.toFixed(2)} per ${input.billingPeriod ?? 'month'}`,
    input.accountNumberMasked ? `Account (masked): ${input.accountNumberMasked}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await call({
    system: SYSTEM,
    user,
    tag: `bill-neg:script:${input.provider}`,
    maxTokens: 800,
  });

  let script: string;
  try {
    const parsed = JSON.parse(res.text) as { script?: unknown };
    script = typeof parsed.script === 'string' ? parsed.script.trim() : '';
  } catch {
    // Fall back to raw text if the model didn't wrap in JSON, but still require
    // non-empty content.
    script = res.text.trim();
  }
  if (!script) throw new Error('script generation produced empty output');
  return { script };
}
