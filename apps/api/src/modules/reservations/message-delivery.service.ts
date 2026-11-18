import { Injectable } from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { MessageProvider } from "./providers/message.provider.js";
import type { ProviderReport } from "./providers/message.provider.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MessageDelivery } from "./entities/message-delivery.entity.js";
import {
  MessageDeliveryReport,
  ReservationOperation,
} from "./entities/merchant-reply.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import type { ReservationRequest } from "./entities/reservation-request.entity.js";

const reportSchema = z
  .array(
    z.object({
      messageId: z.string().min(1).max(100),
      groupId: z.string().max(100).optional(),
      statusCode: z.string().regex(/^\d{4}$/),
      customFields: z
        .object({
          deliveryId: z.uuid().optional(),
          deliveryAttempt: z.string().regex(/^\d+$/).optional(),
        })
        .optional(),
    }),
  )
  .max(1000);
export function validSolapiSignature(
  header: string | undefined,
  raw: Buffer | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!header || !raw || !secret) return false;
  const match = /^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(
    header.replace(/,\s+/g, ","),
  );
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const key = createHash("sha1").update(secret).digest("hex");
  const expected = createHmac("sha256", key)
    .update(`${match[1]}.`)
    .update(raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}
@Injectable()
export class MessageDeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly provider: MessageProvider,
    private readonly links: MerchantLinksService,
    private readonly restaurants: RestaurantsService,
  ) {}
  async prepare(
    request: ReservationRequest,
    targets: RequestTarget[],
    m: EntityManager,
  ) {
    for (const target of targets) {
      await this.links.create(target, request, m);
      await m.save(MessageDelivery, {
        id: randomUUID(),
        targetId: target.id,
        purpose: "NEW_INQUIRY",
        channel: "LMS",
        contactId: target.contactId,
        phoneSnapshot: target.contactPhone,
        linkGeneration: 1,
        templateVersion: 1,
        variables: {
          restaurantName: target.restaurantName,
          eventName: request.snapshot.eventName,
          startsAt: request.snapshot.startsAt,
          expectedGuests: request.snapshot.expectedGuests,
          space: request.snapshot.space,
        },
        status: "PENDING",
        attempts: 0,
        startedAt: null,
        leaseUntil: null,
        providerMessageId: null,
        providerGroupId: null,
        provider: null,
        failureStage: null,
        errorCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  private async persist(row: MessageDelivery, m: EntityManager) {
    row.updatedAt = new Date();
    await m.save(row);
    // Late results for a superseded recipient remain history, not the current target state.
    await m
      .createQueryBuilder()
      .update(RequestTarget)
      .set({ deliveryStatus: row.status })
      .where("id = :targetId", { targetId: row.targetId })
      .andWhere(
        "EXISTS (SELECT 1 FROM merchant_reply_links l WHERE l.target_id = :targetId AND l.contact_id = :contactId AND l.generation = :generation)",
        {
          contactId: row.contactId,
          generation: row.linkGeneration,
        },
      )
      .execute();
  }
  async dispatchRequest(requestId: string) {
    const db = await this.database.connect();
    const targets = await db.getRepository(RequestTarget).findBy({ requestId });
    const deliveries = targets.length
      ? await db
          .getRepository(MessageDelivery)
          .findBy({ targetId: In(targets.map((t) => t.id)) })
      : [];
    // DIRECT is capped at three targets. Every result is awaited independently.
    await Promise.allSettled(deliveries.map((d) => this.dispatch(d.id)));
  }
  async dispatch(id: string, retry?: { actor: string; reason: string }) {
    const db = await this.database.connect();
    const claimed = await db.transaction(async (m) => {
      const row = await m.findOne(MessageDelivery, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!row) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      if (
        row.status === "PROCESSING" &&
        row.leaseUntil &&
        row.leaseUntil.getTime() <= Date.now()
      ) {
        row.status = "UNKNOWN";
        row.errorCode = "LEASE_EXPIRED";
        await this.persist(row, m);
        return null;
      }
      const retryable =
        row.status === "PENDING" ||
        (!!retry &&
          row.status === "FAILED" &&
          row.failureStage === "SUBMISSION");
      if (!retryable) {
        if (retry) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        return null;
      }
      const c = await this.links.context(row.targetId, m);
      const reasons = await this.links.reasons(c.target, c.request, c.link, m);
      if (
        row.contactId !== c.link?.contactId ||
        row.phoneSnapshot !== c.link?.phoneSnapshot
      )
        reasons.push("SNAPSHOT_CHANGED");
      if (reasons.length) {
        row.status =
          reasons.includes("INQUIRY_CLOSED") || reasons.includes("LINK_INVALID")
            ? "CANCELLED"
            : "HELD";
        row.errorCode = reasons[0];
        await this.persist(row, m);
        return null;
      }
      let url: string;
      try {
        url = this.links.url(c.link!);
      } catch (error) {
        if (!(error instanceof DomainHttpException)) throw error;
        row.status = "FAILED";
        row.failureStage = "SUBMISSION";
        row.errorCode = "CONFIGURATION";
        await this.persist(row, m);
        return null;
      }
      row.status = "PROCESSING";
      row.linkGeneration = c.link!.generation;
      row.providerMessageId = null;
      row.providerGroupId = null;
      row.attempts++;
      row.startedAt = new Date();
      row.leaseUntil = new Date(
        Date.now() + this.config.environment.providerTimeoutMs + 30_000,
      );
      row.errorCode = null;
      row.failureStage = null;
      await this.persist(row, m);
      if (retry)
        await m.save(ReservationOperation, {
          id: randomUUID(),
          targetId: row.targetId,
          action: "DELIVERY_RETRIED",
          actor: retry.actor,
          reason: retry.reason,
          createdAt: new Date(),
        });
      const v = row.variables;
      return {
        row,
        text: `[총무야] ${v.restaurantName}\n${v.eventName} 예약 문의\n${new Date(v.startsAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} / ${v.expectedGuests}명 / ${v.space}\n가능·조건 변경·불가 답변: ${url}\n예약 확정 전 문의입니다. 링크를 공유하지 마세요.`,
      };
    });
    if (!claimed) return;
    const result = await this.provider.send(
      claimed.row.id,
      claimed.row.phoneSnapshot,
      claimed.text,
      claimed.row.attempts,
    );
    // If this commit fails, PROCESSING later becomes UNKNOWN; never resend blindly.
    await db.transaction(async (m) => {
      const row = await m.findOneOrFail(MessageDelivery, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      row.provider = result.provider;
      row.providerMessageId ??= result.messageId ?? null;
      row.providerGroupId ??= result.groupId ?? null;
      // A report may arrive before this API result. Terminal delivery evidence wins.
      if (row.status === "PROCESSING" || row.status === "UNKNOWN") {
        row.status = result.status;
        row.errorCode = result.errorCode ?? null;
        row.failureStage = result.status === "FAILED" ? "SUBMISSION" : null;
      }
      await this.persist(row, m);
    });
  }
  private async applyReport(report: ProviderReport, m: EntityManager) {
    const id = report.customFields?.deliveryId;
    const row = await m.findOne(MessageDelivery, {
      where: id ? { id } : { providerMessageId: report.messageId },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !row ||
      row.provider === "fake" ||
      (row.providerMessageId && row.providerMessageId !== report.messageId) ||
      (row.providerGroupId &&
        report.groupId &&
        row.providerGroupId !== report.groupId)
    )
      return;
    if (
      report.customFields?.deliveryAttempt &&
      Number(report.customFields.deliveryAttempt) !== row.attempts
    )
      return;
    if (
      !report.customFields?.deliveryAttempt &&
      !row.providerMessageId &&
      row.attempts > 1
    )
      return;
    const digest = createHash("sha256")
      .update(JSON.stringify([row.id, report.messageId, report.statusCode]))
      .digest("hex");
    await m
      .createQueryBuilder()
      .insert()
      .into(MessageDeliveryReport)
      .values({
        digest,
        deliveryId: row.id,
        messageId: report.messageId,
        statusCode: report.statusCode,
        receivedAt: new Date(),
      })
      .orIgnore()
      .execute();
    row.providerMessageId = report.messageId;
    row.providerGroupId ??= report.groupId ?? null;
    row.provider = "solapi";
    if (report.statusCode === "4000") {
      row.status = "DELIVERED";
      row.failureStage = null;
      row.errorCode = null;
    } else if (
      row.status !== "DELIVERED" &&
      Number(report.statusCode) >= 4000
    ) {
      row.status = "FAILED";
      row.failureStage = "DELIVERY";
      row.errorCode = `PROVIDER_${report.statusCode}`;
    } else if (
      row.status !== "DELIVERED" &&
      !(row.status === "FAILED" && row.failureStage === "DELIVERY") &&
      ["2000", "3000"].includes(report.statusCode)
    ) {
      row.status = "ACCEPTED";
      row.failureStage = null;
      row.errorCode = null;
    }
    await this.persist(row, m);
  }
  async webhook(
    header: string | undefined,
    raw: Buffer | undefined,
    body: unknown,
  ) {
    if (
      !validSolapiSignature(
        header,
        raw,
        this.config.environment.solapiWebhookSecret,
      )
    )
      throw new DomainHttpException("MERCHANT_LINK_INVALID");
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    // Stable order prevents two overlapping report arrays from deadlocking.
    await db.transaction(async (m) => {
      for (const event of parsed.data.sort((a, b) =>
        (a.customFields?.deliveryId ?? a.messageId).localeCompare(
          b.customFields?.deliveryId ?? b.messageId,
        ),
      ))
        await this.applyReport(event, m);
    });
    return { received: true };
  }
  async changeRecipient(
    targetId: string,
    contactId: string,
    actor: string,
    reason: string,
    dryRun: boolean,
  ) {
    if (!actor.trim() || !reason.trim())
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const c = await this.links.context(targetId, m, true);
      const recipient = await this.restaurants.deliveryRecipient(
        c.target.restaurantId,
        contactId,
        m,
      );
      if (
        c.request.closedAt ||
        new Date(c.request.snapshot.startsAt).getTime() <= Date.now()
      )
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      // A fresh contact record is required. Never rewrite the original inquiry or recipient history.
      const previous = await m.findOneBy(MessageDelivery, {
        targetId,
        contactId,
      });
      if (previous) {
        if (
          c.link?.contactId !== contactId ||
          c.link.phoneSnapshot !== recipient.contactPhone
        )
          throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        return { targetId, deliveryId: previous.id, dryRun, existing: true };
      }
      if (dryRun) return { targetId, contactId, dryRun };
      const link = await this.links.create(
        c.target,
        c.request,
        m,
        (c.link?.generation ?? 0) + 1,
        recipient,
      );
      const snapshot = c.request.snapshot;
      const row = await m.save(MessageDelivery, {
        id: randomUUID(),
        targetId,
        purpose: "RECIPIENT_CHANGED",
        channel: "LMS",
        contactId,
        phoneSnapshot: recipient.contactPhone,
        linkGeneration: link.generation,
        templateVersion: 1,
        variables: {
          restaurantName: c.target.restaurantName,
          eventName: snapshot.eventName,
          startsAt: snapshot.startsAt,
          expectedGuests: snapshot.expectedGuests,
          space: snapshot.space,
        },
        status: "PENDING",
        attempts: 0,
        startedAt: null,
        leaseUntil: null,
        providerMessageId: null,
        providerGroupId: null,
        provider: null,
        failureStage: null,
        errorCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await m.update(
        RequestTarget,
        { id: targetId },
        { deliveryStatus: "PENDING" },
      );
      await m.save(ReservationOperation, {
        id: randomUUID(),
        targetId,
        action: "RECIPIENT_CHANGED",
        actor,
        reason,
        createdAt: new Date(),
      });
      return { targetId, deliveryId: row.id, dryRun: false };
    });
  }
  async listForOperations() {
    const db = await this.database.connect();
    await db.transaction(async (m) => {
      const rows = await m
        .createQueryBuilder(MessageDelivery, "d")
        .where("d.status = 'PROCESSING' AND d.lease_until <= now()")
        .setLock("pessimistic_write")
        .getMany();
      for (const row of rows) {
        row.status = "UNKNOWN";
        row.errorCode = "LEASE_EXPIRED";
        await this.persist(row, m);
      }
    });
    const rows = await db
      .getRepository(MessageDelivery)
      .find({ order: { createdAt: "ASC" } });
    return rows.map(
      ({
        id,
        targetId,
        status,
        attempts,
        failureStage,
        errorCode,
        provider,
        providerMessageId,
        providerGroupId,
        createdAt,
      }) => ({
        id,
        targetId,
        status,
        attempts,
        failureStage,
        errorCode,
        provider,
        providerMessageId,
        providerGroupId,
        createdAt,
      }),
    );
  }
  async reconcile(id: string, actor: string, reason: string) {
    const db = await this.database.connect();
    const row = await db.getRepository(MessageDelivery).findOneByOrFail({ id });
    const reports = await this.provider.lookup({
      messageId: row.providerMessageId,
      groupId: row.providerGroupId,
      to: row.phoneSnapshot,
      startedAt: row.startedAt ?? row.createdAt,
      deliveryId: id,
    });
    await db.transaction(async (m) => {
      for (const report of reports) await this.applyReport(report, m);
      await m.save(ReservationOperation, {
        id: randomUUID(),
        targetId: row.targetId,
        action: "DELIVERY_RECONCILED",
        actor,
        reason,
        createdAt: new Date(),
      });
    });
    return {
      deliveryId: id,
      matches: reports.length,
      unresolved: !reports.length,
    };
  }
}
