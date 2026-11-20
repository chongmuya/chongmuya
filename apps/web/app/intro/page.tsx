import { Suspense } from "react";
import { ServiceIntroduction, SplashScreen } from "@/features/auth/client";
export default function IntroductionPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <ServiceIntroduction />
    </Suspense>
  );
}
