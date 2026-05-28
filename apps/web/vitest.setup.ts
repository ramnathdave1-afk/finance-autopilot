import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Stub out `server-only` so jsdom tests can import server modules that
// transitively depend on it.
vi.mock("server-only", () => ({}));
