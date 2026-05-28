"use client";
import { useTransition } from "react";
import { FeedCard, type FeedCardData } from "@fa/ui";
import { approveActionAction, skipActionAction } from "@/app/actions/agents";

export function FeedCardWired({ card }: { card: FeedCardData }) {
  const [pending, start] = useTransition();
  const isApproval = card.type === "approval";
  if (!isApproval) return <FeedCard card={card} />;

  const wired: FeedCardData = {
    ...card,
    actions: [
      {
        label: pending ? "…" : "Approve",
        intent: "primary",
        onClick: () => start(async () => { await approveActionAction(card.id); })
      },
      {
        label: "Skip",
        intent: "ghost",
        onClick: () => start(async () => { await skipActionAction(card.id); })
      }
    ]
  };
  return <FeedCard card={wired} />;
}
