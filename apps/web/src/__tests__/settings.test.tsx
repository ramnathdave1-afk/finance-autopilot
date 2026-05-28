import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import SettingsPage from "@/app/app/settings/page";

describe("Settings", () => {
  it("one-click cancel updates state without retention flow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<SettingsPage />);
    const btn = screen.getByRole("button", { name: /cancel subscription/i });
    await userEvent.click(btn);
    expect(screen.getByText(/Cancelled\./i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).toBeNull();
  });
});
