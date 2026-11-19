"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { preferencesQuery, savePreferences } from "../api/notifications.api";
import type { Preferences } from "../types/notifications";
export function NotificationSettings({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const options = preferencesQuery(accountId, request),
    q = useQuery(options),
    cache = useQueryClient(),
    active = useActiveScreen();
  const mutation = useMutation({
    mutationFn: (p: Preferences) => savePreferences(request, p),
    onSuccess: (result) => {
      if (active.current) cache.setQueryData(options.queryKey, result);
    },
    onError: () => {
      if (active.current) void q.refetch();
    },
    retry: false,
  });
  const data = isAccessError(q.error) ? undefined : q.data;
  return (
    <section className="my-8 space-y-4">
      <h2 className="text-xl font-bold">알림함 수신 설정</h2>
      <p className="text-xs text-muted">
        새 알림함 소식에 적용돼요. 예약 운영 문자는 별도 계약에 따라 발송돼요.
      </p>
      {q.isError && <ErrorState retry={() => void q.refetch()} />}
      {mutation.isError && (
        <p role="alert">
          설정 저장을 확인하지 못했어요. 최신 설정을 확인하고 다시 선택해
          주세요.
        </p>
      )}
      {data
        ? (
            [
              ["reservation", "예약 진행"],
              ["settlement", "정산"],
              ["event", "행사 일정"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={data[key]}
                disabled={mutation.isPending}
                onChange={(e) =>
                  mutation.mutate({ ...data, [key]: e.target.checked })
                }
              />
              {label} 알림함
            </label>
          ))
        : !q.isError && <LoadingState>불러오는 중…</LoadingState>}
    </section>
  );
}
