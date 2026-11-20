"use client";
import Image from "next/image";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { useNotificationSettings } from "../hooks/use-notification-settings";
export function NotificationSettings({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const { q, mutation } = useNotificationSettings(accountId, request);
  const data = isAccessError(q.error) ? undefined : q.data;
  return (
    <section
      className="my-10"
      aria-describedby="notification-preferences-scope"
    >
      <h2 className="mb-4 text-label">알림함 설정</h2>
      <p id="notification-preferences-scope" className="sr-only">
        새 알림에 적용돼요. 예약 안내 문자는 이 설정과 관계없이 발송돼요.
      </p>
      {q.isError && <ErrorState retry={() => void q.refetch()} />}
      {mutation.isError && (
        <p role="alert">
          설정 저장을 확인하지 못했어요. 최신 설정을 확인하고 다시 선택해
          주세요.
        </p>
      )}
      <div className="py-0.5">
        {data
          ? (
              [
                ["reservation", "예약 진행"],
                ["settlement", "정산"],
                ["event", "행사 일정"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-9 cursor-pointer items-center gap-3 text-base"
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={data[key]}
                  disabled={mutation.isPending}
                  onChange={(e) =>
                    mutation.mutate({ ...data, [key]: e.target.checked })
                  }
                />
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-placeholder peer-focus-visible:focus-outline"
                >
                  {data[key] && (
                    <Image
                      src="/images/home/checked.svg"
                      alt=""
                      width={24}
                      height={24}
                    />
                  )}
                </span>
                {label} 알림
              </label>
            ))
          : !q.isError && <LoadingState>불러오는 중…</LoadingState>}
      </div>
    </section>
  );
}
