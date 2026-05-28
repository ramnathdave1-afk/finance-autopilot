export {
  humanBackupAgent,
  type HumanBackupInput,
  type HumanBackupData,
  type QueuedItem,
} from './agent';
export {
  SLA_HOURS,
  AWAITING_HUMAN_STATUS,
  slaDeadline,
  isSlaBreached,
  minutesUntilBreach,
  queueKey,
  routeReason,
  selectToEnqueue,
  isOpen,
  type RoutableAction,
  type QueuedAction,
  type RouteReason,
} from './sla';
export {
  getRoutableFailures,
  getQueueEntries,
  getOpenQueueRows,
  ensureHumanBackupAgent,
  enqueueForHuman,
  markBreached,
  type EnqueueInput,
  type OpenQueueRow,
} from './queue-store';

import { runAgent } from '@fa/inngest';
import { humanBackupAgent, type HumanBackupInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runHumanBackup(opts: {
  userId: string;
  agentId: string;
  input: HumanBackupInput;
}) {
  return runAgent(humanBackupAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
