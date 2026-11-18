import { Suspense } from "react";
import { HomeScreen } from "@/features/home/client";

export default function HomePage() {
  return (
    <Suspense>
      <HomeScreen />
    </Suspense>
  );
}
