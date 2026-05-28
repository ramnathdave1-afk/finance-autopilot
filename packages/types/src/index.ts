export type PricingTier = 'free' | 'autopilot' | 'pro' | 'premium';
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'incomplete';
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment';
export type AccountStatus = 'active' | 'disconnected' | 'error';
export type ConsentMode = 'approve_each' | 'auto_small' | 'full_auto';
export type AgentType =
  | 'subscription_killer'
  | 'auto_saver'
  | 'round_up'
  | 'spending_coach'
  | 'goal_funder'
  | 'daily_brief';
export type AgentActionStatus =
  | 'pending' | 'approved' | 'running' | 'succeeded' | 'failed';

export interface User {
  id: string;
  email: string;
  created_at: string;
  pricing_tier: PricingTier;
  founder_pricing_locked: boolean;
  subscription_status: SubscriptionStatus | null;
  stripe_customer_id: string | null;
}

export interface ConnectedAccount {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_name: string;
  account_type: AccountType;
  status: AccountStatus;
  last_synced_at: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  merchant: string;
  category: string;
  ai_category: string | null;
  is_subscription: boolean;
  subscription_id: string | null;
  date: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  frequency: 'monthly' | 'annual' | 'weekly';
  last_used_at: string | null;
  status: 'active' | 'cancelled';
  cancellation_method: 'web' | 'voice' | 'manual' | null;
}

export interface AgentRecord {
  id: string;
  user_id: string;
  agent_type: AgentType;
  consent_mode: ConsentMode;
  enabled: boolean;
  created_at: string;
}

export interface AgentAction {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: AgentType;
  action_type: string;
  target: string | null;
  status: AgentActionStatus;
  requested_at: string;
  completed_at: string | null;
  roi_amount: number | null;
  refund_eligible: boolean;
  audit_log: unknown[];
  voice_recording_url: string | null;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string;
  current_amount: number;
  monthly_funding: number;
}
