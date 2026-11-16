import { Suspense } from "react";
import { SignupScreen } from "@/features/auth/client";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupScreen />
    </Suspense>
  );
}
