// BankDisputePort — the single typed seam between the Charge Dispute agent and
// the real-world bank dispute channels (per-bank API or web flow).
//
// HONESTY CONTRACT (orchestrator constraint): the agent NEVER fakes a filing.
// All outbound contact with a bank goes through this interface. In production
// the `envBankDisputePort` implementation reads per-bank credentials from env
// (PRD §13) and calls the bank's dispute API / drives the web flow. The real
// network/web step is intentionally left as a TODO(integrate-bank-<x>) stub —
// it throws `BankNotConfiguredError` until wired, so we can never silently
// pretend a live dispute was filed. Unit tests run against `mockBankDisputePort`.

/** Banks we map per PRD §13. `key` is what we persist into disputes.bank. */
export type BankKey = 'chase' | 'boa' | 'wells' | 'citi' | 'amex' | 'capital_one';

export const SUPPORTED_BANKS: readonly BankKey[] = [
  'chase',
  'boa',
  'wells',
  'citi',
  'amex',
  'capital_one',
] as const;

/** Env var holding the dispute-API credential for each bank (PRD §13). */
export const BANK_ENV_KEY: Record<BankKey, string> = {
  chase: 'CHASE_DISPUTE_API_KEY',
  boa: 'BOA_DISPUTE_API_KEY',
  wells: 'WELLS_DISPUTE_API_KEY',
  citi: 'CITI_DISPUTE_API_KEY',
  amex: 'AMEX_DISPUTE_API_KEY',
  capital_one: 'CAPITAL_ONE_DISPUTE_API_KEY',
};

export interface BankDisputeRequest {
  bank: BankKey;
  /** Masked-friendly identifier — we pass the internal txn id, not the PAN. */
  transactionId: string;
  amount: number;
  /** Dispute reason category, mirrors disputes.reason. */
  reason: string;
  /** Human-readable summary the bank rep / API needs. */
  description: string;
  /** Supporting context (screenshots, prior-charge ids, etc.). */
  evidence: Record<string, unknown>;
}

export interface BankDisputeResult {
  ok: boolean;
  /** Bank-side case identifier on success. Persisted to disputes.bank_case_id. */
  bankCaseId?: string;
  /** Present when ok === false — drives escalation + human review. */
  reason?: string;
}

/** The seam. One method: file a dispute and report the bank's case id. */
export interface BankDisputePort {
  fileDispute(req: BankDisputeRequest): Promise<BankDisputeResult>;
}

/** Thrown by the real impl when a bank's credential env key is absent. */
export class BankNotConfiguredError extends Error {
  constructor(public readonly bank: BankKey) {
    super(`bank dispute channel not configured for "${bank}" (set ${BANK_ENV_KEY[bank]})`);
    this.name = 'BankNotConfiguredError';
  }
}

export function isSupportedBank(bank: string | null | undefined): bank is BankKey {
  return !!bank && (SUPPORTED_BANKS as readonly string[]).includes(bank);
}

/**
 * Production port. Reads the per-bank credential from env (PRD §13) and would
 * call the bank's dispute API / drive the web flow. The actual outbound call is
 * a TODO stub: if the env key is missing we surface a typed failure; if present
 * we still throw `TODO(integrate-bank-<x>)` rather than fabricate a case id.
 *
 * This keeps the package "live-ready, mock-tested": the wiring point is real
 * and env-driven, but no code path ever returns a fake success.
 */
export function envBankDisputePort(): BankDisputePort {
  return {
    async fileDispute(req: BankDisputeRequest): Promise<BankDisputeResult> {
      const envKey = BANK_ENV_KEY[req.bank];
      const credential = process.env[envKey];
      if (!credential) {
        // No credential → cannot file. Honest failure, not a fake success.
        return {
          ok: false,
          reason: `missing credential ${envKey} for bank ${req.bank}`,
        };
      }
      // Credential present but the real channel is not implemented yet. We must
      // NOT return ok:true here — that would be pretending a filing happened.
      // TODO(integrate-bank-api): call the per-bank dispute API / drive the web
      // flow using `credential`, then return the real bankCaseId.
      throw new BankNotConfiguredError(req.bank);
    },
  };
}
