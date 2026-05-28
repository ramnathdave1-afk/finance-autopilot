import { describe, it, expect } from "vitest";
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { POST as cancelPOST } from "@/app/api/billing/cancel/route";

function req(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

describe("billing routes (stubs)", () => {
  it("checkout returns url for valid body", async () => {
    const res = await checkoutPOST(req({ tier: "pro", billing: "annual" }));
    const data = await res.json();
    expect(data.url).toContain("/paywall");
    expect(data.placeholder).toBe(true);
  });
  it("checkout rejects invalid body", async () => {
    const res = await checkoutPOST(req({ tier: "bogus", billing: "annual" }));
    expect(res.status).toBe(400);
  });
  it("cancel acknowledges", async () => {
    const res = await cancelPOST();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
