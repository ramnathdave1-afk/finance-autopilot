import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("session_id=cs_test_123")
}));
vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })));

import CheckoutSuccess from "@/app/upgrade/success/page";
import Privacy from "@/app/privacy/page";
import Terms from "@/app/terms/page";
import NotFound from "@/app/not-found";
import Notifications from "@/app/app/settings/notifications/page";
import { SiteFooter } from "@/components/site-footer";

describe("Phase 7 surfaces", () => {
  it("checkout success shows confirmation + receipt id", () => {
    render(<CheckoutSuccess />);
    expect(screen.getByText(/You're in/i)).toBeInTheDocument();
    expect(screen.getByText(/Receipt id:/i)).toBeInTheDocument();
  });
  it("privacy page renders headings", () => {
    render(<Privacy />);
    expect(screen.getByText(/What we collect/i)).toBeInTheDocument();
  });
  it("terms page renders headings", () => {
    render(<Terms />);
    expect(screen.getByText(/Agent actions are authorized by you/i)).toBeInTheDocument();
  });
  it("404 page renders", () => {
    render(<NotFound />);
    expect(screen.getByText(/Couldn't find that page/i)).toBeInTheDocument();
  });
  it("notifications page renders prefs form", () => {
    render(<Notifications />);
    expect(screen.getByText(/Daily briefing/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Delivery time/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Voice briefing/i })).toBeInTheDocument();
  });
  it("site footer has legal links", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: /Privacy/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Terms/i })).toBeInTheDocument();
  });
});
