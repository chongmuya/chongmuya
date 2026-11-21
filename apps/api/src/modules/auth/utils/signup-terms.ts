// Add a new page and version when published legal text changes.
export const signupTermsVersion = "2026-11-21";
export const signupTerms = [
  {
    id: "serviceTerms",
    anchor: "service-terms",
    title: "이용약관 동의",
    required: true,
  },
  {
    id: "privacyCollection",
    anchor: "privacy-collection",
    title: "개인정보 수집 및 이용동의",
    required: true,
  },
  {
    id: "privacyPolicy",
    anchor: "privacy-policy",
    title: "개인정보 처리방침",
    required: false,
  },
  {
    id: "marketing",
    anchor: "marketing",
    title: "마케팅 정보 수신",
    required: false,
  },
] as const;
