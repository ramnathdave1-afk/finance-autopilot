// Candidate surfacing for the Charge Dispute agent. We reuse @fa/plaid's
// EXISTING detectors (detectAnomalies + detectChargesAfterCancellation) — this
// agent does NOT re-implement anomaly logic, it consumes those flags, maps each
// flag's reason onto a dispute reason, and returns a de-duplicated candidate
// list the user confirms before anything is filed.

import {
  detectAnomalies,
  detectChargesAfterCancellation,
  type AnomalyFlag,
  type AnomalyReason,
} from '@fa/plaid';

/** disputes.reason vocabulary (free text in DB, fixed set here). */
export type DisputeReason =
  | 'duplicate'
  | 'unauthorized'
  | 'incorrect_amount'
  | 'subscription_cancelled'
  | 'service_not_rendered';

export interface DisputeCandidate {
  transactionId: string;
  reason: DisputeReason;
  /** Detection confidence carried through to disputes.detection_score. */
  score: number;
  detail: string;
}

const REASON_MAP: Record<AnomalyReason, DisputeReason> = {
  duplicate: 'duplicate',
  unusual_amount: 'incorrect_amount',
  subscription_after_cancel: 'subscription_cancelled',
};

function toCandidate(flag: AnomalyFlag): DisputeCandidate {
  return {
    transactionId: flag.transactionId,
    reason: REASON_MAP[flag.reason],
    score: flag.score,
    detail: flag.detail,
  };
}

/**
 * Surface all dispute candidates for a user by combining both existing plaid
 * detectors. De-dupes by transactionId, keeping the highest-scoring flag.
 */
export async function surfaceCandidates(
  userId: string,
  lookbackDays = 30,
): Promise<DisputeCandidate[]> {
  const [anomalies, afterCancel] = await Promise.all([
    detectAnomalies(userId, lookbackDays),
    detectChargesAfterCancellation(userId),
  ]);

  const byTxn = new Map<string, DisputeCandidate>();
  for (const flag of [...anomalies, ...afterCancel]) {
    const cand = toCandidate(flag);
    const prior = byTxn.get(cand.transactionId);
    if (!prior || cand.score > prior.score) {
      byTxn.set(cand.transactionId, cand);
    }
  }
  return [...byTxn.values()].sort((a, b) => b.score - a.score);
}
