import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { ConfigService } from "../../../config/config.service.js";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
export type SendResult = {
  status: "ACCEPTED" | "DELIVERED" | "FAILED" | "UNKNOWN";
  failureStage?: "SUBMISSION" | "DELIVERY";
  messageId?: string;
  groupId?: string;
  errorCode?: string;
  provider: "fake" | "solapi";
};
const messageSchema = z.object({
  messageId: z.string().max(100),
  groupId: z.string().max(100).optional(),
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
  messageList: z.array(messageSchema).optional(),
});
export type ProviderReport = z.infer<typeof messageSchema>;
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
export class MessageProvider {
  constructor(private readonly config: ConfigService) {}
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
    if (e.messageProvider === "fake")
      return e.nodeEnv === "production"
        ? { status: "FAILED", errorCode: "CONFIGURATION", provider: "fake" }
        : {
            status: "ACCEPTED",
            messageId: `fake-${deliveryId}`,
            groupId: `fake-group-${deliveryId}`,
            provider: "fake",
          };
    if (!e.solapiApiKey || !e.solapiApiSecret || !e.solapiSenderNumber)
      return {
        status: "FAILED",
        errorCode: "CONFIGURATION",
        provider: "solapi",
      };
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
                type: "LMS",
                subject: "총무야 예약 문의",
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
      provider: "solapi",
    };
  }
  async lookup(input: {
    messageId?: string | null;
    groupId?: string | null;
    to: string;
    startedAt: Date;
    deliveryId: string;
  }): Promise<ProviderReport[]> {
    if (this.config.environment.messageProvider !== "solapi") return [];
    const found: ProviderReport[] = [];
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
          messageList: z.record(z.string(), messageSchema),
        })
        .safeParse(await response.json().catch(() => null));
      if (!parsed.success)
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      found.push(
        ...Object.values(parsed.data.messageList).filter(
          (r) =>
            r.customFields?.deliveryId === input.deliveryId ||
            r.messageId === input.messageId,
        ),
      );
      startKey = parsed.data.nextKey ?? undefined;
      if (!startKey) break;
    }
    return found;
  }
}
