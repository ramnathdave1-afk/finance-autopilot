export { billNegotiationAgent, type BillNegotiationInput } from './agent';
export { generateScript, type ScriptInput, type NegotiationScript } from './script';
export { analyzeOutcome, type OutcomeInput, type NegotiationOutcome } from './outcome';
export {
  getBill,
  createNegotiation,
  updateNegotiation,
  markBillNegotiated,
  type CreateNegotiationInput,
  type UpdateNegotiationPatch,
} from './negotiation-db';

import { runAgent } from '@fa/inngest';
import { billNegotiationAgent, type BillNegotiationInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runBillNegotiation(opts: {
  userId: string;
  agentId: string;
  input: BillNegotiationInput;
}) {
  return runAgent(billNegotiationAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
