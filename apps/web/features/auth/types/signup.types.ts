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
  email: string;
  password: string;
  name: string;
  phone: string;
  emailVerificationId: string;
  phoneVerificationId: string;
  consents: { id: SignupTermId; version: string; accepted: boolean }[];
};

export type FirstSetupInput = { accountType?: AccountType; nickname?: string };
