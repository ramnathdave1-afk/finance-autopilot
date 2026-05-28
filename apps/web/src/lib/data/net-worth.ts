import "server-only";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "./env";

export type NetWorthSnapshot = {
  current: number;
  trend: number[];
};

const STUB_TREND = [
  18200, 18450, 18620, 18510, 18890, 19100, 19340, 19420, 19580, 19770,
  19990, 20120, 20410, 20690, 20850, 21020, 21280, 21550, 21810, 22040,
  22210, 22480, 22760, 22910, 23140, 23390, 23510, 23780, 24050, 24310
];

/**
 * Aggregate net worth from connected_accounts balances. Trend history would
 * require daily snapshots — until T2 adds a snapshots table, the trend ends
 * at the current value and uses stubbed history for the chart.
 */
export async function getNetWorth(userId: string): Promise<NetWorthSnapshot> {
  if (!hasSupabaseEnv()) return { current: STUB_TREND[STUB_TREND.length - 1], trend: STUB_TREND };
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("current_balance, account_type")
      .eq("user_id", userId);
    if (error || !data || data.length === 0) {
      return { current: STUB_TREND[STUB_TREND.length - 1], trend: STUB_TREND };
    }
    const rows = data as Array<{ current_balance: number | null; account_type: string }>;
    const current = rows.reduce((sum, r) => {
      const bal = Number(r.current_balance ?? 0);
      // Credit balances reduce net worth.
      return r.account_type === "credit" ? sum - bal : sum + bal;
    }, 0);
    // Anchor stub history so the chart still ends at the live value.
    const trend = STUB_TREND.map((v, i, arr) => Math.round((v / arr[arr.length - 1]) * current));
    return { current, trend };
  } catch {
    return { current: STUB_TREND[STUB_TREND.length - 1], trend: STUB_TREND };
  }
}
