import { Suspense } from "react";
import { GettingStartedScreen } from "@/features/onboarding/client";

export default function Page() {
  return (
    <Suspense>
      <GettingStartedScreen />
    </Suspense>
  );
}
