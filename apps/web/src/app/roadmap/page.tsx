"use client";
import { useState } from "react";
import { Badge, Card, CardBody, CardTitle } from "@fa/ui";

type Status = "shipped" | "building" | "next" | "considering";

type Item = {
  id: string;
  title: string;
  body: string;
  status: Status;
  votes: number;
};

const initial: Item[] = [
  { id: "i-1", title: "Subscription Killer (Tier-1)", body: "Cancel any subscription in one tap.", status: "shipped", votes: 412 },
  { id: "i-2", title: "Bill Negotiation voice agent", body: "AI calls Comcast / Verizon / GEICO to renegotiate.", status: "shipped", votes: 803 },
  { id: "i-3", title: "Card Optimizer", body: "Which card to use per category, with auto-apply.", status: "building", votes: 219 },
  { id: "i-4", title: "Missing Money finder", body: "State unclaimed property + old 401k databases.", status: "building", votes: 168 },
  { id: "i-5", title: "Tax Prep handoff", body: "Year-round tracking, hand off at filing.", status: "next", votes: 297 },
  { id: "i-6", title: "Couples shared visibility", body: "Two-account mode with privacy controls.", status: "considering", votes: 144 },
  { id: "i-7", title: "Plaid Transfer (autonomous moves)", body: "Auto-Saver and Round-Up actually move money.", status: "considering", votes: 521 }
];

const tone: Record<Status, "accent" | "warn" | "neutral"> = {
  shipped: "accent",
  building: "warn",
  next: "neutral",
  considering: "neutral"
};

const label: Record<Status, string> = {
  shipped: "Shipped",
  building: "Building",
  next: "Next",
  considering: "Considering"
};

export default function Roadmap() {
  const [items, setItems] = useState(initial);
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  function vote(id: string) {
    if (voted[id]) return;
    setVoted({ ...voted, [id]: true });
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, votes: x.votes + 1 } : x)));
  }

  return (
    <main className="container py-16 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-h1 mb-2">Public roadmap</h1>
        <p className="text-small text-fg-muted">
          What we&apos;re building and why. Upvote what matters to you.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((it) => (
          <Card key={it.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={tone[it.status]}>{label[it.status]}</Badge>
                </div>
                <CardTitle>{it.title}</CardTitle>
                <CardBody className="mt-1">{it.body}</CardBody>
              </div>
              <button
                type="button"
                onClick={() => vote(it.id)}
                disabled={voted[it.id]}
                className={`flex flex-col items-center rounded-md border px-3 py-2 transition-colors disabled:opacity-60 ${
                  voted[it.id] ? "border-accent text-accent" : "border-border text-fg hover:border-border-strong"
                }`}
                aria-label={`Upvote ${it.title}`}
              >
                <span className="text-small">▲</span>
                <span className="text-body font-medium">{it.votes}</span>
              </button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
