// Tier-enforcement middleware (T5 deliverable #3).
//
// Gates protected /app routes based on the user's effective pricing tier.
// Free + Autopilot agents pass freely. Pro / Premium agent paths require
// the matching tier or higher and redirect to /upgrade?to=<required> with
// the original destination preserved in `next`.
//
// Unauthenticated requests to /app are redirected to /auth/login.
//
// Why middleware over per-route checks: a single chokepoint is the only way
// to be confident no Pro feature accidentally ships to a Free user via a
// missed guard on a new page. Per-page checks decay the moment someone adds
// a route and forgets.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type Tier = "free" | "autopilot" | "pro" | "premium";

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  autopilot: 1,
  pro: 2,
  premium: 3,
};

// Per-route minimum tier. Keep aligned with apps/web/src/app/app/agents/ folder.
// Update when a new tier-gated route ships. The middleware default for any
// path under /app/agents not listed here is `autopilot`.
const ROUTE_TIER: Array<{ prefix: string; required: Tier }> = [
  // Pro agents
  { prefix: "/app/agents/bill-negotiation", required: "pro" },
  { prefix: "/app/agents/disputes", required: "pro" },
  { prefix: "/app/agents/cards", required: "pro" },
  { prefix: "/app/agents/missing-money", required: "pro" },
  { prefix: "/app/agents/refinance", required: "pro" },
  { prefix: "/app/agents/insurance", required: "pro" },
  // Premium agents
  { prefix: "/app/agents/tax", required: "premium" },
  { prefix: "/app/agents/rebalancer", required: "premium" },
  { prefix: "/app/agents/strategy", required: "premium" },
  { prefix: "/app/agents/human-backup", required: "premium" },
];

function requiredTierFor(pathname: string): Tier | null {
  for (const r of ROUTE_TIER) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) {
      return r.required;
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public + unprotected — short-circuit. The matcher already filters most,
  // but be explicit here so the cookie + DB read only runs when needed.
  if (!pathname.startsWith("/app")) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon";

  // Use a NextResponse we can mutate so Supabase can refresh session cookies.
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
        for (const { name, value, options } of toSet) {
          res.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const required = requiredTierFor(pathname);
  if (!required) return res; // autopilot-tier or non-gated /app route — let through.

  const { data: tierRow } = await supabase.rpc("effective_tier", { p_user_id: userData.user.id });
  const tier = (tierRow as Tier | null) ?? "free";

  if (TIER_RANK[tier] >= TIER_RANK[required]) return res;

  const url = req.nextUrl.clone();
  url.pathname = "/upgrade";
  url.searchParams.set("to", required);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*"],
};
