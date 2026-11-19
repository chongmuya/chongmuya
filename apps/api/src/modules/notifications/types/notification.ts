export type NotificationInput = {
  eventKey: string;
  category?: "RESERVATION" | "SETTLEMENT" | "EVENT";
  kind:
    | "RESERVATION_UPDATED"
    | "REPLY_RECEIVED"
    | "STORE_SELECTED"
    | "CANDIDATE_CLOSED"
    | "PROPOSAL_EXPIRED"
    | "SCHEDULE_REMINDER"
    | "MEMBERS_ADDED"
    | "FILE_REGISTERED"
    | "SETTLEMENT_REQUIRED"
    | "SETTLEMENT_COMPLETED";
  eventId: string;
  requestId: string;
  reservationId?: string;
  targetId?: string;
  revision: number;
  accounts: {
    id: string;
    title: string;
    summary: string;
    destination: string;
  }[];
  messages: {
    recipientKey: string;
    phone: string;
    contactId?: string;
    text: string;
    isDemo: boolean;
  }[];
};
export type NotificationReport = {
  status: "ACCEPTED" | "DELIVERED" | "FAILED" | "UNKNOWN";
  provider: "fake" | "solapi";
  messageId?: string;
  groupId?: string;
  failureStage?: "SUBMISSION" | "DELIVERY";
  errorCode?: string;
  deliveryId?: string;
  deliveryAttempt?: number;
  statusCode?: string;
};
