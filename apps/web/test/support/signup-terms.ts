import type { SignupTerm } from "../../features/auth/types/signup.types";

const previewDocument = {
  version: "preview",
  url: null,
  body: ["테스트 약관 본문"],
  draft: true,
};

export const previewConsentTerms: SignupTerm[] = (
  [
    { id: "serviceTerms", title: "이용약관 동의", required: true },
    {
      id: "privacyCollection",
      title: "개인정보 수집 및 이용동의",
      required: true,
    },
    { id: "marketing", title: "마케팅 정보 수신", required: false },
  ] as const
).map((term) => ({ ...term, ...previewDocument }));

export const previewTerms = [
  ...previewConsentTerms,
  {
    ...previewDocument,
    id: "privacyPolicy" as const,
    title: "개인정보 처리방침",
    required: false,
  },
];
