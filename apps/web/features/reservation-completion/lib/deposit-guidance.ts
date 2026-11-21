import type { Completion } from "../types/completion.types";

export function depositGuidanceReady({
  guidance,
  issues,
}: Pick<Completion, "guidance" | "issues">) {
  if (guidance.kind === "NONE") return true;
  return (
    guidance.kind === "REQUIRED" &&
    !!guidance.amount &&
    !!guidance.deadline &&
    !issues?.includes("GUIDANCE_PENDING") &&
    (guidance.channel === "SMS" ||
      (guidance.channel === "WEB" &&
        !!(guidance.bank && guidance.account && guidance.holder)))
  );
}
