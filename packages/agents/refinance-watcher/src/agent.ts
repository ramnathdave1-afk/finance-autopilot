// Agent 11 — Refinance Watcher (PRD §8.3).
//
// Daily (after the rate-refresh cron has updated rate_snapshots): pull the
// user's loans, compare each against the freshest published rate for its
// loan_type, and surface every loan where refinancing would save at least the
// threshold ($1000 over the loan's life by default). RECOMMEND ONLY — we
// notify; the user requests an actual offer from the web UI. No money moves,
// no application is filed autonomously (PRD §5 non-goal #2, §16 trust).
//
// Rate ingestion is NOT done here — that's refreshRates() behind RatePort,
// driven by its own daily cron. This agent only reads what's already persisted,
// so it never fabricates a rate.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import type { LoanRow, LoanType } from '@fa/db/types';
import { getUserLoans, getLatestSnapshots } from './loan-store';
import {
  clearsThreshold,
  DEFAULT_SAVINGS_THRESHOLD_DOLLARS,
  type SavingsResult,
} from './savings';

export interface RefinanceWatcherInput {
  /** Whose loans to evaluate. */
  userId: string;
  /** Minimum lifetime savings (dollars) to surface an opportunity. */
  thresholdDollars?: number;
  /** ISO date the evaluation runs (used for idempotency). Defaults to today. */
  evaluatedOn?: string;
}

export interface RefinanceOpportunity {
  loanId: string;
  loanType: LoanType;
  servicer: string | null;
  balance: number;
  currentApr: number;
  offeredApr: number;
  rateSource: string;
  rateCapturedOn: string;
  savings: SavingsResult;
}

export interface RefinanceWatcherData {
  evaluatedOn: string;
  thresholdDollars: number;
  loansEvaluated: number;
  opportunities: RefinanceOpportunity[];
  /** Marker: this agent NEVER files an application or moves money. */
  autonomousAction: false;
}

/** Balance used for the comparison: outstanding balance if known, else principal. */
function balanceOf(loan: LoanRow): number {
  return loan.current_balance ?? loan.principal;
}

/** Months left: explicit remaining_months if set, else fall back to the full term. */
function remainingMonthsOf(loan: LoanRow): number {
  return loan.remaining_months ?? loan.term_months;
}

export const refinanceWatcherAgent: AgentDefinition<RefinanceWatcherInput> =
  defineAgent<RefinanceWatcherInput>({
    type: 'refinance_watcher',
    actionType: 'refi_opportunity',
    requiresApproval: true,
    idempotencyKey: (i) => `refi:${i.userId}:${i.evaluatedOn ?? new Date().toISOString().slice(0, 10)}`,
    run: async (input, ctx) => {
      const evaluatedOn = input.evaluatedOn ?? new Date().toISOString().slice(0, 10);
      const threshold = input.thresholdDollars ?? DEFAULT_SAVINGS_THRESHOLD_DOLLARS;
      await ctx.log('evaluate:start', true, { userId: input.userId, evaluatedOn, threshold });

      const loans = await getUserLoans(input.userId);
      if (loans.length === 0) {
        await ctx.log('evaluate:no-loans', true, { userId: input.userId });
        const empty: RefinanceWatcherData = {
          evaluatedOn,
          thresholdDollars: threshold,
          loansEvaluated: 0,
          opportunities: [],
          autonomousAction: false,
        };
        return { roi: null, data: empty as unknown as Record<string, unknown> };
      }

      const neededTypes = [...new Set(loans.map((l) => l.loan_type))];
      const snapshots = await getLatestSnapshots(neededTypes);
      await ctx.log('snapshots:loaded', true, {
        types: neededTypes,
        found: [...snapshots.keys()],
      });

      const opportunities: RefinanceOpportunity[] = [];
      for (const loan of loans) {
        const snap = snapshots.get(loan.loan_type);
        if (!snap) {
          // No published rate for this loan type yet — cannot evaluate honestly.
          await ctx.log('loan:no-snapshot', true, { loanId: loan.id, loanType: loan.loan_type });
          continue;
        }
        const { clears, savings } = clearsThreshold(
          {
            balance: balanceOf(loan),
            currentApr: loan.apr,
            remainingMonths: remainingMonthsOf(loan),
          },
          { offeredApr: snap.apr_avg },
          threshold,
        );
        await ctx.log('loan:evaluated', true, {
          loanId: loan.id,
          loanType: loan.loan_type,
          currentApr: loan.apr,
          offeredApr: snap.apr_avg,
          lifetimeSavings: savings.lifetimeSavings,
          clears,
        });
        if (clears) {
          opportunities.push({
            loanId: loan.id,
            loanType: loan.loan_type,
            servicer: loan.servicer,
            balance: balanceOf(loan),
            currentApr: loan.apr,
            offeredApr: snap.apr_avg,
            rateSource: snap.source,
            rateCapturedOn: snap.captured_on,
            savings,
          });
        }
      }

      const data: RefinanceWatcherData = {
        evaluatedOn,
        thresholdDollars: threshold,
        loansEvaluated: loans.length,
        opportunities,
        autonomousAction: false,
      };

      // ROI surfaced to the user = total lifetime savings across all clearing
      // loans. null when nothing clears, so the dashboard shows "no opportunity"
      // rather than "$0 saved".
      const roi =
        opportunities.length > 0
          ? Number(opportunities.reduce((s, o) => s + o.savings.lifetimeSavings, 0).toFixed(2))
          : null;

      await ctx.log('evaluate:done', true, {
        opportunities: opportunities.length,
        roi,
      });
      return { roi, data: data as unknown as Record<string, unknown> };
    },
  });
