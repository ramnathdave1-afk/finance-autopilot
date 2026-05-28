import { describe, it, expect, afterEach } from 'vitest';
import {
  envBankDisputePort,
  BANK_ENV_KEY,
  SUPPORTED_BANKS,
  isSupportedBank,
  BankNotConfiguredError,
} from '../src/bank-port';
import { mockBankDisputePort } from '../src/bank-port.mock';

const req = (bank: SupportedBank) => ({
  bank,
  transactionId: 'txn-12345678',
  amount: 42,
  reason: 'duplicate',
  description: 'd',
  evidence: {},
});
type SupportedBank = (typeof SUPPORTED_BANKS)[number];

describe('bank-port — honesty contract', () => {
  afterEach(() => {
    for (const key of Object.values(BANK_ENV_KEY)) delete process.env[key];
  });

  it('covers exactly the PRD §13 banks', () => {
    expect([...SUPPORTED_BANKS].sort()).toEqual(
      ['amex', 'boa', 'capital_one', 'chase', 'citi', 'wells'].sort(),
    );
  });

  it('isSupportedBank guards unknown banks', () => {
    expect(isSupportedBank('chase')).toBe(true);
    expect(isSupportedBank('monzo')).toBe(false);
    expect(isSupportedBank(null)).toBe(false);
  });

  it('env port returns honest failure when the credential is missing', async () => {
    const port = envBankDisputePort();
    const res = await port.fileDispute(req('chase'));
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/missing credential CHASE_DISPUTE_API_KEY/);
  });

  it('env port NEVER fakes success even when the credential is present — it throws BankNotConfiguredError', async () => {
    process.env[BANK_ENV_KEY.chase] = 'live-key';
    const port = envBankDisputePort();
    await expect(port.fileDispute(req('chase'))).rejects.toBeInstanceOf(BankNotConfiguredError);
  });

  it('mock port records requests and returns a synthetic case id', async () => {
    const port = mockBankDisputePort();
    const res = await port.fileDispute(req('amex'));
    expect(res.ok).toBe(true);
    expect(res.bankCaseId).toMatch(/^MOCK-amex-/);
    expect(port.requests.length).toBe(1);
  });

  it('mock port can simulate failure', async () => {
    const port = mockBankDisputePort({ failAll: true, reason: 'declined' });
    const res = await port.fileDispute(req('wells'));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('declined');
  });
});
