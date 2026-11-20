"use client";
import { useSyncExternalStore } from "react";
import { focusManager } from "@tanstack/react-query";

export function usePageVisible() {
  return useSyncExternalStore(
    focusManager.subscribe,
    () => focusManager.isFocused(),
    () => true,
  );
}
