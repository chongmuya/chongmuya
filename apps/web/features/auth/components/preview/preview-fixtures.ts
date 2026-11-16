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
    return {
      value,
      status: outcome,
      id: "00000000-0000-4000-8000-000000000001",
      expiresAt: Date.now() + 300000,
      retryAt: Date.now(),
      nextCheckAt: Date.now(),
      serverNow: Date.now(),
      checksRemaining: 12,
    };
  };
  return { request: result, check: result };
}

export const previewTerms = [
  { id: "serviceTerms", title: "이용약관 동의", required: true },
  {
    id: "privacyCollection",
    title: "개인정보 수집 및 이용동의",
    required: true,
  },
  { id: "privacyPolicy", title: "개인정보 처리방침", required: true },
  { id: "marketing", title: "마케팅 정보 수신", required: false },
].map((term) => ({
  ...term,
  version: "preview",
  url: null,
  body: ["개발 미리보기 약관입니다. 실제 동의로 저장되지 않습니다."],
  draft: true,
})) as import("../../types/signup.types").SignupTerm[];
