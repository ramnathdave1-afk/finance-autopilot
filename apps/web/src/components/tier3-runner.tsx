"use client";
// Shared client driver for recommend-only Tier-3 agents (tax, rebalancer,
// strategy, human-backup). All four require approval, so a dispatch lands in
// `awaiting_approval`; the user approves; the router runs the agent; we then
// poll the real audit-log status and hand the terminal steps to the page to
// render. No setTimeout fakes, no "coming soon" — every state reflects exactly
// what the backend reports (and is honestly "pending" without Supabase env).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@fa/ui";
import {
  approveActionAction,
  dispatchAction,
  getActionDetail,
  skipActionAction,
  type AuditStep,
  type DispatchInput,
} from "@/app/actions/agents";

const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "escalated"]);

export type RunnerPhase =
  | "idle"
  | "dispatching"
  | "awaiting_approval"
  | "running"
  | "succeeded"
  | "failed";

export interface Tier3RunnerState {
  phase: RunnerPhase;
  steps: AuditStep[];
  roi: number | null;
  error: string | null;
}

export interface Tier3RunnerApi extends Tier3RunnerState {
  /** Dispatch the agent (lands awaiting_approval). */
  dispatch: () => void;
  /** Approve the parked action so the router runs it; begins polling. */
  approve: () => void;
  /** Cancel the parked action. */
  skip: () => void;
  pending: boolean;
}

/**
 * Drive one approval-gated agent action. Pass the dispatch payload (with
 * requiresApproval forced on). Returns the live phase + audit steps for the page
 * to render its real result from.
 */
export function useTier3Runner(payload: Omit<DispatchInput, "requiresApproval">): Tier3RunnerApi {
  const [state, setState] = useState<Tier3RunnerState>({
    phase: "idle",
    steps: [],
    roi: null,
    error: null,
  });
  const [pending, setPending] = useState(false);
  const actionIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const dispatch = useCallback(() => {
    setPending(true);
    setState((s) => ({ ...s, phase: "dispatching", error: null }));
    void (async () => {
      const res = await dispatchAction({ ...payload, requiresApproval: true });
      setPending(false);
      if (!res.ok || !res.actionId) {
        setState((s) => ({ ...s, phase: "failed", error: res.error ?? "Could not start" }));
        return;
      }
      actionIdRef.current = res.actionId;
      setState((s) => ({ ...s, phase: "awaiting_approval" }));
    })();
  }, [payload]);

  const beginPolling = useCallback(() => {
    const id = actionIdRef.current;
    if (!id) return;
    const tick = async () => {
      const detail = await getActionDetail(id);
      if (detail.status === "succeeded") {
        stopPolling();
        setState({ phase: "succeeded", steps: detail.steps, roi: detail.roi, error: null });
      } else if (detail.status === "failed" || detail.status === "escalated" || detail.status === "cancelled") {
        stopPolling();
        setState((s) => ({
          ...s,
          phase: "failed",
          steps: detail.steps,
          error: "The agent could not complete. We'll review and follow up.",
        }));
      } else if (TERMINAL.has(detail.status)) {
        stopPolling();
      }
    };
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
  }, [stopPolling]);

  const approve = useCallback(() => {
    const id = actionIdRef.current;
    if (!id) return;
    setPending(true);
    setState((s) => ({ ...s, phase: "running", error: null }));
    void (async () => {
      const res = await approveActionAction(id);
      setPending(false);
      if (!res.ok) {
        setState((s) => ({ ...s, phase: "failed", error: res.error ?? "Could not approve" }));
        return;
      }
      beginPolling();
    })();
  }, [beginPolling]);

  const skip = useCallback(() => {
    const id = actionIdRef.current;
    if (!id) {
      setState((s) => ({ ...s, phase: "idle" }));
      return;
    }
    setPending(true);
    void (async () => {
      await skipActionAction(id);
      setPending(false);
      actionIdRef.current = null;
      setState({ phase: "idle", steps: [], roi: null, error: null });
    })();
  }, []);

  return { ...state, dispatch, approve, skip, pending };
}

/** Find the latest audit step matching one of the given names. */
export function findStep(steps: AuditStep[], ...names: string[]): AuditStep | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (names.includes(steps[i].step)) return steps[i];
  }
  return undefined;
}

/** Standard approve / skip control row shown while a dispatch awaits approval. */
export function ApprovalControls({
  runner,
  approveLabel = "Approve & run",
}: {
  runner: Tier3RunnerApi;
  approveLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={runner.approve} disabled={runner.pending}>
        {runner.pending ? "…" : approveLabel}
      </Button>
      <Button variant="ghost" onClick={runner.skip} disabled={runner.pending}>
        Cancel
      </Button>
    </div>
  );
}
