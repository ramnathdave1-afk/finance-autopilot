// PLACEHOLDER — lawyer-reviewed copy replaces this before public launch (PRD §17, §18).
export default function Privacy() {
  return (
    <main className="container py-16 max-w-3xl prose-invert">
      <h1 className="text-h1 mb-2">Privacy policy</h1>
      <p className="text-small text-fg-muted mb-8">Last updated: pending legal review</p>

      <div className="space-y-6 text-body text-fg-muted">
        <section>
          <h2 className="text-h2 text-fg mb-2">What we collect</h2>
          <p>Bank transactions and balances via Plaid (read-only). Account email. Your stated goals and rules. Records of every action your agents take on your behalf.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Where it lives</h2>
          <p>Encrypted at rest in Supabase. Encrypted in transit (TLS 1.3). Plaid access tokens are stored in Supabase Vault and never logged.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Who we share it with</h2>
          <p>The minimum needed for an action you authorize. Bills shared with negotiation targets only with your explicit approval. Anthropic Claude receives prompt-only transaction summaries — never raw bulk data.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Your controls</h2>
          <p>Pause every agent in one tap. Cancel your subscription in one click. Export or delete all your data on demand (GDPR / CCPA aligned). Voice recordings auto-delete after 90 days unless you pin them.</p>
        </section>
        <section>
          <h2 className="text-h2 text-fg mb-2">Questions</h2>
          <p>Contact privacy@pilot — we&apos;ll reply within 5 business days.</p>
        </section>
      </div>
    </main>
  );
}
