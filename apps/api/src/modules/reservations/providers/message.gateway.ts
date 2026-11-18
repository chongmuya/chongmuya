export type SendResult = {
  status: "ACCEPTED" | "DELIVERED" | "FAILED" | "UNKNOWN";
  failureStage?: "SUBMISSION" | "DELIVERY";
  messageId?: string;
  groupId?: string;
  errorCode?: string;
  provider: "fake" | "solapi";
};
export type MessageReport = SendResult & {
  messageId: string;
  statusCode: string;
  deliveryId?: string;
  deliveryAttempt?: number;
};
export type MessageLookup = {
  messageId?: string | null;
  groupId?: string | null;
  to: string;
  startedAt: Date;
  deliveryId: string;
};
export abstract class MessageGateway {
  abstract readonly requiresRealRecipient: boolean;
  abstract send(
    deliveryId: string,
    to: string,
    text: string,
    attempt?: number,
  ): Promise<SendResult>;
  abstract lookup(input: MessageLookup): Promise<MessageReport[]>;
}
