// The version is part of the public web URL and the stored consent record.
export const signupTermsVersion = "2026-11-21";

export const signupTerms = [
  {
    id: "serviceTerms",
    title: "이용약관 동의",
    required: true,
    anchor: "service-terms",
  },
  {
    id: "privacyCollection",
    title: "개인정보 수집 및 이용 동의",
    required: true,
    anchor: "privacy-collection",
  },
  {
    id: "privacyPolicy",
    title: "개인정보 처리방침",
    required: false,
    anchor: "privacy-policy",
  },
  {
    id: "marketing",
    title: "마케팅 정보 수신 동의",
    required: false,
    anchor: "marketing",
  },
] as const;
