import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { requestJson } from "@/shared/http/request";
import type {
  ParticipantDto,
  RoundDto,
  RoundDetailDto,
  PublicAttendanceInfo,
  PublicAttendanceAccess,
  AttendanceAnswer,
  ResolveReview,
  AttendanceResponseDto,
} from "../types/attendance.types";
export const attendanceKey = (accountId: string, eventId: string) =>
  ["user", accountId, "attendance", eventId] as const;
const path = (eventId: string) => `/api/v1/events/${eventId}` as const;
const rosterScope = (roundId?: string) =>
  roundId ? `?roundId=${encodeURIComponent(roundId)}` : "";
export const participantsQuery = (
  accountId: string,
  eventId: string,
  request: SessionRequest,
  roundId?: string,
) =>
  queryOptions({
    queryKey: [
      ...attendanceKey(accountId, eventId),
      "participants",
      ...(roundId ? [roundId] : []),
    ],
    queryFn: ({ signal }) =>
      request<ParticipantDto[]>(
        `${path(eventId)}/participants${rosterScope(roundId)}`,
        { signal },
      ),
    staleTime: 0,
    retry: false,
  });
export const roundsQuery = (
  accountId: string,
  eventId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: [...attendanceKey(accountId, eventId), "rounds"],
    queryFn: ({ signal }) =>
      request<{ rounds: RoundDto[]; nextTitle: string }>(
        `${path(eventId)}/attendance-rounds`,
        { signal },
      ),
    staleTime: 0,
    retry: false,
    refetchInterval: 5000,
  });
export const roundQuery = (
  accountId: string,
  eventId: string,
  roundId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: [...attendanceKey(accountId, eventId), "round", roundId],
    queryFn: ({ signal }) =>
      request<RoundDetailDto>(`${path(eventId)}/attendance-rounds/${roundId}`, {
        signal,
      }),
    staleTime: 0,
    retry: false,
    refetchInterval: 5000,
  });
type PersonInput = {
  name: string;
  phoneLast4: string | null;
  label: string | null;
};
export type AttendanceAction =
  | {
      kind: "add";
      requestKey: string;
      members: (PersonInput & {
        existingParticipantId?: string;
        newPersonConfirmed?: boolean;
      })[];
      expectedRoster?: { id: string; version: number }[];
      duplicatesConfirmed?: boolean;
    }
  | { kind: "import" }
  | {
      kind: "import-selected";
      requestKey: string;
      members: { id: string; version: number }[];
      directMembers?: (PersonInput & {
        existingParticipantId?: string;
        newPersonConfirmed?: boolean;
      })[];
      expectedRoster?: { id: string; version: number }[];
      duplicatesConfirmed?: boolean;
    }
  | {
      kind: "edit";
      participantId: string;
      expectedVersion: number;
      person: PersonInput;
    }
  | { kind: "remove"; participantId: string; expectedVersion: number }
  | { kind: "create"; requestKey: string; title: string }
  | { kind: "close"; roundId: string }
  | {
      kind: "override";
      roundId: string;
      participantId: string;
      expectedVersion: number;
      managerOverride: AttendanceAnswer | null;
    }
  | {
      kind: "resolve";
      roundId: string;
      reviewId: string;
      input: ResolveReview;
    };
export async function writeAttendance(
  request: SessionRequest,
  eventId: string,
  action: AttendanceAction,
  roundId?: string,
) {
  const base = path(eventId);
  const scope = rosterScope(roundId);
  switch (action.kind) {
    case "remove":
      return request<void>(
        `${base}/participants/${action.participantId}${scope}`,
        {
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: action.expectedVersion }),
        },
      );
    case "add":
      return request<{ addedCount: number }>(`${base}/participants${scope}`, {
        method: "POST",
        body: JSON.stringify({
          requestKey: action.requestKey,
          members: action.members,
          expectedRoster: action.expectedRoster,
          duplicatesConfirmed: action.duplicatesConfirmed,
        }),
      });
    case "import":
      return request<{ addedCount: number }>(
        `${base}/participants/import-group${scope}`,
        { method: "POST" },
      );
    case "import-selected":
      return request<{ addedCount: number }>(
        `${base}/participants/import-group/selected${scope}`,
        {
          method: "POST",
          body: JSON.stringify({
            requestKey: action.requestKey,
            members: action.members,
            directMembers: action.directMembers,
            expectedRoster: action.expectedRoster,
            duplicatesConfirmed: action.duplicatesConfirmed,
          }),
        },
      );
    case "edit":
      return request<ParticipantDto>(
        `${base}/participants/${action.participantId}${scope}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...action.person,
            expectedVersion: action.expectedVersion,
          }),
        },
      );
    case "create":
      return request<RoundDetailDto>(`${base}/attendance-rounds`, {
        method: "POST",
        body: JSON.stringify({
          title: action.title,
          requestKey: action.requestKey,
        }),
      });
    case "close":
      return request<RoundDetailDto>(
        `${base}/attendance-rounds/${action.roundId}/close`,
        { method: "POST" },
      );
    case "override":
      return request<RoundDetailDto>(
        `${base}/attendance-rounds/${action.roundId}/responses/${action.participantId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedVersion: action.expectedVersion,
            managerOverride: action.managerOverride,
          }),
        },
      );
    case "resolve":
      return request<RoundDetailDto>(
        `${base}/attendance-rounds/${action.roundId}/reviews/${action.reviewId}/resolve`,
        { method: "POST", body: JSON.stringify(action.input) },
      );
  }
}
export const validShareId = (shareId: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    shareId,
  );
export const publicAttendanceQuery = (shareId: string) =>
  queryOptions({
    enabled: validShareId(shareId),
    queryKey: ["public-attendance", shareId],
    queryFn: ({ signal }) =>
      requestJson<PublicAttendanceInfo>(`/api/v1/attendance/${shareId}`, {
        signal,
      }),
    staleTime: 0,
    retry: false,
  });
export const openAttendance = (
  shareId: string,
  input: { name: string; phoneLast4: string },
  signal: AbortSignal,
) =>
  requestJson<PublicAttendanceAccess>(`/api/v1/attendance/${shareId}/open`, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
export const saveAttendance = (
  shareId: string,
  accessToken: string,
  answer: AttendanceAnswer,
  signal: AbortSignal,
) =>
  requestJson<{
    kind: "SAVED" | "REVIEW";
    response: AttendanceResponseDto | null;
    accessToken: string;
  }>(`/api/v1/attendance/${shareId}/response`, {
    method: "POST",
    body: JSON.stringify({ accessToken, answer }),
    signal,
  });
