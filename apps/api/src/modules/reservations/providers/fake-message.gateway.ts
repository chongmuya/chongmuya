import { Injectable } from "@nestjs/common";
import {
  MessageGateway,
  type SendResult,
  type MessageReport,
} from "./message.gateway.js";

@Injectable()
export class FakeMessageGateway extends MessageGateway {
  readonly requiresRealRecipient = false;
  async send(deliveryId: string): Promise<SendResult> {
    return {
      status: "ACCEPTED",
      messageId: `fake-${deliveryId}`,
      groupId: `fake-group-${deliveryId}`,
      provider: "fake",
    };
  }
  async lookup(): Promise<MessageReport[]> {
    return [];
  }
}
