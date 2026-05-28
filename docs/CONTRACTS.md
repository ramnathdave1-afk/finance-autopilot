# Cross-Terminal Contracts — Phase 1

Companion to root README. The README assigns ownership; this file freezes the contracts the 5 terminals share.

## Package namespace

All workspace packages publish under `@fa/`:

- `@fa/web` → `apps/web`
- `@fa/mobile` → `apps/mobile`
- `@fa/ui` → `packages/ui`
- `@fa/db` → `packages/db`
- `@fa/types` → `packages/types` *(coordinator-owned, frozen v1 — propose changes in chat)*
- `@fa/plaid` → `packages/integrations/plaid`
- `@fa/claude` → `packages/integrations/claude`
- `@fa/stripe` → `packages/integrations/stripe`
- `@fa/twilio` → `packages/integrations/twilio`
- `@fa/browserbase` → `packages/integrations/browserbase`
- `@fa/agent-*` → each agent package (e.g. `@fa/agent-daily-brief`)

## Frozen v1 types — `@fa/types`

```ts
export type PricingTier = 'free' | 'autopilot' | 'pro' | 'premium';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'incomplete';
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment';
export type AccountStatus = 'active' | 'disconnected' | 'error';
export type ConsentMode = 'approve_each' | 'auto_small' | 'full_auto';
export type AgentType =
  | 'subscription_killer' | 'auto_saver' | 'round_up'
  | 'spending_coach' | 'goal_funder' | 'daily_brief';
export type AgentActionStatus = 'pending' | 'approved' | 'running' | 'succeeded' | 'failed';

export interface User { id: string; email: string; created_at: string;
  pricing_tier: PricingTier; founder_pricing_locked: boolean;
  subscription_status: SubscriptionStatus | null; stripe_customer_id: string | null; }

export interface ConnectedAccount { id: string; user_id: string; plaid_item_id: string;
  institution_name: string; account_type: AccountType; status: AccountStatus;
  last_synced_at: string | null; }

export interface Transaction { id: string; user_id: string; account_id: string;
  amount: number; merchant: string; category: string; ai_category: string | null;
  is_subscription: boolean; subscription_id: string | null; date: string; }

export interface Subscription { id: string; user_id: string; merchant: string;
  amount: number; frequency: 'monthly' | 'annual' | 'weekly';
  last_used_at: string | null; status: 'active' | 'cancelled';
  cancellation_method: 'web' | 'voice' | 'manual' | null; }

export interface AgentRecord { id: string; user_id: string; agent_type: AgentType;
  consent_mode: ConsentMode; enabled: boolean; created_at: string; }

export interface AgentAction { id: string; user_id: string; agent_id: string;
  agent_type: AgentType; action_type: string; target: string | null;
  status: AgentActionStatus; requested_at: string; completed_at: string | null;
  roi_amount: number | null; refund_eligible: boolean;
  audit_log: unknown[]; voice_recording_url: string | null; }

export interface Goal { id: string; user_id: string; name: string;
  target_amount: number; target_date: string; current_amount: number;
  monthly_funding: number; }
```

## Worktree map (git)

| Terminal | Branch | Worktree path |
|---|---|---|
| T1 | `t1-foundation` | `../fa-t1` |
| T2 | `t2-data` | `../fa-t2` |
| T3 | `t3-info-agents` | `../fa-t3` |
| T4 | `t4-sub-killer` | `../fa-t4` |
| T5 | `t5-money` | `../fa-t5` |

## Done bar (every terminal, every phase)

1. Files only under your owned dirs (see root README).
2. `pnpm test`, `pnpm typecheck`, `pnpm lint` green inside your worktree.
3. Smoke pass: web → `pnpm dev` shows the deliverable; agents → integration test with mocked external services.
4. Subtree README documents: what's built, how to run, what's stubbed.
5. Commit on your branch, report DONE in chat with commit SHA + deliverable checklist + any `TODO(integrate-tN)` left behind.
6. **Coordinator merges to `main`.** Phase 1 is not done until all 5 are merged and a 5-way smoke test passes.

## Stub policy

Depending on a not-yet-built package? Stub with typed mocks:

```ts
// packages/agents/auto-saver/src/db.ts
// TODO(integrate-t2): swap for real @fa/db client
import type { Transaction } from '@fa/types';
export const db = {
  transactions: { listSince: async (_u: string, _s: Date): Promise<Transaction[]> => [] },
};
```

When the real package lands, coordinator swaps + runs integration tests.
