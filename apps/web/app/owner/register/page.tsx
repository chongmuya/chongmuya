import { Suspense } from "react";
import { OwnerScreen } from "@/features/owner/client";
export default function Page() {
  return (
    <Suspense fallback={<p>불러오는 중…</p>}>
      <OwnerScreen view="register" />
    </Suspense>
  );
}
