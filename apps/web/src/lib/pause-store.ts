"use client";
import { useSyncExternalStore } from "react";

const KEY = "fa.paused";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function usePauseAll() {
  const paused = useSyncExternalStore(subscribe, getSnapshot, () => false);
  function set(v: boolean) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, v ? "1" : "0");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }
  return [paused, set] as const;
}
