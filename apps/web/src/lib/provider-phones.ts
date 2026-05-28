// Provider support-line lookup. Lives outside the "use server" actions file
// because a Server Actions module may only export async functions — this sync
// helper must not be a server action.
//
// The bill-negotiation agent dials `input.providerPhone`; the UI only collects
// a provider NAME, so we resolve a support number here. Unknown providers
// require an explicit `providerPhone` (e.g. read off the bill) — we never
// invent a number to dial.

const PROVIDER_SUPPORT_LINES: Record<string, string> = {
  comcast: "+18009346489",
  xfinity: "+18009346489",
  verizon: "+18009220204",
  "at&t": "+18003310500",
  att: "+18003310500",
  "t-mobile": "+18009378997",
  tmobile: "+18009378997",
  spectrum: "+18338497466",
  geico: "+18002071098",
  progressive: "+18007764737",
};

function normalizeProviderKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function resolveProviderPhone(
  providerName: string,
  override?: string | null,
): string | null {
  if (override && override.trim().length > 0) return override.trim();
  const key = normalizeProviderKey(providerName);
  if (PROVIDER_SUPPORT_LINES[key]) return PROVIDER_SUPPORT_LINES[key];
  for (const [k, v] of Object.entries(PROVIDER_SUPPORT_LINES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}
