// Thin wrapper over @fa/db's createServiceClient for the cards catalog +
// user-held cards. Isolated so tests can mock just this surface (mirrors
// subscription-killer's subscription-lookup.ts). The recommendation engine
// (recommend.ts) is pure and never touches the DB directly.
//
// NOTE: this reads ONLY from the cards / user_cards tables that already exist
// (packages/db/migrations/phase2_T2_tier2_tables.sql). It performs NO external
// network calls — there is no live quote/rate API here. Card data comes from
// the seeded catalog (phase3_T2_cards_seed.sql).

import { createServiceClient } from '@fa/db';
import type { CardRow, UserCardRow } from '@fa/db/types';

/** Fetch the active cards catalog (shared rewards database, all users). */
export async function fetchCardCatalog(): Promise<CardRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('active', true);
  if (error) throw new Error(`fetchCardCatalog failed: ${error.message}`);
  return (data ?? []) as CardRow[];
}

/** Fetch the card_ids the user currently holds (active user_cards). */
export async function fetchHeldCardIds(userId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_cards')
    .select('card_id, status')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(`fetchHeldCardIds failed: ${error.message}`);
  return ((data ?? []) as Pick<UserCardRow, 'card_id'>[])
    .map((r) => r.card_id)
    .filter((id): id is string => id != null);
}
