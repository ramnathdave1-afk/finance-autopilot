# Finance Autopilot — Launch Checklist

A sequenced runbook to take the code-complete monorepo (16 agents, web + mobile)
from "builds locally" to "live in production." Derived from `STATUS.md` and the
launch-infra tooling (`scripts/`, `apps/web/vercel.json`, `apps/mobile/eas.json`).

Code is done. Everything below is **accounts, credentials, and gates** — work no
subagent can do because it needs your real keys and your real approvals.

**Critical path note:** Plaid production approval is the long-pole — it requires a
business/compliance review that can take **days to weeks**. Start it first; it
runs in parallel with everything else.

---

## 0. Already done (do not redo)

- [x] Monorepo builds clean — `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`,
      `pnpm --filter @fa/web build` all zero-error.
- [x] 16 of 16 agents code-complete (see `STATUS.md` roster).
- [x] **Supabase project created + schema live** — DB tables, RLS, and migrations
      applied. (Re-applying is idempotent via `scripts/setup.mjs`.)
- [x] Launch tooling wired into root scripts: `check:env`, `setup`, `stripe:prices`,
      `deploy:web`, `deploy:mobile`, `submit:mobile`.

---

## 1. Create accounts / provision credentials

Start the **Plaid** item first — it is the approval long-pole.

- [ ] **Plaid (LONG-POLE — start now)** — create app, get `PLAID_CLIENT_ID` /
      `PLAID_SECRET`. Begin in `sandbox`. **Submit the production-access request
      immediately** (business + compliance review; days–weeks). Set
      `PLAID_WEBHOOK_URL` to the deployed `/api/plaid/webhook` once the web app has
      a URL (step 5).
- [ ] **Anthropic** — `ANTHROPIC_API_KEY` (agent reasoning + transaction categorizer).
- [ ] **Stripe** — account in live mode; capture `STRIPE_SECRET_KEY` and
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Webhook secret comes in step 3.
- [ ] **Inngest** — `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` (cron + agent fan-out;
      crons already registered in code).
- [ ] **Twilio + TTS (Pro voice negotiation — optional for v1 launch)** —
      `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER`, plus
      `ELEVENLABS_API_KEY` (or `OPENAI_API_KEY` + `OPENAI_TTS_VOICE`).
      `TWILIO_VOICE_TWIML_URL` / `TWILIO_VOICE_STATUS_CALLBACK_URL` point at the
      deployed `/api/voice/twiml` and `/api/voice/status` routes (fill after step 5).
- [ ] **Push + observability (optional)** — `EXPO_ACCESS_TOKEN`, OneSignal keys;
      PostHog + Sentry keys.
- [ ] **Per-provider agent ports (defer past v1)** — bank-dispute, unclaimed-property,
      insurance-quote, brokerage, tax-filing APIs. Each flips its port stub→live when
      keyed; agents fail loudly until then.

---

## 2. Wire environment variables

Single source of truth is `.env.example` (grouped by service). **Never edit or
commit `.env.local`.**

- [ ] Copy `.env.example` → `.env.local` and fill the values from step 1.
- [ ] Validate: `pnpm check:env` — reports PASS / MISSING / PLACEHOLDER / INVALID per
      var, masks all secrets, and exits non-zero if any **core-required** var is
      missing/placeholder/invalid. Core-required = Supabase (3), Plaid (client/secret/
      env), Anthropic, Stripe (secret/webhook/publishable), Inngest (event/signing).
- [ ] `DATABASE_URL` (Supabase Postgres connection string) — needed by migrations in
      step 4. Read from env/shell; not declared in `.env.example`.

---

## 3. Create Stripe catalog (products / prices / coupon)

- [ ] Dry-run: `pnpm stripe:prices` (default; prints planned 4 products, 7 recurring
      prices, `FOUNDER_YEAR1_50PCT` coupon — no writes).
- [ ] Commit: `pnpm stripe:prices -- --commit` (idempotent; reads `STRIPE_SECRET_KEY`).
- [ ] Paste ALL generated IDs into `.env.local` (the script prints ready-to-paste
      lines): `STRIPE_PRICE_AUTOPILOT_MONTHLY/ANNUAL`, `STRIPE_PRICE_PRO_MONTHLY/ANNUAL`,
      `STRIPE_PRICE_PREMIUM_MONTHLY/ANNUAL`, `STRIPE_PRICE_FOUNDER_999_LIFETIME`, and
      `STRIPE_COUPON_FOUNDER_YEAR1_50PCT`. These are read at runtime by
      `@fa/stripe` `PRICE_TABLE` / founder-pricing (products.ts), so real checkouts
      reference the live IDs (it falls back to `*_stub` IDs only when unset).
