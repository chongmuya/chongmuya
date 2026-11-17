export type VerificationStatus =
  "idle" | "requesting" | "pending" | "verified" | "error" | "expired";
export type VerificationResult = {
  value: string;
  status: Exclude<VerificationStatus, "idle" | "requesting">;
  // Supplied by the server adapter; no local resend/expiry policy.
  retryAt?: number;
  expiresAt?: number;
  id?: string;
  receiver?: string;
  message?: string;
  qrCode?: string;
  nextCheckAt?: number;
  deliveryFailed?: boolean;
  attemptsRemaining?: number;
  checksRemaining?: number;
  serverNow?: number;
};
export type VerificationState = Omit<VerificationResult, "status"> & {
  status: VerificationStatus;
};
export type VerificationActions = {
  request: (value: string, signal: AbortSignal) => Promise<VerificationResult>;
  check?: (
    value: string,
    signal: AbortSignal,
    id?: string,
    code?: string,
  ) => Promise<VerificationResult>;
  cancel?: (id: string) => Promise<void>;
};
