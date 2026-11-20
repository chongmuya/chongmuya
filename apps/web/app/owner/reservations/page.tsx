import { Suspense } from "react";
import { OwnerScreen } from "@/features/owner/client";
export default function Page() {
  return (
    <Suspense fallback={<p>예약 확인 중…</p>}>
      <OwnerScreen view="reservations" />
    </Suspense>
  );
}
