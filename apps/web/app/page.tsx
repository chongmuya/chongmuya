import { Suspense } from "react";
import { SplashScreen } from "@/features/auth/client";
import { HomeScreen } from "@/features/home/client";

export default function HomePage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <HomeScreen />
    </Suspense>
  );
}
