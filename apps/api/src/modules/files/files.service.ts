import { NotificationsService } from "../notifications/notifications.service.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EventsService } from "../events/events.service.js";
import { FileStorage } from "./file-storage.js";
import { EventFile } from "./entities/event-file.entity.js";
import { validateFile, MAX_FILE_BYTES } from "./lib/validate-file.js";
const dto = (f: EventFile) => ({
  id: f.id,
  eventId: f.eventId,
  expenseId: f.expenseId,
  name: f.name,
  mime: f.mime,
  size: f.size,
  status: f.status,
  version: f.version,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
});
@Injectable()
export class FilesService {
  async handoverCount(events: string[], m: EntityManager) {
    return events.length
      ? m.countBy(EventFile, { eventId: In(events), status: "READY" })
      : 0;
  }

  constructor(
    private readonly notifications: NotificationsService,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly storage: FileStorage,
    private readonly config: ConfigService,
  ) {}
  async list(owner: string, event: string) {
    const db = await this.database.connect();
    await this.events.assertOwned(owner, event, db.manager);
    return {
      files: (
        await db.manager.find(EventFile, {
          where: { eventId: event },
          order: { createdAt: "DESC" },
        })
      )
        .filter((f) => f.status !== "DELETED")
        .map(dto),
      limits: {
        bytesPerFile: MAX_FILE_BYTES,
        count: this.config.environment.filesMaxCount,
        totalBytes: this.config.environment.filesMaxBytes,
      },
    };
  }
  async metadata(owner: string, ids: string[], m: EntityManager) {
    const rows = ids.length
      ? await m.find(EventFile, {
          where: { eventId: In(ids), status: "READY" },
        })
      : [];
    for (const id of ids) await this.events.assertOwned(owner, id, m);
    return rows.map(dto);
  }
  // Caller holds event lock and has validated the expense in the same transaction.
  async link(
    owner: string,
    event: string,
    expense: string,
    ids: string[],
    m: EntityManager,
  ) {
    await this.events.assertOwned(owner, event, m);
    if (new Set(ids).size !== ids.length)
      throw new DomainHttpException("FILE_INVALID");
    const rows = ids.length
      ? await m.find(EventFile, {
          where: { id: In(ids), eventId: event, status: "READY" },
        })
      : [];
    if (
      rows.length !== ids.length ||
      rows.some((f) => f.expenseId && f.expenseId !== expense)
    )
      throw new DomainHttpException("FILE_INVALID");
    const linked = await m.find(EventFile, {
      where: { eventId: event, expenseId: expense },
    });
    for (const f of linked.filter((f) => !ids.includes(f.id))) {
      f.expenseId = null;
      f.version++;
      f.updatedAt = new Date();
      await m.save(f);
    }
    for (const f of rows) {
      if (f.expenseId === expense) continue;
      f.expenseId = expense;
      f.version++;
      f.updatedAt = new Date();
      await m.save(f);
    }
  }
  async upload(
    owner: string,
    event: string,
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const db = await this.database.connect();
    await this.events.assertOwned(owner, event, db.manager);
    if (!(await validateFile(file.buffer, file.originalname, file.mimetype)))
      throw new DomainHttpException("FILE_INVALID");
    const digest = createHash("sha256")
      .update(file.originalname)
      .update(file.mimetype)
      .update(file.buffer)
      .digest("hex");
    const row = await db.transaction(async (m) => {
      await this.events.assertOwned(owner, event, m, true);
      const old = await m.findOneBy(EventFile, { id });
      if (old) {
        if (old.eventId !== event || old.digest !== digest)
          throw new DomainHttpException("SETTLEMENT_REQUEST_CONFLICT");
        if (old.status === "READY") return old;
        if (
          old.status !== "FAILED" &&
          !(
            old.status === "UPLOADING" &&
            Date.now() - old.updatedAt.getTime() > 120000
          )
        )
          throw new DomainHttpException("FILE_BUSY");
        old.status = "UPLOADING";
        old.updatedAt = new Date();
        old.version++;
        return m.save(old);
      }
      const rows = await m.find(EventFile, { where: { eventId: event } }),
        active = rows.filter((f) => f.status !== "DELETED");
      if (
        active.length >= this.config.environment.filesMaxCount ||
        active.reduce((n, f) => n + f.size, 0) + file.buffer.length >
          this.config.environment.filesMaxBytes
      )
        throw new DomainHttpException("FILE_LIMIT");
      return m.save(
        m.create(EventFile, {
          id,
          eventId: event,
          expenseId: null,
          name: file.originalname,
          mime: file.mimetype,
          size: file.buffer.length,
          digest,
          objectKey: `events/${event}/${id}`,
          status: "UPLOADING",
          version: 1,
          actorId: owner,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    });
    if (row.status === "READY") return dto(row);
    let success = false;
    try {
      await this.storage.put(row.objectKey, file.buffer, row.mime);
      success = true;
    } catch {
      /* Provider details must never escape. */
    }
    const completed = await db.transaction(async (m) => {
      const eventInfo = await this.events.assertOwned(owner, event, m, true);
      const result = await m.update(
        EventFile,
        { id, version: row.version, status: "UPLOADING" },
        { status: success ? "READY" : "FAILED", updatedAt: new Date() },
      );
      if (result.affected === 1) {
        if (success)
          await this.notifications.record(m, {
            eventKey: `file:${id}`,
            kind: "FILE_REGISTERED",
            category: "SETTLEMENT",
            eventId: event,
            requestId: id,
            revision: row.version,
            accounts: [
              {
                id: owner,
                title: "첨부 등록이 완료됐어요",
                summary: `${eventInfo.name} · 행사 자료에서 확인할 수 있어요.`,
                destination: `/events?event=${event}&view=record`,
              },
            ],
            messages: [],
          });
        return true;
      }
      // A late provider result must not resurrect a deleted attachment or
      // claim completion. Keep a tombstone requiring another object cleanup.
      await m.update(
        EventFile,
        { id, eventId: event, status: "DELETED" },
        { status: "DELETE_FAILED", updatedAt: new Date() },
      );
      return false;
    });
    if (!completed) throw new DomainHttpException("FILE_BUSY");
    if (!success) throw new DomainHttpException("FILE_UNAVAILABLE");
    return dto({ ...row, status: "READY" });
  }
  async download(owner: string, event: string, id: string) {
    const db = await this.database.connect();
    await this.events.assertOwned(owner, event, db.manager);
    const f = await db.manager.findOneBy(EventFile, {
      id,
      eventId: event,
      status: "READY",
    });
    if (!f) throw new NotFoundException();
    let body: Uint8Array;
    try {
      body = await this.storage.get(f.objectKey);
      if (
        body.byteLength !== f.size ||
        body.byteLength > MAX_FILE_BYTES ||
        createHash("sha256")
          .update(f.name)
          .update(f.mime)
          .update(body)
          .digest("hex") !== f.digest
      )
        throw new Error("FILE_CONTENT_MISMATCH");
    } catch {
      throw new DomainHttpException("FILE_UNAVAILABLE");
    }
    await this.events.assertOwned(owner, event, db.manager);
    if (
      !(await db.manager.existsBy(EventFile, {
        id,
        eventId: event,
        status: "READY",
      }))
    )
      throw new NotFoundException();
    return { body, name: f.name };
  }
  async remove(owner: string, event: string, id: string, version: number) {
    const db = await this.database.connect();
    const row = await db.transaction(async (m) => {
      await this.events.assertOwned(owner, event, m, true);
      const f = await m.findOneBy(EventFile, { id, eventId: event });
      if (!f) throw new NotFoundException();
      if (f.status === "DELETED") return f;
      if (
        (f.status === "UPLOADING" || f.status === "DELETING") &&
        Date.now() - f.updatedAt.getTime() < 120000
      )
        throw new DomainHttpException("FILE_BUSY");
      if (
        f.version !== version &&
        f.status !== "DELETE_FAILED" &&
        f.status !== "DELETING"
      )
        throw new DomainHttpException("SETTLEMENT_CONFLICT");
      f.status = "DELETING";
      f.expenseId = null;
      f.version++;
      f.updatedAt = new Date();
      return m.save(f);
    });
    if (row.status === "DELETED") return;
    let success = false;
    try {
      await this.storage.delete(row.objectKey);
      success = true;
    } catch {
      /* Durable retryable failure. */
    }
    const completed = await db.manager.update(
      EventFile,
      { id, eventId: event, version: row.version, status: "DELETING" },
      { status: success ? "DELETED" : "DELETE_FAILED", updatedAt: new Date() },
    );
    if (completed.affected !== 1) {
      const current = await db.manager.findOneBy(EventFile, {
        id,
        eventId: event,
      });
      if (current?.status === "DELETED") return;
      throw new DomainHttpException("FILE_BUSY");
    }
    if (!success) throw new DomainHttpException("FILE_UNAVAILABLE");
  }
}
