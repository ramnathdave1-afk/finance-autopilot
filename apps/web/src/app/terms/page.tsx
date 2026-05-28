// PLACEHOLDER — lawyer-reviewed copy replaces this before public launch (PRD §17, §18).
export default function Terms() {
  return (
    <main className="container py-16 max-w-3xl">
      <h1 className="text-h1 mb-2">Terms of service</h1>
      <p className="text-small text-fg-muted mb-8">Last updated: pending legal review</p>

      <div className="space-y-6 text-body text-fg-muted">
        <section>
          <h2 className="text-h2 text-fg mb-2">What this is</h2>
          <p>An information + action product. We act as your agent for tasks you explicitly authorize (cancel subscriptions, file disputes, place negotiation calls). We are not a bank, money transmitter, or registered investment advisor.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">No financial advice</h2>
          <p>We provide information, automation, and suggestions. We do not provide financial, tax, or investment advice or fiduciary services.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Agent actions are authorized by you</h2>
          <p>Every action requires your authorization per our tiered-consent model. We are not responsible for outcomes outside our control (a vendor refusing a cancellation, a bank denying a dispute, a negotiator rejecting an offer).</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">No guarantees on savings</h2>
          <p>Bill negotiation results vary. We do not guarantee any specific dollar amount of savings.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Refund-on-failure</h2>
          <p>If an agent action fails due to our system, we refund the month and (where possible) reverse the action automatically.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Cancellation</h2>
          <p>One click. No retention flow. You retain access until the end of the billing period.</p>
        </section>
      </div>
    </main>
  );
}
