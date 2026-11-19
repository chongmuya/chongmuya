"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
) {
  const cache = useQueryClient(),
    active = useActiveScreen();
  return useMutation({
    mutationKey: [...attendanceKey(accountId, eventId), "write"],
    mutationFn: (action: AttendanceAction) =>
      writeAttendance(request, eventId, action),
    retry: false,
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
          queryKey: roundsQuery(accountId, eventId, request).queryKey,
          exact: true,
        });
      } else {
        await cache.invalidateQueries({
          queryKey: attendanceKey(accountId, eventId),
        });
      }
    },
  });
}
