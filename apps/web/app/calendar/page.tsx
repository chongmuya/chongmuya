import { Suspense } from "react";
import { CalendarScreen } from "@/features/calendar/client";
export default function Page() {
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}
