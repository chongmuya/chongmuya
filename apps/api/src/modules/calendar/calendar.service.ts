import { ReservationFactsService } from "../reservations/reservation-facts.service.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { EventsService } from "../events/events.service.js";
import {
  CalendarSchedule,
  CalendarCommand,
} from "./entities/calendar-schedule.entity.js";
import { calendarRange, koreanDate, validDate } from "./lib/calendar-time.js";
import type {
  CalendarQuery,
  ScheduleInput,
} from "./dto/request/calendar.request.dto.js";
@Injectable()
export class CalendarService {
  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
    private readonly events: EventsService,
    private readonly reservations: ReservationFactsService,
  ) {}
  async list(ownerId: string, input: CalendarQuery) {
    const range = calendarRange(input.from, input.to);
    if (!range) throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    if (input.restaurantId) {
      if (input.groupId) throw new DomainHttpException("VALIDATION_FAILED");
      return {
        schedules: [],
        events: [],
        reservations: await this.reservations.calendar(
          ownerId,
          input.restaurantId,
          range.from,
          range.to,
          db.manager,
        ),
      };
    }
    if (input.groupId)
      await this.groups.assertOwned(ownerId, input.groupId, db.manager);
    const schedules = await db.manager
      .createQueryBuilder(CalendarSchedule, "s")
      .where(
        "s.ownerId = :ownerId AND s.deletedAt IS NULL AND s.date >= :from AND s.date < :to",
        { ownerId, from: input.from, to: input.to },
      )
      .andWhere(input.groupId ? "s.groupId = :groupId" : "s.groupId IS NULL", {
        groupId: input.groupId,
      })
      .orderBy("s.date", "ASC")
      .addOrderBy("s.startsAt", "ASC", "NULLS FIRST")
      .addOrderBy("s.id", "ASC")
      .getMany();
    const events = await this.events.calendar(
      ownerId,
      input.groupId,
      range.from,
      range.to,
      db.manager,
    );
    return { schedules, events };
  }
  async owned(ownerId: string, id: string, m: EntityManager, lock = false) {
    const row = await m.findOne(CalendarSchedule, {
      where: { id, ownerId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!row) throw new NotFoundException();
    if (row.groupId) await this.groups.assertOwned(ownerId, row.groupId, m);
    return row;
  }
  async get(ownerId: string, id: string) {
    const db = await this.database.connect();
    const row = await this.owned(ownerId, id, db.manager);
    if (row.deletedAt) throw new NotFoundException();
    return row;
  }
  async save(ownerId: string, input: ScheduleInput, id?: string) {
    const title = input.title.trim(),
      memo = input.memo.trim();
    const startsAt = input.allDay
      ? null
      : input.startsAt
        ? new Date(input.startsAt)
        : null;
    if (
      !title ||
      !validDate(input.date) ||
      (!input.allDay && (!startsAt || koreanDate(startsAt) !== input.date))
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    const data = {
      title,
      memo,
      date: input.date,
      startsAt,
      groupId: input.groupId ?? null,
    };
    const digest = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      if (input.groupId)
        await this.groups.assertOwned(ownerId, input.groupId, m);
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `schedule:${ownerId}:${id ?? input.requestKey}`,
      ]);
      if (!id) {
        const old = await m.findOneBy(CalendarSchedule, {
          ownerId,
          creationKey: input.requestKey,
        });
        if (old) {
          if (old.creationDigest !== digest)
            throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
          return old;
        }
        if (input.expectedVersion !== 0)
          throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
        return m.save(CalendarSchedule, {
          ...data,
          id: randomUUID(),
          ownerId,
          creationKey: input.requestKey,
          creationDigest: digest,
          version: 1,
          scheduleRevision: 1,
          scheduleUpdatedAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });
      }
      const row = await this.owned(ownerId, id, m, true);
      const commandDigest = createHash("sha256")
        .update(
          JSON.stringify({ digest, expectedVersion: input.expectedVersion }),
        )
        .digest("hex");
      const receipt = await m.findOneBy(CalendarCommand, {
        scheduleId: id,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== commandDigest)
          throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
        return receipt.snapshot;
      }

      if (
        row.version !== input.expectedVersion ||
        row.deletedAt ||
        row.groupId !== data.groupId
      )
        throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
      if (
        row.date !== data.date ||
        (row.startsAt?.getTime() ?? null) !== (data.startsAt?.getTime() ?? null)
      ) {
        row.scheduleRevision++;
        row.scheduleUpdatedAt = new Date();
      }
      Object.assign(row, data, {
        version: row.version + 1,
        updatedAt: new Date(),
      });
      await m.save(row);
      await m.save(CalendarCommand, {
        scheduleId: id,
        requestKey: input.requestKey,
        digest: commandDigest,
        snapshot: row,
      });
      return row;
    });
  }
  async remove(ownerId: string, id: string, version: number) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const row = await this.owned(ownerId, id, m, true);
      if (row.deletedAt && row.version === version + 1) return { ok: true };
      if (row.version !== version || row.deletedAt)
        throw new DomainHttpException("WORKSPACE_VERSION_CONFLICT");
      row.deletedAt = new Date();
      row.updatedAt = row.deletedAt;
      row.version++;
      await m.save(row);
      return { ok: true };
    });
  }
  // PR5 may invoke this in its ownership transaction; personal schedules are excluded.
  async transferGroup(
    groupId: string,
    from: string,
    to: string,
    m: EntityManager,
  ) {
    await m.update(
      CalendarSchedule,
      { groupId, ownerId: from, deletedAt: IsNull() },
      { ownerId: to, updatedAt: new Date() },
    );
  }
}
