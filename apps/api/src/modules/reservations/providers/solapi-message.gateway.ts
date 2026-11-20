import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { ConfigService } from "../../../config/config.service.js";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import {
  MessageGateway,
  type SendResult,
  type MessageReport,
  type MessageLookup,
} from "./message.gateway.js";
import { invalidMessage, textMessageFormat } from "../lib/reservation-sms.js";

const reportedChannel = (type?: string | null) =>
  type === "SMS" || type === "LMS" ? type : undefined;

export const solapiMessageSchema = z.object({
  messageId: z.string().max(100),
  groupId: z.string().max(100).optional(),
  type: z.string().nullish(),
  statusCode: z.string().regex(/^\d{4}$/),
  customFields: z
    .object({
      deliveryId: z.uuid().optional(),
      deliveryAttempt: z.string().regex(/^\d+$/).optional(),
    })
    .optional(),
});
const sendSchema = z.object({
  failedMessageList: z.array(z.object({ statusCode: z.string().optional() })),
  groupInfo: z.object({ groupId: z.string().max(100) }),
  messageList: z.array(solapiMessageSchema).optional(),
});

// SOLAPI: 2000/3000 are in progress, 4000 is delivered; all other codes are failures.
// https://solapi.com/developers/api/msgstatus
export function solapiOutcome(code: string) {
  if (code === "4000") return { status: "DELIVERED" as const };
  if (code === "2000" || code === "3000")
    return { status: "ACCEPTED" as const };
  return {
    status: "FAILED" as const,
    failureStage:
      code.startsWith("1") || code.startsWith("2")
        ? ("SUBMISSION" as const)
        : ("DELIVERY" as const),
    errorCode: `PROVIDER_${code}`,
  };
}
@Injectable()
export class SolapiMessageGateway extends MessageGateway {
  readonly requiresRealRecipient = true;
  constructor(private readonly config: ConfigService) {
    super();
  }
  private headers() {
    const e = this.config.environment;
    if (!e.solapiApiKey || !e.solapiApiSecret)
      throw new DomainHttpException("MESSAGE_CONFIGURATION");
    const date = new Date().toISOString(),
      salt = randomBytes(16).toString("hex");
    const signature = createHmac("sha256", e.solapiApiSecret)
      .update(date + salt)
      .digest("hex");
    return {
      Authorization: `HMAC-SHA256 apiKey=${e.solapiApiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      "Content-Type": "application/json",
    };
  }
  async send(
    deliveryId: string,
    to: string,
    text: string,
    attempt = 1,
  ): Promise<SendResult> {
    const e = this.config.environment;
    if (!e.solapiApiKey || !e.solapiApiSecret || !e.solapiSenderNumber)
      return {
        status: "FAILED",
        errorCode: "CONFIGURATION",
        failureStage: "SUBMISSION",
        provider: "solapi",
      };
    if (!textMessageFormat(text)) return invalidMessage("solapi");
    let response: Response;
    try {
      // Exactly one direct API call: no SDK retry or group creation, even on 503/timeouts.
      response = await fetch(
        "https://api.solapi.com/messages/v4/send-many/detail",
        {
          method: "POST",
          headers: this.headers(),
          signal: AbortSignal.timeout(e.providerTimeoutMs),
          body: JSON.stringify({
            messages: [
              {
                to,
                from: e.solapiSenderNumber,
                text,
                customFields: { deliveryId, deliveryAttempt: String(attempt) },
              },
            ],
            showMessageList: true,
          }),
        },
      );
    } catch {
      return {
        status: "UNKNOWN",
        errorCode: "TRANSPORT_UNCERTAIN",
        provider: "solapi",
      };
    }
    if (!response.ok)
      return {
        status:
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408
            ? "FAILED"
            : "UNKNOWN",
        failureStage:
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408
            ? "SUBMISSION"
            : undefined,
        errorCode: [401, 403].includes(response.status)
          ? "CONFIGURATION"
          : `HTTP_${response.status}`,
        provider: "solapi",
      };
    const parsed = sendSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      return {
        status: "UNKNOWN",
        errorCode: "RESPONSE_UNCERTAIN",
        provider: "solapi",
      };
    const { failedMessageList, groupInfo, messageList } = parsed.data;
    if (failedMessageList.length)
      return {
        status: "FAILED",
        groupId: groupInfo.groupId,
        failureStage: "SUBMISSION",
        errorCode: /^\d{4}$/.test(failedMessageList[0].statusCode ?? "")
          ? `PROVIDER_${failedMessageList[0].statusCode}`
          : "PROVIDER_REJECTED",
        provider: "solapi",
      };
    const message =
      messageList?.find((m) => m.customFields?.deliveryId === deliveryId) ??
      (messageList?.length === 1 ? messageList[0] : undefined);
    return {
      ...(message
        ? solapiOutcome(message.statusCode)
        : { status: "ACCEPTED" as const }),
      groupId: groupInfo.groupId,
      messageId: message?.messageId,
      channel: reportedChannel(message?.type),
      provider: "solapi",
    };
  }
  async lookup(input: MessageLookup): Promise<MessageReport[]> {
    const found: MessageReport[] = [];
    let startKey: string | undefined;
    // Bounded read-only reconciliation. No customFields search filter is assumed.
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://api.solapi.com/messages/v4/list");
      if (input.messageId)
        url.searchParams.set("messageIds", JSON.stringify([input.messageId]));
      else if (input.groupId) url.searchParams.set("groupId", input.groupId);
      else {
        url.searchParams.set("to", input.to);
        url.searchParams.set(
          "startDate",
          new Date(input.startedAt.getTime() - 60_000).toISOString(),
        );
        url.searchParams.set(
          "endDate",
          new Date(input.startedAt.getTime() + 15 * 60_000).toISOString(),
        );
      }
      url.searchParams.set("limit", "500");
      if (startKey) url.searchParams.set("startKey", startKey);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: this.headers(),
          signal: AbortSignal.timeout(
            this.config.environment.providerTimeoutMs,
          ),
        });
      } catch {
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      }
      if (!response.ok) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      const parsed = z
        .object({
          nextKey: z.string().nullish(),
          messageList: z.record(z.string(), solapiMessageSchema),
        })
        .safeParse(await response.json().catch(() => null));
      if (!parsed.success)
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      found.push(
        ...Object.values(parsed.data.messageList)
          .filter(
            (r) =>
              r.customFields?.deliveryId === input.deliveryId ||
              r.messageId === input.messageId,
          )
          .map(normalizeSolapiReport),
      );
      startKey = parsed.data.nextKey ?? undefined;
      if (!startKey) break;
    }
    return found;
  }
}

export function normalizeSolapiReport(
  row: z.infer<typeof solapiMessageSchema>,
): MessageReport {
  return {
    ...solapiOutcome(row.statusCode),
    provider: "solapi",
    messageId: row.messageId,
    channel: reportedChannel(row.type),
    groupId: row.groupId,
    statusCode: row.statusCode,
    deliveryId: row.customFields?.deliveryId,
    deliveryAttempt:
      row.customFields?.deliveryAttempt === undefined
        ? undefined
        : Number(row.customFields.deliveryAttempt),
  };
}
