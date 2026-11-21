import type { Account, SessionRequest } from "@/features/auth/types";
export type PhoneChange = {
  id: string;
  phone: string;
  message: string;
  receiver: string;
  expiresAt: string;
  retryAt: string;
  nextCheckAt: string;
  checksRemaining: number;
  status: string;
  account?: Account;
};
export const saveProfile = (
  request: SessionRequest,
  input: { name: string; nickname?: string },
) =>
  request<Account>("/api/v1/auth/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const issuePhone = (request: SessionRequest, phone: string) =>
  request<PhoneChange>("/api/v1/auth/profile/phone", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
export const verifyPhone = (request: SessionRequest, p: PhoneChange) =>
  request<{ status: string; account?: Account }>(
    "/api/v1/auth/profile/phone/verify",
    { method: "POST", body: JSON.stringify({ id: p.id, phone: p.phone }) },
  );
