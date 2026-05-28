# apps/web — API routes

Production HTTP surface for Finance Autopilot. Every route here is a Next.js
16 App Router route handler. All call into workspace `@fa/*` packages — this
directory contains no business logic.

## Layout decision

The existing `/api/billing/*` namespace (originally checkout + cancel stubs)
is **kept and extended** rather than mirrored under `/api/stripe/*`. The only
route under `/api/stripe/*` is the webhook receiver, which Stripe knows about
by URL convention and which conceptually belongs to Stripe (not "billing").

| Concern | Path |
|---|---|
| User-initiated Stripe flows | `/api/billing/{checkout,portal,cancel}` |
| Stripe → us | `/api/stripe/webhook` |

## Conventions

- All protected routes use `requireUser()` from `@/lib/api/auth`, which
  throws `UnauthorizedError` (with `.response` = 401 NextResponse) when no
  Supabase session is present.
- Webhook routes (`/api/stripe/webhook`, `/api/plaid/webhook`) read the raw
  body via `req.text()` — never `req.json()` — so signature verification is
  exact.
- Webhook routes return **2xx on signature failure / internal dispatch
  failure** to prevent retry stampedes. The only 4xx Stripe webhooks return
  is on a missing-secret-or-signature pre-check.
- Service-role Supabase access happens only inside `nodejs` runtime routes.
- All routes set `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.

## Helpers

- `@/lib/api/auth` — `requireUser()`, `UnauthorizedError`.
- `@/lib/api/inngest-client` — `getInngest()`, `sendAgentEvent(type, actionType, data)`.

---

## Routes

### `GET /api/health`
Public uptime probe.
- **Auth:** none
- **Response:** `{ ok: true, version: string, ts: string }`
- **Env:** none

---

### `POST /api/billing/checkout`
Create a Stripe Checkout Session for an upgrade.
- **Auth:** required
- **Body:** `{ tier: 'autopilot' | 'pro' | 'premium', billingCycle: 'monthly' | 'annual' }`
- **Response:** `{ url: string, sessionId: string }`
- **Errors:** 400 invalid body · 401 unauth · 500 internal
- **Backend:** `@fa/stripe → createCheckoutSession`
- **Env:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`

### `POST /api/billing/portal`
Open the Stripe Customer Portal for self-serve subscription management.
- **Auth:** required
- **Body:** none
- **Response:** `{ url: string }`
- **Errors:** 401 · 500
- **Backend:** `@fa/stripe → createPortalSession`
- **Env:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`

### `POST /api/billing/cancel`
One-click cancel at period end. **Anti-Cleo: no retention prompts ever.**
- **Auth:** required
- **Body:** none
- **Response:** `OneClickCancelResult` from `@fa/stripe` (includes
  `retentionPrompts: never[]` — structurally constrained to empty).
- **Errors:** 401 · 500
- **Backend:** `@fa/stripe → oneClickCancel`
- **Env:** `STRIPE_SECRET_KEY`

### `POST /api/stripe/webhook`
Stripe → us. Verifies HMAC signature with the SDK then dispatches.
- **Auth:** Stripe signature header
- **Body:** raw JSON (NEVER parsed in the route)
- **Response:** `{ ok: true, eventId, processed }`
- **Errors:** 400 only on missing/invalid signature. Internal dispatch errors
  return 200 to prevent retry stampedes (logged as `dispatch_error`).
- **Backend:** `@fa/stripe → handleWebhook`
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

### `POST /api/plaid/link-token`
Initialize Plaid Link.
- **Auth:** required
- **Response:** `{ link_token: string, expiration: string }`
- **Env:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_WEBHOOK_URL`
- **Backend:** `@fa/plaid → createLinkToken`

### `POST /api/plaid/exchange`
Exchange a Link public_token for an access_token + bootstrap accounts.
- **Auth:** required
- **Body:** `{ publicToken: string, institutionId?: string, institutionName?: string }`
  (also accepts `public_token` for snake_case clients)
- **Response:** `{ connected: true, itemRowId: string, accountIds: string[] }`
- **Backend:** `@fa/plaid → exchangePublicToken`

### `POST /api/plaid/webhook`
Plaid → us. Verifies JWT signature against Plaid's JWK and request_body_sha256.
- **Auth:** Plaid-Verification header (JWT)
- **Body:** raw JSON
- **Response:** always 200, with `{ ok, ...detail }`
- **Backend:** `@fa/plaid → verifyPlaidJwt + handlePlaidWebhook`
- **Env:** `PLAID_ENV`, `PLAID_CLIENT_ID`, `PLAID_SECRET`

---

### `POST /api/inngest`
Inngest serve handler. Registers every agent's `defineAgent` side effect by
importing the `@fa/agent-*` packages, then exposes one function per
`(agentType, actionType)` listening on `agent/<type>.<actionType>.requested`.
3 retries with exponential backoff per PRD §10.
- **Auth:** Inngest signing key (handled by the SDK)
- **Methods:** `GET, POST, PUT`
- **Env:** `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`

### `POST /api/agent-actions/:id/approve`
Approve a pending `agent_actions` row and dispatch its execution to Inngest.
- **Auth:** required (must own the action)
- **Response:** `{ status: 'queued', actionId }`
- **Errors:** 401 · 403 (not your action) · 404 (no such id) · 500
- **Backend:** `@fa/db → approveAction` + `sendAgentEvent`

### `POST /api/agent-actions/:id/reject`
Cancel a pending action.
- **Auth:** required (must own the action)
- **Response:** `{ status: 'cancelled', actionId }`
- **Backend:** `@fa/db → markCancelled`

---

### `GET /api/feed`
Vertical feed for mobile + web. Returns `FeedItem[]` matching
`apps/mobile/src/lib/feed-types.ts`.
- **Auth:** required
- **Query:** `?limit=50` (1..200)
- **Response:** `{ items: FeedItem[] }`
- **Backend:** Supabase `agent_actions` via `@fa/db` service client

### `POST /api/pause-all`
Global pause-everything toggle (PRD §14).
- **Auth:** required
- **Body:** `{ paused: boolean }`
- **Response:** `{ paused: boolean }`
- **Backend:** `@fa/db → setPauseAll`

---

## TODO markers in this tree

- `TODO(integrate-stripe-adapter)` — `@fa/stripe` ships with `StubAdapter`
  that throws. Production must install `RealStripeAdapter` via
  `setAdapter(new RealStripeAdapter(stripe))` at boot. Likely place: a
  `apps/web/src/instrumentation.ts` once the real adapter lands.
- `TODO(integrate-inngest-registry-export)` — `_getRegistry` is imported via
  a deep path from `@fa/inngest/src/define-agent`. When that package adds an
  `exports` map, switch to the named export.
- `TODO(integrate-agent-input-rehydration)` — `/api/agent-actions/[id]/approve`
  forwards `{ actionId, target }` as the agent input. Several agents (auto-saver,
  round-up) want richer input (paycheck txn, week-of transactions). The agent
  worker will need to rehydrate from the action row + the user's data; until
  then those agents will receive minimal input and may no-op.
