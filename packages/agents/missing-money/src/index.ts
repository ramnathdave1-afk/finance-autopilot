export {
  missingMoneyAgent,
  type MissingMoneyInput,
  type MissingMoneyData,
  type MissingMoneyFind,
} from './agent';
export {
  type UnclaimedPropertyPort,
  type UnclaimedPropertyPortFactory,
  type SearchSubject,
  type UnclaimedHit,
  type HttpPortConfig,
  createHttpPort,
  createHttpPortFromEnv,
  createMockPort,
  getUnclaimedPropertyPort,
  setUnclaimedPropertyPortFactory,
  resetUnclaimedPropertyPortFactory,
} from './unclaimed-property-port';
export {
  getExistingFinds,
  insertFinds,
  hitToRow,
  dedupeKey,
  type InsertResult,
} from './finds-store';

import { runAgent } from '@fa/inngest';
import { missingMoneyAgent, type MissingMoneyInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runMissingMoney(opts: {
  userId: string;
  agentId: string;
  input: MissingMoneyInput;
}) {
  return runAgent(missingMoneyAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
