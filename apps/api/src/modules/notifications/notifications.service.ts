import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import {
  NotificationFact,
  Notification,
  NotificationMessage,
} from "./entities/notification.entity.js";
import type {
  NotificationInput,
  NotificationReport,
} from "./types/notification.js";
@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}
  async record(m: EntityManager, input: NotificationInput) {
    const { accounts, messages, ...fact } = input;
    await m
      .createQueryBuilder()
      .insert()
      .into(NotificationFact)
      .values({ ...fact, occurredAt: new Date() })
      .orIgnore()
      .execute();
    if (accounts.length)
      await m
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(
          accounts.map((a) => ({
            id: randomUUID(),
            eventKey: input.eventKey,
            accountId: a.id,
            title: a.title,
            summary: a.summary,
            destination: a.destination,
          })),
        )
        .orIgnore()
        .execute();
    if (messages.length)
      await m
        .createQueryBuilder()
        .insert()
        .into(NotificationMessage)
        .values(
          messages.map((s) => ({
            id: randomUUID(),
            eventKey: input.eventKey,
            recipientKey: s.recipientKey,
            phoneSnapshot: s.phone,
            contactIdSnapshot: s.contactId ?? null,
            text: s.text,
            isDemo: s.isDemo,
            updatedAt: new Date(),
          })),
        )
        .orIgnore()
        .execute();
  }
  async messages(requestId: string, m: EntityManager) {
    const facts = await m.findBy(NotificationFact, { requestId });
    if (!facts.length) return [];
    return m.find(NotificationMessage, {
      where: { eventKey: In(facts.map((f) => f.eventKey)) },
      order: { updatedAt: "ASC" },
    });
  }
  async operations() {
    const db = await this.database.connect();
    return (
      await db.manager.find(NotificationMessage, {
        order: { updatedAt: "DESC" },
        take: 100,
      })
    ).map((r) => ({
      id: r.id,
      eventKey: r.eventKey,
      recipientKind: r.recipientKey.startsWith("organizer:")
        ? "ORGANIZER"
        : "MERCHANT",
      status: r.status,
      attempts: r.attempts,
      provider: r.provider,
      errorCode: r.errorCode,
      failureStage: r.failureStage,
    }));
  }
  async pending() {
    const db = await this.database.connect();
    return db.manager.find(NotificationMessage, {
      where: { status: "PENDING" },
      take: 100,
      order: { updatedAt: "ASC" },
    });
  }
  async hold(id: string, reason: string) {
    const db = await this.database.connect();
    await db.manager.update(
      NotificationMessage,
      { id, status: "PROCESSING" },
      { status: "HELD", errorCode: reason, updatedAt: new Date() },
    );
  }
  async claim(
    id: string,
    real: boolean,
    retry?: { actor: string; reason: string },
  ) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const r = await m.findOneByOrFail(NotificationMessage, { id });
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `notification:${id}`,
      ]);
      const row = await m.findOneByOrFail(NotificationMessage, { id: r.id });
      if (
        row.status !== "PENDING" &&
        !(retry && row.status === "FAILED" && row.failureStage === "SUBMISSION")
      ) {
        if (retry) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        return null;
      }
      if (real && row.isDemo) {
        row.status = "HELD";
        row.errorCode = "DEMO_RECIPIENT";
        await m.save(row);
        return null;
      }
      if (retry)
        row.operations.push({
          ...retry,
          action: "RETRY",
          at: new Date().toISOString(),
        });
      row.status = "PROCESSING";
      row.attempts++;
      row.startedAt = new Date();
      row.updatedAt = new Date();
      row.providerMessageId = null;
      row.providerGroupId = null;
      row.failureStage = null;
      row.errorCode = null;
      return m.save(row);
    });
  }
  async settle(
    id: string,
    result: NotificationReport,
    attempt: number,
    report = false,
  ) {
    const db = await this.database.connect();
    await db.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `notification:${id}`,
      ]);
      const row = await m.findOneBy(NotificationMessage, { id });
      if (
        !row ||
        row.attempts !== attempt ||
        (row.providerMessageId &&
          result.messageId &&
          row.providerMessageId !== result.messageId)
      )
        return;
      if (report && (row.provider === "fake" || !result.messageId)) return;
      if (report) {
        const key = `${result.messageId}:${result.statusCode}`;
        if (row.reports.some((r) => r.key === key)) return;
        row.reports.push({ key, at: new Date().toISOString() });
      }
      row.provider = result.provider;
      row.providerMessageId ??= result.messageId ?? null;
      row.providerGroupId ??= result.groupId ?? null;
      if (
        ["PROCESSING", "UNKNOWN"].includes(row.status) ||
        (report &&
          (result.status === "DELIVERED" ||
            (row.status !== "DELIVERED" && result.status === "FAILED")))
      ) {
        row.status = result.status;
        row.failureStage = result.failureStage ?? null;
        row.errorCode = result.errorCode ?? null;
      }
      row.updatedAt = new Date();
      await m.save(row);
    });
  }
  async report(result: NotificationReport) {
    const db = await this.database.connect();
    const row = result.deliveryId
      ? await db.manager.findOneBy(NotificationMessage, {
          id: result.deliveryId,
        })
      : result.messageId
        ? await db.manager.findOneBy(NotificationMessage, {
            providerMessageId: result.messageId,
          })
        : null;
    if (
      !row ||
      (!result.deliveryAttempt && !row.providerMessageId && row.attempts > 1) ||
      (row.providerGroupId &&
        result.groupId &&
        row.providerGroupId !== result.groupId)
    )
      return;
    await this.settle(
      row.id,
      result,
      result.deliveryAttempt ?? row.attempts,
      true,
    );
  }
  async recover(id: string, actor: string, reason: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `notification:${id}`,
      ]);
      const row = await m.findOneByOrFail(NotificationMessage, { id });
      if (
        row.status === "PROCESSING" &&
        row.startedAt &&
        row.startedAt.getTime() + 300_000 < Date.now()
      ) {
        row.status = "UNKNOWN";
        row.errorCode = "LEASE_EXPIRED";
      }
      row.operations.push({
        actor,
        reason,
        action: "RECONCILE",
        at: new Date().toISOString(),
      });
      await m.save(row);
      return row;
    });
  }
}
