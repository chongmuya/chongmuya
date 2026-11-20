import { Suspense } from "react";
import { OwnerScreen } from "@/features/owner/client";
export default function Page() {
  return (
    <Suspense>
      <OwnerScreen view="hours" />
    </Suspense>
  );
}
