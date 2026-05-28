// Settable BankDisputePort singleton, mirroring @fa/browserbase's
// setBrowserAdapterFactory/reset pattern. Production uses envBankDisputePort;
// tests inject a mock via setBankDisputePort and clear it in afterEach.

import { envBankDisputePort, type BankDisputePort } from './bank-port';

let override: BankDisputePort | null = null;

export function setBankDisputePort(port: BankDisputePort): void {
  override = port;
}

export function resetBankDisputePort(): void {
  override = null;
}

export function getBankDisputePort(): BankDisputePort {
  return override ?? envBankDisputePort();
}
