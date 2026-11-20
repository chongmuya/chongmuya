import { Injectable } from "@nestjs/common";
import {
  MessageGateway,
  type SendResult,
  type MessageReport,
} from "./message.gateway.js";

import { invalidMessage, textMessageFormat } from "../lib/reservation-sms.js";

@Injectable()
export class FakeMessageGateway extends MessageGateway {
  readonly requiresRealRecipient = false;
  async send(
    deliveryId: string,
    _to: string,
    text: string,
  ): Promise<SendResult> {
    const format = textMessageFormat(text);
    if (!format) return invalidMessage("fake");
    return {
      status: "ACCEPTED",
      channel: format.channel,
      messageId: `fake-${deliveryId}`,
      groupId: `fake-group-${deliveryId}`,
      provider: "fake",
    };
  }
  async lookup(): Promise<MessageReport[]> {
    return [];
  }
}
