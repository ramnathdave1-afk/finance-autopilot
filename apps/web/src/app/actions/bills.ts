"use server";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";
import { resolveProviderPhone } from "@/lib/provider-phones";

export interface CreateBillInput {
  provider: string;
  currentAmount: number;
  /** Optional explicit provider support line (E.164), e.g. read off the bill. */
  providerPhone?: string | null;
}

export interface CreateBillResult {
  ok: boolean;
  error?: string;
  billId?: string;
  providerPhone?: string;
}

/**
 * Create a bills row for negotiation and resolve the provider's support line.
 * Returns the real billId + providerPhone the bill-negotiation agent needs as
 * input. Without Supabase env (local/demo) returns a stub so the UI flow still
 * renders, but the agent will run only with real persistence.
 */
export async function createBillForNegotiation(
  input: CreateBillInput,
): Promise<CreateBillResult> {
  const providerPhone = resolveProviderPhone(input.provider, input.providerPhone);
  if (!providerPhone) {
    return {
      ok: false,
      error:
        "We don't have a support number on file for this provider. Add the number from your bill and try again.",
    };
  }
  if (!hasSupabaseEnv()) {
    return { ok: true, billId: "demo-bill", providerPhone };
  }
  try {
    const userId = await currentUserId();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("bills")
      .insert({
        user_id: userId,
        provider_name: input.provider,
        current_amount: input.currentAmount,
        billing_period: "monthly",
        source: "manual",
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not save the bill" };
    }
    return { ok: true, billId: (data as { id: string }).id, providerPhone };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
