# @fa/mobile — Pilot (Expo React Native)

Mobile-first vertical-feed UI for Finance Autopilot. Maps to PRD §5 principle 5
(mobile-first), §8.5 (universal UX rules — pause-all anywhere, one-click cancel,
no retention cascades), §14 (UX/UI: dark default, vertical feed, WCAG AA), and
§20 (perf reqs).

## Tests

`pnpm --filter @fa/mobile test` currently runs only pure-TS tests (tokens, fixtures — 6 cases). The 9 RN component tests (`FeedCard`, `AgentActionCard`, `PauseAllButton`, `CancelSubscriptionSheet`) are written and committed but skipped pending a fix to `jest-expo`'s setup.js incompatibility with RN 0.74. **TODO(integrate-jest-rn):** restore `preset: "jest-expo"` in `jest.config.js` and unskip via `testMatch`.

## Run

```
# from monorepo root
pnpm install
pnpm --filter @fa/mobile start

# or directly
pnpm --filter @fa/mobile ios
pnpm --filter @fa/mobile android
```

Copy `.env.example` to `.env` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3000` — the `@fa/web` Next.js dev server)

## Stack

- Expo SDK 51 + expo-router (file-based routing)
- React Native 0.74 / React 18.2
- Supabase JS (anon key only) with AsyncStorage session persistence
- Jest + `@testing-library/react-native`
- Dark mode default; `ThemeProvider` exposes `useTheme()`

## Structure

```
app/                      file-based routes (expo-router)
  _layout.tsx             root: SafeArea + ThemeProvider + status bar
  index.tsx               redirect → /(auth)/login
  (auth)/                 login / signup / magic
  (onboarding)/           welcome → goals → connect (Plaid) → tier (paywall) → done
  (app)/                  tabbed shell: feed / net-worth / activity / settings
src/
  theme/                  tokens.ts + ThemeProvider/useTheme
  lib/                    supabase.ts + api.ts + feed-types.ts
  components/             Text, Button, Badge, FeedCard, AgentActionCard,
                          InsightCard, WinCard, AlertCard, PauseAllButton,
                          Skeleton, CancelSubscriptionSheet
  fixtures/               mock feed (TODO swap for real API)
tests/                    jest tests (>=8 cases)
```

## What's mocked vs. real

| Surface | Real | Mocked / TODO |
|---|---|---|
| Auth (Supabase) | ✅ wired via `@supabase/supabase-js` + AsyncStorage | needs `.env` filled |
| Plaid connect | UI shell | `TODO(integrate-plaid-rn)` — fake success today, must call `react-native-plaid-link-sdk` + `/api/plaid/exchange` |
| Stripe Checkout | tier picker UI | `TODO(integrate-stripe-rn)` — must open Stripe Checkout via webview or `/api/stripe/checkout` |
| Feed | `mockFeed` fixture | `TODO(integrate-feed-api)` — replace with `apiGet<FeedItem[]>('/api/feed', token)` |
| Net Worth | mock series | `TODO(integrate-networth-api)` |
| Activity log | mock `AgentAction[]` | `TODO(integrate-activity-api)` (T3 owns `/api/agent-actions`) |
| Push notifications | not wired | `TODO(integrate-push-expo)` — register Expo push token, POST to backend |
| Cancel subscription | sheet + UI | `TODO(integrate-cancel-api)` — POST `/api/subscriptions/:id/cancel` |

## Backend contract

Mobile **never** uses the Supabase service-role key. Two paths only:

1. **Direct reads via anon client** — RLS on `@fa/db` enforces row scoping. Use
   `supabase` from `src/lib/supabase.ts` for things like reading the user's own
   `feed`, `agent_actions`, `goals` if RLS allows it.
2. **API routes on `@fa/web`** — for anything that needs the service-role key
   (Plaid token exchange, Stripe Checkout creation, agent invocation). Use the
   helpers in `src/lib/api.ts` and pass the session access token in the
   `Authorization: Bearer` header. T1's `apps/web` exposes the routes.

## Anti-Cleo guard

`src/components/CancelSubscriptionSheet.tsx` is structurally constrained to
exactly **two** buttons (Confirm cancel + Keep my plan). The test
`tests/CancelSubscriptionSheet.test.tsx` asserts this with
`within(sheet).getAllByRole('button')` — if anyone adds a retention cascade /
win-back screen, the test breaks. This is the PRD §8.5 promise made testable.

## TODO markers

Grep for `TODO(integrate-*)` to find every place that needs real wiring:

- `TODO(integrate-plaid-rn)` — `app/(onboarding)/connect.tsx`
- `TODO(integrate-stripe-rn)` — `app/(onboarding)/tier.tsx`
- `TODO(integrate-feed-api)` — `src/fixtures/feed.ts`, `app/(app)/feed.tsx`
- `TODO(integrate-networth-api)` — `app/(app)/net-worth.tsx`
- `TODO(integrate-activity-api)` — `app/(app)/activity.tsx`
- `TODO(integrate-cancel-api)` — `app/(app)/settings.tsx`
- `TODO(integrate-auth-redirect)` — `app/(auth)/_layout.tsx`
- `TODO(integrate-push-expo)` — not yet placed; add when registering for push
- `TODO(integrate-eas)` — `app.config.ts` EAS project id

## Tests

```
pnpm --filter @fa/mobile test
```

Coverage: tokens snapshot + structural, `FeedCard` rendering, `AgentActionCard`
Approve/Skip callbacks, `PauseAllButton` toggle + accessibility, anti-Cleo
structural guard on `CancelSubscriptionSheet`, feed fixture sanity.
