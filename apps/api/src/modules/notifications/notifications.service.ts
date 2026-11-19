import { Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import {
  NotificationFact,
  Notification,
  NotificationMessage,
  NotificationPreference,
} from "./entities/notification.entity.js";
import type {
  NotificationInput,
  NotificationReport,
} from "./types/notification.js";
@Injectable()
export class NotificationsService {
  // Only the dispatcher that owns this claim may prove no external submission occurred.
  async replanUnsubmitted(
    id: string,
    attempts: number,
    requestId: string,
    to: { id: string; phone: string },
    m: EntityManager,
  ) {
    const row = await m.findOne(NotificationMessage, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    if (!row || row.status !== "PROCESSING" || row.attempts !== attempts)
      return;
    row.status = "HELD";
    row.errorCode = "SUBMISSION_NOT_STARTED";
    await m.save(row);
    await this.replanOrganizer(
      requestId,
      row.recipientKey.split(":")[1]!,
      to,
      "dispatcher",
      createHash("sha256")
        .update(`unsubmitted:${id}:${attempts}`)
        .digest("hex")
        .slice(0, 32),
      m,
    );
  }
  async messageRequest(id: string, m: EntityManager) {
    const message = await m.findOneBy(NotificationMessage, { id });
    return message
      ? (await m.findOneBy(NotificationFact, { eventKey: message.eventKey }))
          ?.requestId
      : undefined;
  }
  async replanOrganizer(
    requestId: string,
    from: string,
    to: { id: string; phone: string },
    actor: string,
    handoverId: string,
    m: EntityManager,
  ) {
    const facts = await m.findBy(NotificationFact, { requestId });
    if (!facts.length) return;
    const rows = await m
      .createQueryBuilder(NotificationMessage, "n")
      .where("n.eventKey IN (:...keys)", { keys: facts.map((f) => f.eventKey) })
      .andWhere(
        "split_part(n.recipientKey, ':', 2) = :from AND n.recipientKey LIKE 'organizer:%'",
        { from },
      )
      .orderBy("n.id", "ASC")
      .setLock("pessimistic_write")
      .getMany();
    for (const row of rows) {
      if (
        !["PENDING", "HELD"].includes(row.status) &&
        !(row.status === "FAILED" && row.failureStage === "SUBMISSION")
      )
        continue;
      if (row.errorCode === "RECIPIENT_CHANGED") continue;
      row.status = "HELD";
      row.errorCode = "RECIPIENT_CHANGED";
      row.updatedAt = new Date();
      row.operations = [
        ...row.operations,
        {
          actor,
          reason: "모임 인수인계",
          action: "REPLAN",
          at: new Date().toISOString(),
        },
      ];
      await m.save(row);
      await m
        .createQueryBuilder()
        .insert()
        .into(NotificationMessage)
        .values({
          id: randomUUID(),
          eventKey: row.eventKey,
          recipientKey: `organizer:${to.id}:handover:${handoverId}`,
          phoneSnapshot: to.phone,
          contactIdSnapshot: null,
          text: row.text,
          isDemo: row.isDemo,
          status: "PENDING",
          attempts: 0,
          updatedAt: new Date(),
          operations: [],
          reports: [],
        })
        .orIgnore()
        .execute();
    }
  }

  constructor(private readonly database: DatabaseService) {}
  async record(m: EntityManager, input: NotificationInput) {
    const { accounts, messages, ...fact } = input;
    // Sorted recipient locks serialize settings, recording, and inbox snapshots.
    for (const id of [...new Set(accounts.map((a) => a.id))].sort())
      await this.lockAccount(m, id);
    const inserted = await m
      .createQueryBuilder()
      .insert()
      .into(NotificationFact)
      .values({ ...fact, occurredAt: new Date() })
      .orIgnore()
      .returning("event_key")
      .execute();
    if (!(inserted.raw as unknown[]).length) return;
    const recipients = [];
    for (const account of accounts) {
      const preferences = await m.findOneBy(NotificationPreference, {
        accountId: account.id,
      });
      const category = (input.category ?? "RESERVATION").toLowerCase() as
        "reservation" | "settlement" | "event";
      if (preferences?.[category] !== false) recipients.push(account);
    }
    if (recipients.length)
      await m
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(
          recipients.map((a) => ({
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
  async lockAccount(m: EntityManager, id: string) {
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `inbox:${id}`,
    ]);
  }
  private position(value: string) {
    if (!/^\d{1,19}$/.test(value) || BigInt(value) > 9223372036854775807n)
      throw new DomainHttpException("VALIDATION_FAILED");
  }
  async inbox(accountId: string, before?: string, countOnly = false) {
    if (before) this.position(before);
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.lockAccount(m, accountId);
      const base = m
        .createQueryBuilder(Notification, "n")
        .where("n.accountId = :accountId", { accountId });
      const unread = await base.clone().andWhere("n.readAt IS NULL").getCount();
      const newest = await base.clone().orderBy("n.sequence", "DESC").getOne();
      if (countOnly)
        return {
          unread,
          through: newest?.sequence ?? "0",
          items: [],
          next: null,
        };
      const query = base.clone().orderBy("n.sequence", "DESC").take(31);
      if (before) query.andWhere("n.sequence < :before", { before });
      const rows = await query.getMany();
      const items = rows.slice(0, 30);
      const facts = items.length
        ? await m.findBy(NotificationFact, {
            eventKey: In(items.map((r) => r.eventKey)),
          })
        : [];
      return {
        items: items.map((row) => ({
          ...row,
          fact: facts.find((f) => f.eventKey === row.eventKey),
        })),
        unread,
        through: newest?.sequence ?? "0",
        next: rows.length > 30 ? items.at(-1)!.sequence : null,
      };
    });
  }
  async read(accountId: string, input: { id?: string; through?: string }) {
    if (input.through) this.position(input.through);
    const db = await this.database.connect();
    await db.transaction(async (m) => {
      await this.lockAccount(m, accountId);
      const query = m
        .createQueryBuilder()
        .update(Notification)
        .set({ readAt: new Date() })
        .where("account_id = :accountId AND read_at IS NULL", { accountId });
      if (input.id) query.andWhere("id = :id", { id: input.id });
      else if (input.through)
        query.andWhere("sequence <= :through", { through: input.through });
      else throw new DomainHttpException("VALIDATION_FAILED");
      await query.execute();
    });
    return { ok: true };
  }
  async preferences(accountId: string) {
    const db = await this.database.connect();
    return (
      (await db.manager.findOneBy(NotificationPreference, { accountId })) ?? {
        accountId,
        reservation: true,
        settlement: true,
        event: true,
        version: 0,
      }
    );
  }
  async savePreferences(
    accountId: string,
    input: {
      reservation: boolean;
      settlement: boolean;
      event: boolean;
      expectedVersion: number;
    },
  ) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.lockAccount(m, accountId);
      const current = await m.findOneBy(NotificationPreference, { accountId });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
      return m.save(NotificationPreference, {
        accountId,
        reservation: input.reservation,
        settlement: input.settlement,
        event: input.event,
        version: input.expectedVersion + 1,
      });
    });
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
