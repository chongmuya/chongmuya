import { Suspense } from "react";
import { AuthEntryScreen, SplashScreen } from "@/features/auth/client";
export default function IntroductionPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthEntryScreen screen="start" />
    </Suspense>
  );
}
