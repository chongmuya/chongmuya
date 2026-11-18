import { normalizePersonName } from "../../../common/validation/person-name.js";
import type { EventParticipant } from "../entities/event-participant.entity.js";
import type { AttendanceResponse } from "../entities/attendance-response.entity.js";
import type {
  AttendanceResponseDto,
  ParticipantDto,
} from "../dto/response/attendance.response.dto.js";
import type { ReviewReason } from "../types/attendance.js";

export const participantDto = (p: EventParticipant): ParticipantDto => ({
  id: p.id,
  groupMemberId: p.groupMemberId,
  name: p.name,
  phoneLast4: p.phoneLast4,
  label: p.label,
  version: p.version,
});
export const responseDto = (
  r: AttendanceResponse | null | undefined,
): AttendanceResponseDto => ({
  selfAnswer: r?.selfAnswer ?? null,
  managerOverride: r?.managerOverride ?? null,
  finalState: r?.managerOverride ?? r?.selfAnswer ?? "UNANSWERED",
  version: r?.version ?? 0,
  selfRespondedAt: r?.selfRespondedAt?.toISOString() ?? null,
  overriddenAt: r?.overriddenAt?.toISOString() ?? null,
});
export type IdentityDecision =
  | { kind: "DIRECT" | "FIRST"; participant: EventParticipant }
  | { kind: "REVIEW"; reason: ReviewReason }
  | { kind: "MISMATCH" };
export function identifyAttendance(
  participants: EventParticipant[],
  groupMembers: { id: string; name: string }[],
  name: string,
  phoneLast4: string,
): IdentityDecision {
  const named = participants.filter(
    (p) => normalizePersonName(p.name) === name,
  );
  const exact = named.filter((p) => p.phoneLast4 === phoneLast4);
  if (exact.length === 1) return { kind: "DIRECT", participant: exact[0]! };
  if (exact.length > 1) return { kind: "REVIEW", reason: "DUPLICATE_IDENTITY" };
  if (!named.length) return { kind: "REVIEW", reason: "NOT_LISTED" };
  // A participant and their source group member count as one person.
  const otherGroupMember = groupMembers.some(
    (m) =>
      normalizePersonName(m.name) === name && m.id !== named[0]?.groupMemberId,
  );
  if (named.length > 1 || otherGroupMember)
    return { kind: "REVIEW", reason: "AMBIGUOUS_NAME" };
  return named[0]!.phoneLast4 === null
    ? { kind: "FIRST", participant: named[0]! }
    : { kind: "MISMATCH" };
}
