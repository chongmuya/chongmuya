import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import {
  MessageGateway,
  type MessageReport,
} from "./providers/message.gateway.js";
import { newMessageDelivery } from "./lib/message-delivery.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MessageDelivery } from "./entities/message-delivery.entity.js";
import {
  MessageDeliveryReport,
  ReservationOperation,
} from "./entities/merchant-reply.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { MerchantReplyLink } from "./entities/merchant-reply-link.entity.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import type { DeliveryState } from "./types/merchant-reply.js";

@Injectable()
export class MessageDeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly provider: MessageGateway,
    private readonly links: MerchantLinksService,
    private readonly restaurants: RestaurantsService,
  ) {}
  async prepare(
    request: ReservationRequest,
    targets: RequestTarget[],
    m: EntityManager,
  ) {
    for (const target of targets) {
      const link = await this.links.create(target, request, m);
      await m.save(
        MessageDelivery,
        newMessageDelivery(request, target, link, "NEW_INQUIRY"),
      );
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
      const target = await m.findOneBy(MessageDelivery, { id });
      if (!target) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      await this.lockDeliveryTarget(target.targetId, m);
      await this.links.context(target.targetId, m, true);
      const row = await m.findOne(MessageDelivery, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!row) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
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
      const reasons = await this.links.reasons(
        c.target,
        c.request,
        c.link,
        m,
        this.provider.requiresRealRecipient,
      );
      if (c.target.candidateState !== "OPEN") reasons.unshift("INQUIRY_CLOSED");
      if (
        row.contactId !== c.link?.contactId ||
        row.phoneSnapshot !== c.link?.phoneSnapshot ||
        row.linkGeneration !== c.link?.generation
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
        text: `[총무야] ${v.restaurantName}\n${v.eventName} 예약 문의\n${new Date(v.startsAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} / ${v.expectedGuests}명 / ${({ HALL: "일반 홀", ROOM: "룸", FLOOR: "한 층 대관", WHOLE: "전체 대관", ANY: "공간 무관" } as Record<string, string>)[v.space] ?? "공간 문의"}\n가능·조건 변경·불가 답변: ${url}\n예약 확정 전 문의입니다. 링크를 공유하지 마세요.`,
      };
    });
    if (!claimed) return { dispatchAttempted: false };
    const result = await this.provider.send(
      claimed.row.id,
      claimed.row.phoneSnapshot,
      claimed.text,
      claimed.row.attempts,
    );
    // If this commit fails, PROCESSING later becomes UNKNOWN; never resend blindly.
    await db.transaction(async (m) => {
      await this.lockDeliveryTarget(claimed.row.targetId, m);
      await this.links.context(claimed.row.targetId, m, true);
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
        row.failureStage =
          result.status === "FAILED"
            ? (result.failureStage ?? "SUBMISSION")
            : null;
      }
      await this.persist(row, m);
    });
    return { dispatchAttempted: true };
  }
  private async applyReport(report: MessageReport, m: EntityManager) {
    const id = report.deliveryId;
    const existing = await m.findOne(MessageDelivery, {
      where: id ? { id } : { providerMessageId: report.messageId },
    });
    if (!existing) return;
    await this.lockDeliveryTarget(existing.targetId, m);
    await this.links.context(existing.targetId, m, true);
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
    if (report.deliveryAttempt && report.deliveryAttempt !== row.attempts)
      return;
    if (!report.deliveryAttempt && !row.providerMessageId && row.attempts > 1)
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
    row.provider = report.provider;
    const outcome = report;
    if (outcome.status === "DELIVERED") {
      row.status = "DELIVERED";
      row.failureStage = null;
      row.errorCode = null;
    } else if (row.status !== "DELIVERED" && outcome.status === "FAILED") {
      row.status = "FAILED";
      row.failureStage = outcome.failureStage ?? "DELIVERY";
      row.errorCode = outcome.errorCode ?? null;
    } else if (
      row.status !== "DELIVERED" &&
      row.status !== "FAILED" &&
      outcome.status === "ACCEPTED"
    ) {
      row.status = "ACCEPTED";
      row.failureStage = null;
      row.errorCode = null;
    }
    await this.persist(row, m);
  }
  async applyReports(reports: MessageReport[]) {
    const db = await this.database.connect();
    for (const report of reports)
      await db.transaction((m) => this.applyReport(report, m));
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
      await this.lockDeliveryTarget(targetId, m);
      const c = await this.links.context(targetId, m, true);
      const recipient = await this.restaurants.deliveryRecipient(
        c.target.restaurantId,
        contactId,
        m,
      );
      if (
        c.request.closedAt ||
        c.target.candidateState !== "OPEN" ||
        new Date(c.request.snapshot.startsAt).getTime() <= Date.now()
      )
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      const unresolved = await m.findOneBy(MessageDelivery, {
        targetId,
        status: In(["UNKNOWN", "PROCESSING"]),
      });
      if (unresolved) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      // A fresh contact record is required. Never rewrite the original inquiry or recipient history.
      const previous = await m.findOne(MessageDelivery, {
        where: { targetId, contactId },
        order: { linkGeneration: "DESC" },
      });
      if (previous) {
        if (
          c.link?.contactId !== contactId ||
          c.link.phoneSnapshot !== recipient.contactPhone
        )
          throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        return {
          targetId,
          deliveryId: previous.id,
          status: previous.status,
          dispatchAttempted: false,
          dryRun,
          existing: true,
        };
      }
      if (dryRun) return { targetId, contactId, dryRun };
      await m.update(
        MessageDelivery,
        { targetId, status: "PENDING" },
        {
          status: "CANCELLED",
          errorCode: "RECIPIENT_CHANGED",
          updatedAt: new Date(),
        },
      );
      const link = await this.links.create(
        c.target,
        c.request,
        m,
        (c.link?.generation ?? 0) + 1,
        recipient,
      );
      const row = await m.save(
        MessageDelivery,
        newMessageDelivery(c.request, c.target, link, "RECIPIENT_CHANGED"),
      );
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
      return {
        targetId,
        deliveryId: row.id,
        status: row.status,
        dispatchAttempted: false,
        dryRun: false,
      };
    });
  }
  private async lockDeliveryTarget(targetId: string, m: EntityManager) {
    await this.links.context(targetId, m, true);
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `merchant-delivery:${targetId}`,
    ]);
  }
  async regenerateLink(
    targetId: string,
    actor: string,
    reason: string,
    dryRun: boolean,
  ) {
    if (!actor.trim() || !reason.trim())
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    const prepared = await db.transaction(async (m) => {
      await this.lockDeliveryTarget(targetId, m);
      const c = await this.links.context(targetId, m, true);
      const [reasons] = await this.restaurants.deliveryEligibility(
        [this.links.recipient(c.target, c.link)],
        m,
      );
      if (
        reasons.length ||
        c.request.closedAt ||
        c.target.candidateState !== "OPEN" ||
        new Date(c.request.snapshot.startsAt).getTime() <= Date.now()
      )
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      // A queued/in-flight or uncertain delivery must be resolved, not bypassed with a new token.
      if (
        await m.existsBy(MessageDelivery, {
          targetId,
          status: In(["PENDING", "PROCESSING", "UNKNOWN"]),
        })
      )
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      const generation = (c.link?.generation ?? 0) + 1;
      if (dryRun)
        return { targetId, generation, dryRun: true, deliveryId: null };
      const link = await this.links.create(
        c.target,
        c.request,
        m,
        generation,
        this.links.recipient(c.target, c.link),
      );
      // Detect missing encryption configuration before committing invalidation of the old link.
      this.links.url(link);
      const row = await m.save(
        MessageDelivery,
        newMessageDelivery(c.request, c.target, link, "LINK_REGENERATED"),
      );
      await m.update(
        RequestTarget,
        { id: targetId },
        { deliveryStatus: "PENDING" },
      );
      await m.save(ReservationOperation, {
        id: randomUUID(),
        targetId,
        action: "LINK_REGENERATED",
        actor,
        reason,
        createdAt: new Date(),
      });
      return { targetId, generation, dryRun: false, deliveryId: row.id };
    });
    if (!prepared.deliveryId) return prepared;
    // Commit first, then await the existing dispatcher. No raw URL leaves this service.
    const dispatched = await this.dispatch(prepared.deliveryId);
    const row = await db
      .getRepository(MessageDelivery)
      .findOneByOrFail({ id: prepared.deliveryId });
    return {
      ...prepared,
      ...dispatched,
      status: row.status,
      failureStage: row.failureStage,
      errorCode: row.errorCode,
    };
  }
  async listForOperations(
    filter: { status?: DeliveryState; deliveryId?: string; page?: number } = {},
  ) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const rows = await m.getRepository(MessageDelivery).find({
        where: {
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.deliveryId ? { id: filter.deliveryId } : {}),
        },
        order: { createdAt: "DESC", id: "DESC" },
        take: 50,
        skip: filter.deliveryId ? 0 : ((filter.page ?? 1) - 1) * 50,
      });
      if (!rows.length) return [];
      const targetIds = rows.map((row) => row.targetId);
      const targets = await m.findBy(RequestTarget, { id: In(targetIds) });
      const requests = await m.findBy(ReservationRequest, {
        id: In(targets.map((target) => target.requestId)),
      });
      const links = await m.find(MerchantReplyLink, {
        where: { targetId: In(targetIds) },
        select: {
          targetId: true,
          generation: true,
          contactId: true,
          phoneSnapshot: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      const targetById = new Map(targets.map((target) => [target.id, target]));
      const requestById = new Map(
        requests.map((request) => [request.id, request]),
      );
      const linkByTarget = new Map(links.map((link) => [link.targetId, link]));
      const contexts = rows.map((row) => {
        const target = targetById.get(row.targetId)!;
        return {
          target,
          request: requestById.get(target.requestId)!,
          link: linkByTarget.get(target.id) ?? null,
        };
      });
      const eligibility = await this.restaurants.deliveryEligibility(
        contexts.map(({ target, link }) => this.links.recipient(target, link)),
        m,
        this.provider.requiresRealRecipient,
      );
      return rows.map((row, index) => {
        const c = contexts[index]!;
        const current =
          row.linkGeneration === c.link?.generation &&
          row.contactId === c.link?.contactId;
        const reasons = [
          ...eligibility[index]!,
          ...this.links.linkReasons(c.request, c.link),
        ];
        if (!current) reasons.push("SUPERSEDED");
        return {
          id: row.id,
          targetId: row.targetId,
          status: row.status,
          attempts: row.attempts,
          failureStage: row.failureStage,
          errorCode: row.errorCode,
          provider: row.provider,
          providerMessageId: row.providerMessageId,
          providerGroupId: row.providerGroupId,
          createdAt: row.createdAt,
          current,
          generation: row.linkGeneration,
          leaseExpired:
            row.status === "PROCESSING" &&
            !!row.leaseUntil &&
            row.leaseUntil.getTime() <= Date.now(),
          holdReasons: [...new Set(reasons)],
          // Explicit private exports retain both the original inquiry recipient and this delivery.
          request_id: c.request.id,
          event_id: c.request.eventId,
          target_id: c.target.id,
          received_at: c.request.createdAt,
          conditions: c.request.snapshot,
          organizer_name: c.request.currentContactName ?? c.request.contactName,
          organizer_phone: c.request.contactPhone,
          restaurant_id: c.target.restaurantId,
          restaurant_name: c.target.restaurantName,
          contact_id: row.contactId,
          recipient_phone: row.phoneSnapshot,
          original_contact_id: c.target.contactId,
          original_recipient_phone: c.target.contactPhone,
          original_consent_at: c.target.consentAt,
        };
      });
    });
  }
  async reconcile(id: string, actor: string, reason: string, dryRun = false) {
    if (!actor.trim() || !reason.trim())
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    const prepared = await db.transaction(async (m) => {
      const existing = await m.findOneByOrFail(MessageDelivery, { id });
      await this.lockDeliveryTarget(existing.targetId, m);
      await this.links.context(existing.targetId, m, true);
      const row = await m.findOneOrFail(MessageDelivery, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      const expired =
        row.status === "PROCESSING" &&
        !!row.leaseUntil &&
        row.leaseUntil.getTime() <= Date.now();
      if (expired && !dryRun) {
        row.status = "UNKNOWN";
        row.errorCode = "LEASE_EXPIRED";
        await this.persist(row, m);
        await m.save(ReservationOperation, {
          id: randomUUID(),
          targetId: row.targetId,
          action: "DELIVERY_LEASE_EXPIRED",
          actor,
          reason,
          createdAt: new Date(),
        });
      }
      return { row, leaseExpired: expired, leaseChanged: expired && !dryRun };
    });
    const { row } = prepared;
    const summary = (
      current: MessageDelivery,
      matches: number,
      queried: boolean,
    ) => ({
      deliveryId: id,
      status: current.status,
      failureStage: current.failureStage,
      errorCode: current.errorCode,
      leaseExpired: prepared.leaseExpired,
      leaseChanged: prepared.leaseChanged,
      matches,
      queryAttempted: queried,
      unresolved:
        current.status === "UNKNOWN" || current.status === "PROCESSING",
      dryRun,
    });
    // A live lease still belongs to its sender. Pending/held/cancelled rows have
    // no uncertain provider submission to recover. Dry-run never calls a provider.
    if (
      dryRun ||
      ["PROCESSING", "PENDING", "HELD", "CANCELLED"].includes(row.status)
    )
      return summary(row, 0, false);
    const reports = await this.provider.lookup({
      messageId: row.providerMessageId,
      groupId: row.providerGroupId,
      to: row.phoneSnapshot,
      startedAt: row.startedAt ?? row.createdAt,
      deliveryId: id,
    });
    return db.transaction(async (m) => {
      await this.lockDeliveryTarget(row.targetId, m);
      await this.links.context(row.targetId, m, true);
      const current = await m.findOneOrFail(MessageDelivery, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      // Do not apply a lookup for an earlier send attempt after an operator retry.
      if (current.attempts !== row.attempts)
        throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
      for (const report of reports) await this.applyReport(report, m);
      await m.save(ReservationOperation, {
        id: randomUUID(),
        targetId: row.targetId,
        action: "DELIVERY_RECONCILED",
        actor,
        reason,
        createdAt: new Date(),
      });
      return summary(
        await m.findOneByOrFail(MessageDelivery, { id }),
        reports.length,
        true,
      );
    });
  }
}
