// PRD §8.4 Agent 13 — Tax Prep (Tier-3).
//
// Year-round, the agent scans the user's categorized transactions to:
//   1. flag likely deductibles (Schedule-C / itemized buckets), and
//   2. aggregate 1099-type income (Stripe / Cash App / Patreon / YouTube / …),
// then writes a RUNNING TAX SUMMARY to the agent_actions audit log so the user
// always sees an up-to-date picture.
//
// RECOMMEND-ONLY (PRD §8.4): this agent never files a return and never moves
// money. `requiresApproval: true` — producing the summary is informational, but
// the optional filing-software HANDOFF (TurboTax / H&R Block) is gated behind
// explicit user approval and only fires when the input carries a `handoff`
// directive. The handoff itself goes through TaxFilingPort.
//
// HONESTY: the external filing handoff goes through TaxFilingPort. The live port
// reads provider credentials from env and throws if absent; tests use a mock and
// never touch the network. We never fabricate a "filed"/"handed off" result —
// any port failure propagates and escalates through the standard retry path.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import {
  buildTaxSummary,
  defaultTaxYear,
  DEFAULT_1099_PAYERS,
  type PayerMatch,
  type TaxSummary,
} from './classify';
import { getTransactionsForYear } from './transactions-store';
import {
  getTaxFilingPort,
  type TaxFilingProvider,
  type TaxHandoffResult,
} from './tax-filing-port';

export interface TaxPrepInput {
  /**
   * Tax (calendar) year to summarize. Defaults to {@link defaultTaxYear} — the
   * prior completed year during filing season (Jan–Apr), else the current year.
   */
  taxYear?: number;
  /** Optional payer overrides for 1099 matching (tests / niche payers). */
  payers?: PayerMatch[];
  /**
   * If present, AFTER computing the summary, hand it off to the named filing
   * provider via TaxFilingPort. Recommend-only otherwise. The action requires
   * approval, so a handoff only ever runs on an approved, user-initiated run.
   */
  handoff?: { provider: TaxFilingProvider };
}

export interface TaxPrepData {
  summary: TaxSummary;
  /** Present only when a handoff was requested AND succeeded. */
  handoff: TaxHandoffResult | null;
}

export const taxPrepAgent: AgentDefinition<TaxPrepInput> = defineAgent<TaxPrepInput>({
  type: 'tax_prep',
  actionType: 'tax_summary',
  // Recommend-only Tier-3 agent: the summary is informational but the optional
  // filing handoff touches an external provider, so we gate the whole action
  // behind approval per PRD §8.4.
  requiresApproval: true,
  // One running-summary pass per user per tax year per run target. Re-running
  // refreshes; the audit log captures each pass.
  idempotencyKey: (i) => {
    const year = i.taxYear ?? defaultTaxYear();
    const suffix = i.handoff ? `:handoff:${i.handoff.provider}` : '';
    return `tax-prep:${year}${suffix}`;
  },
  run: async (input, ctx) => {
    const taxYear = input.taxYear ?? defaultTaxYear();
    const payers = input.payers ?? DEFAULT_1099_PAYERS;

    await ctx.log('scan:start', true, { taxYear });
    const txns = await getTransactionsForYear(ctx.userId, taxYear);
    await ctx.log('scan:done', true, { transactionCount: txns.length });

    const summary = buildTaxSummary(txns, taxYear, payers);
    // Persist the FULL summary lists into the audit step so the UI can render
    // the actual per-payer income, needs-review P2P totals, and per-bucket
    // deductions — runAgent stores only roi + audit_log, so logging counts
    // alone would discard the core deliverable.
    await ctx.log('summary:built', true, {
      taxYear,
      total1099Income: summary.total1099Income,
      payerCount: summary.income1099.length,
      totalDeductions: summary.totalDeductions,
      deductionFlagCount: summary.deductibleFlags.length,
      netSelfEmploymentEstimate: summary.netSelfEmploymentEstimate,
      income1099: summary.income1099,
      needsReview1099: summary.needsReview1099,
      deductionsByBucket: summary.deductionsByBucket,
    });

    // Optional filing-software handoff. Recommend-only by default — only runs
    // when the (approved) input explicitly asks for it. Failures propagate and
    // escalate through runAgent's retry path; we NEVER fake a handoff result.
    let handoff: TaxHandoffResult | null = null;
    if (input.handoff) {
      await ctx.log('handoff:start', true, { provider: input.handoff.provider });
      const port = await getTaxFilingPort();
      handoff = await port.handoff({
        provider: input.handoff.provider,
        taxYear,
        summary,
      });
      await ctx.log('handoff:done', true, {
        provider: handoff.provider,
        referenceId: handoff.referenceId,
      });
    }

    const data: TaxPrepData = { summary, handoff };

    // roi is null: this is recommendation-mode. No dollars are recovered or
    // moved — the summary informs the user, and any savings come later when
    // they file. We do not invent a deduction-based "savings" figure.
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});
