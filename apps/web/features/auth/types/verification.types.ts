export type VerificationStatus =
  "idle" | "requesting" | "pending" | "verified" | "error" | "expired";
export type VerificationResult = {
  value: string;
  status: Exclude<VerificationStatus, "idle" | "requesting">;
  // Supplied by the server adapter; no local resend/expiry policy.
  retryAt?: number;
  expiresAt?: number;
};
export type VerificationState = Omit<VerificationResult, "status"> & {
  status: VerificationStatus;
};
export type VerificationActions = {
  request: (value: string, signal: AbortSignal) => Promise<VerificationResult>;
  check?: (value: string, signal: AbortSignal) => Promise<VerificationResult>;
};
