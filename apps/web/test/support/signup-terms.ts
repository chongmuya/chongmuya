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
  body: ["테스트 약관 본문"],
  draft: true,
})) as import("../../features/auth/types/signup.types").SignupTerm[];
