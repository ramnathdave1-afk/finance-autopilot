import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AgentsIndex from "@/app/app/agents/page";
import Disputes from "@/app/app/agents/disputes/page";
import Cards from "@/app/app/agents/cards/page";
import Missing from "@/app/app/agents/missing-money/page";
import Refi from "@/app/app/agents/refinance/page";
import Insurance from "@/app/app/agents/insurance/page";

describe("Pro-tier agent screens", () => {
  it("agents index lists all six", () => {
    render(<AgentsIndex />);
    ["Bill Negotiation", "Charge Disputes", "Card Optimizer", "Missing Money", "Refinance Watcher", "Insurance Shopper"]
      .forEach((n) => expect(screen.getByText(n)).toBeInTheDocument());
  });
  it("disputes renders stub items", () => {
    render(<Disputes />);
    expect(screen.getAllByText(/Duplicate charge/i).length).toBeGreaterThan(0);
  });
  it("card optimizer shows category recs", () => {
    render(<Cards />);
    expect(screen.getByText(/Amex Gold/i)).toBeInTheDocument();
  });
  it("missing money shows total found", () => {
    render(<Missing />);
    expect(screen.getByText(/NY State Unclaimed Funds/i)).toBeInTheDocument();
  });
  it("refinance lists at least one opportunity", () => {
    render(<Refi />);
    expect(screen.getByText(/Honda Civic/i)).toBeInTheDocument();
  });
  it("insurance ranks best quote", () => {
    render(<Insurance />);
    expect(screen.getAllByText(/GEICO/).length).toBeGreaterThan(0);
  });
});
