import { Suspense } from "react";
import { PublicReservation } from "@/features/reservation-completion/client";
export const metadata = {
  title: "예약 관리 | 총무야",
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <Suspense fallback={<p>예약 확인 중…</p>}>
      <PublicReservation />
    </Suspense>
  );
}
