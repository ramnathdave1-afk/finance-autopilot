// PostHog product analytics (PRD §19) — server-side capture only at this
// stage. The browser-side autocapture + identify(user.id) hook should be
// added in apps/web/src/components/posthog-provider.tsx as a follow-up
// once posthog-js is added to package.json.
//
// Why a thin in-house wrapper: we keep the dependency graph small and pin
// to the locked event taxonomy at
// /Users/daveramnath/pilot-orchestrator/analytics/posthog-taxonomy.md
// — every event name + property shape lives there. Don't drift.
//
// Env-gated: when NEXT_PUBLIC_POSTHOG_KEY is unset (dev/test) every call is
// a no-op. Production reads the key + host from env.

export type AnalyticsEvent =
  // Acquisition
  | "landing_viewed"
  | "waitlist_submitted"
  | "waitlist_confirmation_clicked"
  // Onboarding (PRD §9 Story 1)
  | "signup_started"
  | "signup_completed"
  | "goals_intent_selected"
  | "plaid_link_opened"
  | "plaid_link_completed"
  | "plaid_link_failed"
  | "goals_wizard_completed"
  | "tier_comparison_viewed"
  | "tier_selected"
  | "first_agent_demo_started"
  | "first_agent_action_completed"
  | "onboarding_completed"
  // Activation (PRD §24)
  | "activated"
  // Conversion
  | "paywall_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_abandoned"
  | "tier_upgraded"
  | "tier_downgraded"
  | "subscription_cancelled"
  // Agents (heart of the product)
  | "agent_action_proposed"
  | "agent_action_approved"
  | "agent_action_started"
  | "agent_action_succeeded"
  | "agent_action_failed"
  | "agent_action_rolled_back"
  | "agent_consent_mode_changed"
  | "pause_all_toggled"
  // Feed
  | "feed_card_viewed"
  | "feed_card_tapped"
  | "feed_card_swiped"
  // Trust & control
  | "audit_log_viewed"
  | "refund_eligible_action"
  | "refund_issued"
  // Notifications
  | "notification_sent"
  | "notification_opened";

type EventProps = Record<string, string | number | boolean | null | undefined>;

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Server-side event capture. Fire-and-forget; never throws into a request.
 * Distinct ID is the authenticated user id (or an anonymous id for landing).
 */
export async function track(
  distinctId: string,
  event: AnalyticsEvent,
  props?: EventProps,
): Promise<void> {
  if (!KEY) return; // dev/test no-op

  try {
    await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: distinctId,
        properties: { ...props, $lib: "fa-web-server" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // PostHog must never break a request. Errors are intentionally swallowed.
  }
}

/**
 * Bind a server-known user id to their PostHog distinct_id. Call this once
 * per session right after sign-in. PRD §19 — gives funnel attribution.
 */
export async function identify(
  distinctId: string,
  properties?: EventProps,
): Promise<void> {
  if (!KEY) return;
  try {
    await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event: "$identify",
        distinct_id: distinctId,
        properties: { $set: properties ?? {}, $lib: "fa-web-server" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // intentional
  }
}
