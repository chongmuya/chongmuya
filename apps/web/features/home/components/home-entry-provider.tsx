"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

type EntryPhase = "splash" | "ready" | "complete";

const HomeEntryContext = createContext<{
  phase: EntryPhase;
  complete: () => void;
} | null>(null);

export function HomeEntryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<EntryPhase>(
    pathname === "/" ? "splash" : "complete",
  );

  // The root layout survives client navigation, so the entry runs once per load.
  if (pathname !== "/" && phase !== "complete") setPhase("complete");

  const complete = useCallback(() => setPhase("complete"), []);
  useEffect(() => {
    if (phase !== "splash") return;
    const timer = setTimeout(() => {
      setPhase((current) => (current === "splash" ? "ready" : current));
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <HomeEntryContext.Provider value={{ phase, complete }}>
      {children}
    </HomeEntryContext.Provider>
  );
}

export function useHomeEntry() {
  const entry = useContext(HomeEntryContext);
  if (!entry) throw new Error("HomeEntryProvider is required");
  return entry;
}
