"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "./card";
import { Button } from "./button";
import { Badge } from "./badge";

export interface FeedCardAction {
  label: string;
  intent?: "primary" | "ghost" | "danger";
  onClick?: () => void;
  href?: string;
}

export interface FeedCardData {
  id: string;
  agent: string;
  type: "approval" | "info" | "win" | "alert";
  title: string;
  body?: string;
  roi_amount?: number | null;
  actions?: FeedCardAction[];
  timestamp?: string;
}

const toneFor = (t: FeedCardData["type"]) =>
  t === "approval" ? "accent" : t === "win" ? "accent" : t === "alert" ? "danger" : "neutral";

export function FeedCard({ card }: { card: FeedCardData }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge tone={toneFor(card.type) as any}>{card.agent}</Badge>
          {card.roi_amount != null && (
            <Badge tone="accent">${card.roi_amount.toFixed(0)}/mo</Badge>
          )}
        </div>
        {card.timestamp && <span className="text-small text-fg-subtle">{card.timestamp}</span>}
      </CardHeader>
      <CardTitle>{card.title}</CardTitle>
      {card.body && <CardBody className="mt-2">{card.body}</CardBody>}
      {card.actions && card.actions.length > 0 && (
        <CardFooter>
          {card.actions.map((a, i) => (
            <Button
              key={i}
              variant={a.intent ?? (i === 0 ? "primary" : "ghost")}
              size="sm"
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}
