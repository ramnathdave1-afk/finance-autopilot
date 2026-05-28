import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null })
    }
  })
}));

import Login from "@/app/auth/login/page";
import Signup from "@/app/auth/signup/page";
import Magic from "@/app/auth/magic/page";
import Reset from "@/app/auth/reset/page";

describe("Auth pages", () => {
  it("login renders form", () => {
    render(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });
  it("signup renders form with founder pricing copy", () => {
    render(<Signup />);
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument();
  });
  it("magic link renders email field", () => {
    render(<Magic />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
  it("reset renders email field", () => {
    render(<Reset />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
