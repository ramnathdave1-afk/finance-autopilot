// PRD §8.3 Agent 10 — Missing Money.
//
// Cross-references the user's identity (name + aliases, prior addresses, prior
// employers) against public unclaimed-property sources (NAUPA / missingmoney.com
// / state DBs / old-401(k) databases) and records any matches in unclaimed_finds.
//
// DETECTION ONLY. This agent never files a claim and never moves money — it
// surfaces finds. Filing is a separate, explicitly user-initiated action
// (actionType 'file_claim') dispatched from the Missing Money web page. Hence
// requiresApproval:false here — writing a find is informational, like the
// Daily Brief / Spending Coach agents.
//
// HONESTY: every external lookup goes through UnclaimedPropertyPort. The live
// port reads aggregator credentials from env and throws if absent; tests use a
// mock and never touch the network. We do not fabricate "found" results.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import {
  getUnclaimedPropertyPort,
  type SearchSubject,
} from './unclaimed-property-port';
import {
  getExistingFinds,
  hitToRow,
  insertFinds,
  dedupeKey,
} from './finds-store';

export interface MissingMoneyInput {
  /** Identity to fan out across the unclaimed-property indexes. */
  subject: SearchSubject;
}

export interface MissingMoneyFind {
  id: string;
  source: string;
  state: string | null;
  holder: string | null;
  amountEstimate: string | null;
  claimUrl: string | null;
}

export interface MissingMoneyData {
  /** Hits returned by the sources this run. */
  hitCount: number;
  /** Hits that were already on file (deduped, not re-inserted). */
  duplicateCount: number;
  /** Newly recorded finds. */
  newFinds: MissingMoneyFind[];
}

export const missingMoneyAgent: AgentDefinition<MissingMoneyInput> = defineAgent<MissingMoneyInput>({
  type: 'missing_money',
  actionType: 'detect_finds',
  requiresApproval: false,
  // One detection pass per user identity per run. The subject's name anchors
  // the key; the audit log + DB dedupe handle re-runs.
  idempotencyKey: (i) => `missing-money:${i.subject.fullName.trim().toLowerCase()}`,
  run: async (input, ctx) => {
    await ctx.log('search:start', true, {
      name: input.subject.fullName,
      aliasCount: input.subject.aliases?.length ?? 0,
      addressCount: input.subject.addresses?.length ?? 0,
      employerCount: input.subject.employers?.length ?? 0,
      states: input.subject.states ?? [],
    });

    const port = await getUnclaimedPropertyPort();
    const hits = await port.search(input.subject);
    await ctx.log('search:done', true, { hitCount: hits.length });

    // Dedupe against everything already recorded for this user, AND within
    // this batch (a source can return the same id-less hit twice).
    const existing = await getExistingFinds(ctx.userId);
    const seen = new Set<string>(
      existing.map((e) =>
        dedupeKey({
          source: e.source,
          propertyId: e.property_id,
          holder: e.holder,
          amountEstimate: e.amount_estimate,
        }),
      ),
    );

    const toInsert: ReturnType<typeof hitToRow>[] = [];
    let duplicateCount = 0;
    for (const hit of hits) {
      const key = dedupeKey({
        source: hit.source,
        propertyId: hit.propertyId,
        holder: hit.holder,
        amountEstimate: hit.amountEstimate,
      });
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      toInsert.push(hitToRow(ctx.userId, hit));
    }

    await ctx.log('dedupe:done', true, {
      newCount: toInsert.length,
      duplicateCount,
    });

    const { inserted } = await insertFinds(toInsert);
    await ctx.log('finds:recorded', true, { recorded: inserted.length });

    const newFinds: MissingMoneyFind[] = inserted.map((r) => ({
      id: r.id,
      source: r.source,
      state: r.state,
      holder: r.holder,
      amountEstimate: r.amount_estimate,
      claimUrl: r.claim_url,
    }));

    const data: MissingMoneyData = {
      hitCount: hits.length,
      duplicateCount,
      newFinds,
    };

    // ROI is null: amounts are text bands ("Under $50") that can't be summed
    // into a reliable dollar figure, and nothing has actually been recovered
    // yet — recovery happens when the user files a claim (separate action).
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});
