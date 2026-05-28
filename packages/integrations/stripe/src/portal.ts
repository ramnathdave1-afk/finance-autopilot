// createPortalSession — Stripe Customer Portal for self-serve subscription
// management (PRD §13). One-click cancel still happens through our app
// (see cancel.ts) so we keep the anti-Cleo positioning.

import { getAdapter } from './adapter';
import { getDbPort } from './db-port';

export interface CreatePortalSessionInput {
  userId: string;
  returnUrl: string;
}

export interface CreatePortalSessionResult {
  sessionId: string;
  url: string;
}

export async function createPortalSession(
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionResult> {
  const db = getDbPort();
  const user = await db.getUserById(input.userId);
  if (!user) throw new Error(`user not found: ${input.userId}`);
  if (!user.stripe_customer_id) {
    throw new Error(`user has no stripe_customer_id: ${input.userId}`);
  }
  const session = await getAdapter().createPortalSession(
    user.stripe_customer_id,
    input.returnUrl,
  );
  return { sessionId: session.id, url: session.url };
}
