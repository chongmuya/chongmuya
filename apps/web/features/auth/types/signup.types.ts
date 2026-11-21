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
export type SignupConsentTermId = Exclude<SignupTermId, "privacyPolicy">;
export type SignupConsentTerm = SignupTerm & { id: SignupConsentTermId };
export type AccountType = "organizer" | "owner";
export type SignupRequest = {
  email: string;
  password: string;
  name: string;
  phone: string;
  emailVerificationId: string;
  phoneVerificationId: string;
  consents: { id: SignupConsentTermId; version: string; accepted: boolean }[];
};

export type FirstSetupInput = { accountType?: AccountType; nickname?: string };

export type KakaoSignupRequest = Omit<
  SignupRequest,
  "password" | "emailVerificationId"
> & { emailVerificationId?: string };
export type SignupFormRequest = SignupRequest | KakaoSignupRequest;