- [ ] In the Stripe dashboard, add a webhook endpoint → deployed
      `/api/stripe/webhook`, and set `STRIPE_WEBHOOK_SECRET` (do after step 5 URL is
      known; or use the Stripe CLI to test locally first).
- [ ] Re-run `pnpm check:env` to confirm the new price IDs validate.

---

## 4. Apply database migrations

Supabase project + schema are already live (step 0). This re-applies idempotently
and confirms the env is migration-ready.

- [ ] `pnpm setup` — runs `check:env` (fail-fast), then
      `pnpm --filter @fa/db migrate:apply` when `DATABASE_URL` is set (skips with a
      clear message otherwise). `DATABASE_URL` is passed through env, never logged.
- [ ] Confirm RLS is enforced (spot-check a couple of policies in Supabase).

---

## 5. Deploy

### Web — Vercel (`apps/web/vercel.json`)
- [ ] Create the Vercel project; **set Root Directory = `apps/web`** (the config's
      `cd ../..` install/build commands depend on it).
- [ ] Add every env var from `vercel.json`'s `//env.*` keys to the Vercel project
      (Production + Preview). Public vs server-only split is documented there.
- [ ] Deploy: `pnpm deploy:web` (prod) or `pnpm deploy:web:preview`. Requires the
      `vercel` CLI on the deploy machine (`npm i -g vercel` if not pinned).
- [ ] Back-fill the URL-dependent vars now that the origin exists: `PLAID_WEBHOOK_URL`,
      `STRIPE_WEBHOOK_SECRET` (step 3), `TWILIO_VOICE_TWIML_URL` /
      `TWILIO_VOICE_STATUS_CALLBACK_URL` (if voice enabled).

### Mobile — EAS (`apps/mobile/eas.json`)
- [ ] `eas init` once to replace the `extra.eas.projectId` TODO in `app.config.ts`.
- [ ] Set EAS secrets — **public values only**: `EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon key, never service-role),
      `EXPO_PUBLIC_API_BASE_URL` (the deployed web origin from above).
- [ ] Preview build: `pnpm deploy:mobile:preview`. Production: `pnpm deploy:mobile`.
      Requires `eas-cli` (`npm i -g eas-cli` if not pinned).

---

## 6. Verify the live deploy

- [ ] Plaid sandbox end-to-end: link → sync → categorize
      (`RUN_PLAID_SANDBOX=1 pnpm --filter @fa/plaid test`).
- [ ] Stripe: real $1 test charge → confirm webhook flips `users.pricing_tier`.
- [ ] Inngest: confirm crons fire against the deployed `/api/inngest` endpoint.
- [ ] Run the 6 Playwright golden-path e2e tests against the deployed web app.
- [ ] (If voice enabled) place one sandboxed negotiation call; confirm
      `/api/voice/twiml` voices the script and `/api/voice/status` updates the
      `bill_negotiations` row + `agent_actions` audit trail.

---

## 7. Non-code gates (no credentials — approvals & reviews)

- [ ] **Legal** — lawyer review of Terms of Service + Privacy Policy (financial data
      + Plaid/Stripe obligations).
- [ ] **Security** — third-party pen-test of the deployed surface; remediate findings.
- [ ] **App Store / Play submission** — `pnpm submit:mobile` after filling the real
      Apple identifiers (`appleId` / `ascAppId` / `appleTeamId`) and providing
      `google-play-service-account.json` (gitignored) in `apps/mobile/eas.json`.
      Allow for store review turnaround.
- [ ] **Plaid production approval received** (started in step 1) — flip
      `PLAID_ENV=production` and rotate to production keys only after approval lands.

---

### Quick command reference

| Step | Command |
|---|---|
| Validate env | `pnpm check:env` |
| Stripe catalog (dry-run / commit) | `pnpm stripe:prices` / `pnpm stripe:prices -- --commit` |
| Migrate DB | `pnpm setup` |
| Deploy web (prod / preview) | `pnpm deploy:web` / `pnpm deploy:web:preview` |
| Deploy mobile (prod / preview) | `pnpm deploy:mobile` / `pnpm deploy:mobile:preview` |
| Submit mobile to stores | `pnpm submit:mobile` |
| Full done-bar | `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm --filter @fa/web build` |
