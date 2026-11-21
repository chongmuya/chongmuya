import Image from "next/image";
import type { ReactNode } from "react";

export function InquiryNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-sm bg-choice px-4 py-3 text-xs leading-[1.5] shadow-card">
      <Image
        src="/images/reservations/reply-notice.svg"
        alt=""
        width={19.5}
        height={19.5}
        className="size-[19.5px] shrink-0"
      />
      <div className="min-w-0 break-keep">{children}</div>
    </div>
  );
}
