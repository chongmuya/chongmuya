import type {
  VerificationActions,
  VerificationResult,
} from "../../types/verification.types";

export type PreviewOutcome = "success" | "error";
export type PreviewVerification = "pending" | "verified" | "error" | "expired";

// Development interaction fixtures only. No network, persistence or real account changes.
async function delay(signal: AbortSignal) {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Preview unavailable");
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 700);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export async function previewSubmission(
  outcome: PreviewOutcome,
  signal: AbortSignal,
) {
  await delay(signal);
  if (outcome === "error") throw new TypeError("Preview network failure");
}
export function previewVerification(
  outcome: PreviewVerification,
): VerificationActions {
  const result = async (
    value: string,
    signal: AbortSignal,
  ): Promise<VerificationResult> => {
    await delay(signal);
    return { value, status: outcome };
  };
  return { request: result, check: result };
}
