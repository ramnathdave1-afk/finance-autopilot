// Thin wrapper over @fa/db's createServiceClient for the subscription row
// lookup + status flip. Isolated so tests can mock just this surface.

import { createServiceClient } from '@fa/db';
import type { Subscription } from '@fa/types';

export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (error) throw new Error(`getSubscription failed: ${error.message}`);
  return (data ?? null) as Subscription | null;
}

export async function markSubscriptionCancelled(
  subscriptionId: string,
  method: 'web' | 'voice',
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancellation_method: method })
    .eq('id', subscriptionId);
  if (error) throw new Error(`markSubscriptionCancelled failed: ${error.message}`);
}
