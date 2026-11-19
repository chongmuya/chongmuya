export type NotificationInput = {
  eventKey: string;
  kind:
    | "REPLY_RECEIVED"
    | "STORE_SELECTED"
    | "CANDIDATE_CLOSED"
    | "PROPOSAL_EXPIRED";
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
