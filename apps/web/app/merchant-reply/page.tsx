import { Suspense } from "react";
import { PublicMerchantReply } from "@/features/merchant-replies/client";
export const metadata = {
  title: "예약 문의 답변 | 총무야",
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <Suspense fallback={<p>문의 확인 중…</p>}>
      <PublicMerchantReply />
    </Suspense>
  );
}
