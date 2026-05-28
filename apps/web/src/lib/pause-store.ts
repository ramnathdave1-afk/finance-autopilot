"use client";
import { useEffect, useState } from "react";

const KEY = "fa.paused";

export function usePauseAll() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setPaused(typeof window !== "undefined" && localStorage.getItem(KEY) === "1");
  }, []);
  function set(v: boolean) {
    setPaused(v);
    if (typeof window !== "undefined") localStorage.setItem(KEY, v ? "1" : "0");
  }
  return [paused, set] as const;
}
