export type AttendanceAnswer = "ATTENDING" | "ABSENT";
export type AttendanceState = "UNANSWERED" | AttendanceAnswer;
export type ReviewReason =
  "DUPLICATE_IDENTITY" | "AMBIGUOUS_NAME" | "NOT_LISTED";
export type ParticipantDto = {
  id: string;
  groupMemberId: string | null;
  name: string;
  phoneLast4: string | null;
  label: string | null;
  version: number;
};
export type AttendanceResponseDto = {
  selfAnswer: AttendanceAnswer | null;
  managerOverride: AttendanceState | null;
  finalState: AttendanceState;
  version: number;
  selfRespondedAt: string | null;
  overriddenAt: string | null;
};
export type AttendanceCounts = {
  attending: number;
  absent: number;
  unanswered: number;
  pending: number;
};
export type RoundDto = {
  id: string;
  eventId: string;
  title: string;
  position: number;
  shareId: string;
  closedAt: string | null;
  counts: AttendanceCounts;
};
export type ReviewDto = {
  id: string;
  name: string;
  phoneLast4: string;
  answer: AttendanceAnswer;
  reason: ReviewReason;
  status: "PENDING" | "LINKED" | "EXCLUDED";
  version: number;
  submittedAt: string;
  participantId: string | null;
  processedAt: string | null;
  resolution: "KEEP" | "APPLY" | "EXCLUDE" | null;
};
export type RoundDetailDto = RoundDto & {
  participants: (ParticipantDto & { response: AttendanceResponseDto })[];
  reviews: ReviewDto[];
};
export type PublicAttendanceInfo = {
  eventName: string;
  roundTitle: string;
  scheduledAt: string | null;
  closed: boolean;
};
export type PublicAttendanceAccess = {
  kind: "DIRECT" | "FIRST" | "REVIEW" | "MISMATCH";
  reason: ReviewReason | null;
  accessToken: string | null;
  response: AttendanceResponseDto | null;
};

export type ResolveReview = {
  expectedReviewVersion: number;
  action: "LINK" | "NEW" | "EXCLUDE";
  participantId?: string;
  expectedParticipantVersion?: number;
  expectedResponseVersion?: number;
  responseChoice?: "KEEP" | "APPLY";
};
