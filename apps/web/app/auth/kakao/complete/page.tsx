import { Suspense } from "react";
import { KakaoCompleteScreen } from "@/features/auth/client";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "카카오 인증",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <Suspense>
      <KakaoCompleteScreen />
    </Suspense>
  );
}
