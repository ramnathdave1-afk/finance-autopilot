/**
 * Thin client around the @fa/web Next.js API routes. Mobile never talks to the
 * Supabase service-role key directly — server-side things (Plaid exchange,
 * Stripe Checkout creation, agent invocation) all go through the web app's
 * authenticated routes.
 */
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  accessToken?: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}
