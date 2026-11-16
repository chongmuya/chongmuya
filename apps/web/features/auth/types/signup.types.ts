export type SignupTermId =
  "serviceTerms" | "privacyCollection" | "privacyPolicy" | "marketing";
export type SignupTerm = {
  id: SignupTermId;
  title: string;
  required: boolean;
  version: string;
  url: string | null;
  body: string[];
  draft: boolean;
};
export type AccountType = "organizer" | "owner";
export type SignupRequest = {
  accountType: AccountType;
  email: string;
  password: string;
  name: string;
  nickname: string;
  phone: string;
  phoneVerificationId: string;
  consents: { id: SignupTermId; version: string; accepted: boolean }[];
};
