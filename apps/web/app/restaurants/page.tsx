import { Suspense } from "react";
import { ReservationExplorer } from "@/features/reservations/client";
import { LoadingState } from "@/shared/ui/states";

export default function RestaurantsPage() {
  return (
    <Suspense fallback={<LoadingState>매장 찾기 준비 중…</LoadingState>}>
      <ReservationExplorer />
    </Suspense>
  );
}
