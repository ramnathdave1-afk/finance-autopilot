// Generated database types — exported for ALL terminals.
// Kept in lockstep with packages/db/migrations/*.sql.
// If you add a migration, update this file in the same PR.

export type PricingTier = 'free' | 'autopilot' | 'pro' | 'premium';
export type SubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';
export type ConsentMode = 'approve_each' | 'auto_small' | 'full_auto';
export type DataProvider = 'plaid' | 'mx' | 'finicity';

export type AgentType =
  | 'subscription_killer'
  | 'auto_saver'
  | 'round_up_investor'
  | 'spending_coach'
  | 'goal_funder'
  | 'daily_brief'
  | 'bill_negotiation'
  | 'charge_dispute'
  | 'credit_card_optimizer'
  | 'missing_money'
  | 'refinance_watcher'
  | 'insurance_shopper';

export type ActionStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'escalated';

export interface UserRow {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  pricing_tier: PricingTier;
  founder_pricing_locked: boolean;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  display_name: string | null;
  phone: string | null;
  voice_briefing_enabled: boolean;
  briefing_time_local: string;
  pause_all_agents: boolean;
}

export interface ConnectedAccountRow {
  id: string;
  user_id: string;
  provider: DataProvider;
  provider_item_id: string | null;
  provider_account_id: string | null;
  institution_id: string | null;
  institution_name: string;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  iso_currency_code: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
}

export interface ProviderItemRow {
  id: string;
  user_id: string;
  provider: DataProvider;
  provider_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  vault_secret_id: string | null;
  cursor: string | null;
  status: string;
  error_code: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  provider: DataProvider;
  provider_transaction_id: string;
  amount: number;
  iso_currency_code: string;
  merchant: string | null;
  raw_description: string | null;
  category: string | null;
  ai_category: string | null;
  ai_category_confidence: number | null;
  ai_categorized_at: string | null;
  date: string;
  pending: boolean;
  is_subscription: boolean;
  subscription_id: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  frequency: string;
  first_seen_at: string | null;
  last_charged_at: string | null;
  last_used_at: string | null;
  status: string;
  cancellation_method: string | null;
  cancellation_url: string | null;
  cancellation_phone: string | null;
  created_at: string;
}

export interface GoalRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
  monthly_funding: number;
  status: string;
  created_at: string;
}

export interface RuleRow {
  id: string;
  user_id: string;
  name: string;
  trigger: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  enabled: boolean;
  created_at: string;
}

export interface AgentRow {
  id: string;
  user_id: string;
  agent_type: AgentType;
  consent_mode: ConsentMode;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

export interface AgentActionRow {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: AgentType;
  action_type: string;
  target: string | null;
  status: ActionStatus;
  idempotency_key: string | null;
  requested_at: string;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  roi_amount: number | null;
  audit_log: AgentAuditStep[];
  voice_recording_url: string | null;
  error_message: string | null;
  retry_count: number;
}

export interface AgentAuditStep {
  ts: string;
  step: string;
  ok: boolean;
  detail?: Record<string, unknown>;
}

export interface WaitlistSignupRow {
  id: string;
  email: string;
  source: string | null;
  referrer: string | null;
  founder_locked: boolean;
  created_at: string;
}

// Minimal Database<T> shape compatible with @supabase/supabase-js generics.
export interface Database {
  public: {
    Tables: {
      users: TableShape<UserRow>;
      connected_accounts: TableShape<ConnectedAccountRow>;
      provider_items: TableShape<ProviderItemRow>;
      transactions: TableShape<TransactionRow>;
      subscriptions: TableShape<SubscriptionRow>;
      goals: TableShape<GoalRow>;
      rules: TableShape<RuleRow>;
      agents: TableShape<AgentRow>;
      agent_actions: TableShape<AgentActionRow>;
      waitlist_signups: TableShape<WaitlistSignupRow>;
    };
    Enums: {
      pricing_tier: PricingTier;
      subscription_status: SubscriptionStatus;
      consent_mode: ConsentMode;
      data_provider: DataProvider;
      agent_type: AgentType;
      action_status: ActionStatus;
    };
  };
}

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row> & { user_id?: string };
  Update: Partial<Row>;
};
