// Mock BankDisputePort for unit tests. The real `envBankDisputePort` is the
// production seam; this one lets tests exercise the agent's happy path,
// duplicate path, and bank-failure escalation WITHOUT hitting any bank.
//
// Tests inject this via `setBankDisputePort(...)`. It records every request so
// assertions can confirm what would have been filed.

import type { BankDisputePort, BankDisputeRequest, BankDisputeResult } from './bank-port';

export interface MockBankDisputeOptions {
  /** Force every filing to fail (escalation path). */
  failAll?: boolean;
  /** Per-bank failure reason override. */
  reason?: string;
  /** Customize the generated bank case id. */
  caseIdPrefix?: string;
}

export interface MockBankDisputePort extends BankDisputePort {
  readonly requests: BankDisputeRequest[];
}

export function mockBankDisputePort(opts: MockBankDisputeOptions = {}): MockBankDisputePort {
  const requests: BankDisputeRequest[] = [];
  // Models the bank's idempotency store: a successful filing is remembered by
  // idempotencyKey, so a retried fileDispute with the same key returns the
  // ORIGINAL case id and does NOT open a second chargeback. `requests` only
  // records genuinely new filings, so tests can assert exactly one chargeback
  // was filed even across agent retries.
  const filedByKey = new Map<string, string>();
  return {
    requests,
    async fileDispute(req: BankDisputeRequest): Promise<BankDisputeResult> {
      if (opts.failAll) {
        // Failures don't establish a case — record the attempt so escalation
        // tests can still count retries.
        requests.push(req);
        return { ok: false, reason: opts.reason ?? 'mock bank rejected dispute' };
      }
      const existing = filedByKey.get(req.idempotencyKey);
      if (existing) {
        // Idempotent replay: same key → same case, no new chargeback.
        return { ok: true, bankCaseId: existing };
      }
      requests.push(req);
      const bankCaseId = `${opts.caseIdPrefix ?? 'MOCK'}-${req.bank}-${req.transactionId.slice(0, 8)}`;
      filedByKey.set(req.idempotencyKey, bankCaseId);
      return { ok: true, bankCaseId };
    },
  };
}
