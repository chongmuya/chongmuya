export type EventSummary = {
  eventId: string;
  finalizedAt: string | null;
  participantCount: number;
  roundCount: number;
  attendingCount: number;
  hasAttendanceRecords: boolean;
  attendanceComplete: boolean;
  expectedGuests: number | null;
  region: string | null;
  inquiry: {
    requestId: string;
    state: "AWAITING_REPLY" | "REPLIES_RECEIVED" | "CLOSED";
  } | null;
  reservation: {
    reservationId: string;
    status: "PREPARING" | "CONFIRMED" | "CHECK_REQUIRED" | "CANCELLED";
    progress:
      | "REFUND_REVIEW"
      | "REFUND_PENDING"
      | "CANCELLED"
      | "CONFIRMED"
      | "CHECK_REQUIRED"
      | "GUIDANCE_PENDING"
      | "MENU_REQUIRED"
      | "GUIDANCE_REVIEW"
      | "PAYMENT_CHECKING";
    restaurantName: string | null;
    refundedAmount?: number;
    startsAt: string;
  } | null;
  settlement: {
    status: "EMPTY" | "IN_PROGRESS" | "COMPLETE";
    needsReview?: boolean;
    total: number;
    target: number;
    confirmed: number;
    unconfirmed: number;
    drafts: number;
    differences: number;
  };
};
