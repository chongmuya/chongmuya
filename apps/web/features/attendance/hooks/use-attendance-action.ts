"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { eventKeys } from "@/features/events/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
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
    onSettled: async () => {
      if (!active.current) return;
      await Promise.all([
        cache.invalidateQueries({
          queryKey: attendanceKey(accountId, eventId),
        }),
        cache.invalidateQueries({
          queryKey: eventKeys.detail(accountId, eventId),
          exact: true,
        }),
      ]);
    },
  });
}
