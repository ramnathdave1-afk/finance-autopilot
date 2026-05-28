"use client";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@fa/ui";
import { dispatchAction } from "@/app/actions/agents";
import type { AgentType } from "@fa/db/types";

interface DispatchButtonProps extends Omit<ButtonProps, "onClick"> {
  /**
   * Optional explicit agents.id (a UUID). Normally omitted: dispatchAction
   * resolves the signed-in user's canonical agent row for `agentType`. Passing
   * a bare agent-type string here would be rejected (agent_id is a uuid FK).
   */
  agentId?: string;
  agentType: AgentType;
  actionType: string;
  target?: string | null;
  requiresApproval?: boolean;
  /** Label shown after success, e.g. "Dispute filed" */
  doneLabel?: string;
  children: React.ReactNode;
}

export function DispatchButton({
  agentId,
  agentType,
  actionType,
  target,
  requiresApproval,
  doneLabel,
  children,
  disabled,
  ...rest
}: DispatchButtonProps) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function go() {
    setErr(null);
    start(async () => {
      const res = await dispatchAction({
        ...(agentId ? { agentId } : {}),
        agentType,
        actionType,
        target: target ?? null,
        requiresApproval: Boolean(requiresApproval)
      });
      if (res.ok) setDone(true);
      else setErr(res.error ?? "Something went wrong");
    });
  }

  if (done && doneLabel) {
    return <span className="text-small text-accent">{doneLabel}</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <Button {...rest} onClick={go} disabled={disabled || pending || done}>
        {pending ? "…" : done ? doneLabel ?? "Done" : children}
      </Button>
      {err && <span className="text-small text-danger" role="alert">{err}</span>}
    </div>
  );
}
