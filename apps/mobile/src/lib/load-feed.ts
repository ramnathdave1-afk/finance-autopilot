// Feed-loading state machine, extracted from app/(app)/feed.tsx so it can be
// unit-tested without jest-expo / RN rendering. Maps the
// session -> token -> apiGet("/api/feed") flow onto a discriminated State.
//
// Shape matches apps/web/src/app/api/feed/route.ts — GET returns { items }.
import { apiGet } from "./api";
import type { FeedItem } from "./feed-types";
import { supabase } from "./supabase";

export interface FeedResponse {
  items: FeedItem[];
}

export type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: FeedItem[] };

/**
 * Fetch the feed for the signed-in user. Resolves to a terminal FeedState
 * (ready/error); the "loading" state is the initial value callers render
 * before this promise settles. Never throws — failures become an error state.
 */
export async function loadFeed(): Promise<FeedState> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await apiGet<FeedResponse>("/api/feed", token);
    return { status: "ready", items: res.items };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't load your feed.";
    return { status: "error", message };
  }
}
