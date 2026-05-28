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
  return {
    requests,
    async fileDispute(req: BankDisputeRequest): Promise<BankDisputeResult> {
      requests.push(req);
      if (opts.failAll) {
        return { ok: false, reason: opts.reason ?? 'mock bank rejected dispute' };
      }
      return {
        ok: true,
        bankCaseId: `${opts.caseIdPrefix ?? 'MOCK'}-${req.bank}-${req.transactionId.slice(0, 8)}`,
      };
    },
  };
}
