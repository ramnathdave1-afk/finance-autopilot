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
  | 'insurance_shopper'
  | 'tax_prep'
  | 'investment_rebalancer'
  | 'net_worth_strategy'
  | 'human_backup';

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

// ===== Phase 2 / Tier-2 agent rows =====
export type DisputeStatus =
  | 'detected'
  | 'awaiting_user'
  | 'filing'
  | 'filed'
  | 'resolved_won'
  | 'resolved_lost'
  | 'cancelled';

export type BillNegotiationStatus =
  | 'pending'
  | 'preparing_call'
  | 'calling'
  | 'negotiating'
  | 'succeeded'
  | 'failed'
  | 'no_savings';

export type LoanType = 'mortgage' | 'student' | 'auto' | 'personal' | 'heloc';
export type InsuranceKind = 'auto' | 'renters' | 'home' | 'life' | 'health';

export interface BillRow {
  id: string;
  user_id: string;
  provider_name: string;
  account_number_masked: string | null;
  current_amount: number;
  billing_period: string | null;
  source: string;
  ocr_raw: Record<string, unknown> | null;
  uploaded_at: string;
  last_negotiated_at: string | null;
  created_at: string;
}

export interface BillNegotiationRow {
  id: string;
  user_id: string;
  bill_id: string;
  agent_action_id: string | null;
  status: BillNegotiationStatus;
  target_amount: number | null;
  achieved_amount: number | null;
  monthly_savings: number | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  call_duration_seconds: number | null;
  /** Twilio Call SID — set so a retried run resumes the same call. */
  call_sid: string | null;
  voice_recording_url: string | null;
  transcript_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface DisputeRow {
  id: string;
  user_id: string;
  transaction_id: string;
  agent_action_id: string | null;
  status: DisputeStatus;
  reason: string;
  detection_score: number | null;
  amount: number;
  recovered_amount: number | null;
  bank: string | null;
  bank_case_id: string | null;
  filed_at: string | null;
  resolved_at: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface CardRewardRule {
  category: string;
  multiplier: number;
  cap_annual?: number;
}

export interface CardRow {
  id: string;
  name: string;
  issuer: string;
  network: string;
  annual_fee: number;
  signup_bonus: Record<string, unknown> | null;
  rewards: CardRewardRule[];
  benefits: string[];
  application_url: string | null;
  active: boolean;
  created_at: string;
}

export interface UserCardRow {
  id: string;
  user_id: string;
  card_id: string | null;
  display_name: string | null;
  last4: string | null;
  estimated_monthly_value: number | null;
  status: string;
  added_at: string;
}

export interface UnclaimedFindRow {
  id: string;
  user_id: string;
  source: string;
  state: string | null;
  holder: string | null;
  amount_estimate: string | null;
  property_id: string | null;
  details: Record<string, unknown> | null;
  claim_url: string | null;
  status: string;
  detected_at: string;
}

export interface LoanRow {
  id: string;
  user_id: string;
  loan_type: LoanType;
  servicer: string | null;
  principal: number;
  current_balance: number | null;
  apr: number;
  term_months: number;
  remaining_months: number | null;
  origination_date: string | null;
  account_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface RateSnapshotRow {
  id: string;
  loan_type: LoanType;
  source: string;
  apr_low: number;
  apr_avg: number;
  apr_high: number;
  captured_on: string;
  created_at: string;
}

export interface InsurancePolicyRow {
  id: string;
  user_id: string;
  kind: InsuranceKind;
  carrier: string;
  policy_number_masked: string | null;
  monthly_premium: number;
  annual_premium: number | null;
  renewal_date: string | null;
  coverage: Record<string, unknown>;
  created_at: string;
}

export interface InsuranceQuoteRow {
  id: string;
  user_id: string;
  policy_id: string;
  carrier: string;
  monthly_premium: number;
  annual_premium: number | null;
  coverage_match: Record<string, unknown> | null;
  quote_url: string | null;
  expires_at: string | null;
  captured_at: string;
}

export interface NetWorthSnapshotRow {
  id: string;
  user_id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Record<string, number>;
  created_at: string;
}

export interface InvestmentHoldingRow {
  id: string;
  user_id: string;
  account_id: string;
  security_id: string | null;
  ticker: string | null;
  name: string | null;
  type: string | null;
  quantity: number;
  cost_basis: number | null;
  current_price: number | null;
  current_value: number | null;
  iso_currency_code: string;
  as_of: string;
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
      bills: TableShape<BillRow>;
      bill_negotiations: TableShape<BillNegotiationRow>;
      disputes: TableShape<DisputeRow>;
      cards: TableShape<CardRow>;
      user_cards: TableShape<UserCardRow>;
      unclaimed_finds: TableShape<UnclaimedFindRow>;
      loans: TableShape<LoanRow>;
      rate_snapshots: TableShape<RateSnapshotRow>;
      insurance_policies: TableShape<InsurancePolicyRow>;
      insurance_quotes: TableShape<InsuranceQuoteRow>;
      investment_holdings: TableShape<InvestmentHoldingRow>;
      net_worth_snapshots: TableShape<NetWorthSnapshotRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      pricing_tier: PricingTier;
      subscription_status: SubscriptionStatus;
      consent_mode: ConsentMode;
      data_provider: DataProvider;
      agent_type: AgentType;
      action_status: ActionStatus;
      dispute_status: DisputeStatus;
      bill_negotiation_status: BillNegotiationStatus;
      loan_type: LoanType;
      insurance_kind: InsuranceKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationship[];
};
