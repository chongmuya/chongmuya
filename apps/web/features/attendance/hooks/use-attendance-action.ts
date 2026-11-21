"use client";
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  roundQuery,
  roundsQuery,
  attendanceKey,
  writeAttendance,
  type AttendanceAction,
} from "../api/attendance.api";
export function useAttendanceAction(
  accountId: string,
  eventId: string,
  request: SessionRequest,
  roundId?: string,
) {
  const cache = useQueryClient(),
    active = useActiveScreen();
  return useMutation({
    mutationKey: [
      ...attendanceKey(accountId, eventId),
      "write",
      roundId ?? null,
    ],
    mutationFn: (action: AttendanceAction) =>
      writeAttendance(request, eventId, action, roundId),
    retry: false,
    networkMode: "always",
    onSettled: async (data) => {
      if (!active.current) return;
      if (data && "participants" in data) {
        const detail = roundQuery(
          accountId,
          eventId,
          data.id,
          request,
        ).queryKey;
        await cache.cancelQueries({ queryKey: detail, exact: true });
        if (!active.current) return;
        cache.setQueryData(detail, data);
        await cache.invalidateQueries({
          refetchType: onlineManager.isOnline() ? "active" : "none",
          queryKey: roundsQuery(accountId, eventId, request).queryKey,
          exact: true,
        });
      } else {
        await cache.invalidateQueries({
          refetchType: onlineManager.isOnline() ? "active" : "none",
          queryKey: attendanceKey(accountId, eventId),
        });
      }
      if (!active.current) return;
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["user", accountId, "events", "summaries"],
          refetchType: onlineManager.isOnline() ? "active" : "none",
        }),
        cache.invalidateQueries({
          queryKey: ["user", accountId, "groups"],
          refetchType: onlineManager.isOnline() ? "active" : "none",
        }),
      ]);
    },
  });
}
