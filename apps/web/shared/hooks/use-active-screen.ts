"use client";

import { useEffect, useRef } from "react";

// Each account / URL scope mounts a new screen. Ignore late writes after it leaves.
export function useActiveScreen() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
