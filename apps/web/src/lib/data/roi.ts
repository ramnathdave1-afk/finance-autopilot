import "server-only";
import { totalRoi } from "@fa/db";
import { hasSupabaseEnv } from "./env";

export async function getTotalRoi(userId: string): Promise<number> {
  if (!hasSupabaseEnv()) return 2847;
  try {
    return await totalRoi(userId);
  } catch {
    return 0;
  }
}
