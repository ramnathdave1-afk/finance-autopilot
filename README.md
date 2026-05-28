# Finance Autopilot — Monorepo

Built from `/Users/daveramnath/Documents/Claude/Projects/rkv consulting/finance-autopilot-PRD.md`.

## Workspace ownership (5-terminal parallel build)

| Terminal | Owns | Touches |
|---|---|---|
| **T1 — Foundation/UI** | `apps/web`, `packages/ui` | Next.js shell, auth UI, vertical feed, onboarding, settings, paywall UI, design tokens |
| **T2 — Data/Plaid** | `packages/db`, `packages/integrations/plaid`, `packages/integrations/claude` | Supabase schema + RLS, Plaid Link/Auth/Transactions, daily sync, AI categorization |
| **T3 — Info Agents** | `packages/agents/daily-brief`, `packages/agents/spending-coach` | Agent 6 + Agent 4, Inngest base, Claude prompts |
| **T4 — Subscription Killer** | `packages/agents/subscription-killer`, `packages/integrations/browserbase` | Agent 1, Stagehand, top-50 mapping, cancel workflow |
| **T5 — Money + Billing** | `packages/agents/auto-saver`, `packages/agents/round-up`, `packages/integrations/stripe` | Agents 2 & 3, Stripe Billing, tier enforcement, paywall logic |

## Rules

1. **Don't touch another terminal's directory.** If you need cross-cutting types, put them in `packages/db/types` (T2 owns; coordinate via PR).
2. **All DB tables you need: add a migration in `packages/db/migrations/` named `phaseN_T<n>_<purpose>.sql`.** T2 reviews.
3. **Every agent writes to `agent_actions` audit log.** Schema owned by T2; client owned by T3.
4. **Phase ends when:** tests pass, typecheck passes, lint passes, no console errors in dev, and your terminal posts a "done" report.
