import { Injectable, NotFoundException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { copyGroupRoster } from "./lib/copy-group-roster.js";
import { Event } from "./entities/event.entity.js";
import type { EventInput } from "./dto/request/create-event.request.dto.js";
import type { UpdateEventInput } from "./dto/request/update-event.request.dto.js";
import type { EventDto } from "./dto/response/event.response.dto.js";

import { EventParticipant } from "./entities/event-participant.entity.js";
import { AttendanceRound } from "./entities/attendance-round.entity.js";
import { AttendanceResponse } from "./entities/attendance-response.entity.js";
import { participantDto, responseDto } from "./lib/attendance-rules.js";

const eventDto = (event: Event): EventDto => ({
  id: event.id,
  ownerId: event.ownerId,
  groupId: event.groupId,
  version: event.version,
  reservationScheduleLocked: event.reservationScheduleLocked,
  name: event.name,
  scheduledAt: event.scheduledAt?.toISOString() ?? null,
});

@Injectable()
export class EventsService {
  async groupEvents(groupId: string, m: EntityManager) {
    return (
      await m.find(Event, { where: { groupId }, order: { id: "ASC" } })
    ).map(eventDto);
  }

  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
  ) {}

  async reminderCandidates(
    range: { from: Date; to: Date; due: Date },
    m: EntityManager,
    after?: string,
  ) {
    const q = m
      .createQueryBuilder(Event, "e")
      .select(["e.id", "e.scheduleRevision"])
      .where("e.scheduledAt >= :from AND e.scheduledAt < :to", range)
      .andWhere("e.scheduleUpdatedAt <= :due", range);
    if (after) q.andWhere("e.id > :after", { after });
    return (await q.orderBy("e.id", "ASC").take(100).getMany()).map((e) => ({
      id: e.id,
      revision: e.scheduleRevision,
    }));
  }
  async reminderCurrent(id: string, m: EntityManager) {
    await this.lockGroup(id, m);
    const e = await m.findOne(Event, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    return e
      ? {
          id: e.id,
          ownerId: e.ownerId,
          title: e.name,
          version: e.scheduleRevision,
          startsAt: e.scheduledAt,
          updatedAt: e.scheduleUpdatedAt,
        }
      : null;
  }
  async calendar(
    ownerId: string,
    groupId: string | undefined,
    from: Date,
    to: Date,
    m: EntityManager,
  ) {
    if (groupId) await this.groups.assertOwned(ownerId, groupId, m);
    return (
      await m
        .createQueryBuilder(Event, "e")
        .where(
          "e.ownerId = :ownerId AND e.scheduledAt >= :from AND e.scheduledAt < :to",
          { ownerId, from, to },
        )
        .andWhere(groupId ? "e.groupId = :groupId" : "e.groupId IS NULL", {
          groupId,
        })
        .orderBy("e.scheduledAt", "ASC")
        .addOrderBy("e.id", "ASC")
        .getMany()
    ).map(eventDto);
  }
  async settlementFacts(ownerId: string, id: string, m: EntityManager) {
    await this.assertOwned(ownerId, id, m);
    const participants = await m.find(EventParticipant, {
      where: { eventId: id },
      order: { position: "ASC" },
    });
    const rounds = await m.find(AttendanceRound, {
      where: { eventId: id },
      order: { position: "ASC" },
    });
    const responses = await m.find(AttendanceResponse, {
      where: { eventId: id },
    });
    const attending = responses.filter(
      (r) => responseDto(r).finalState === "ATTENDING",
    );
    return {
      participants: participants.map(participantDto),
      rounds: rounds.map((r) => ({
        id: r.id,
        title: r.title,
        attendingIds: attending
          .filter((a) => a.roundId === r.id)
          .map((a) => a.participantId),
      })),
      attendingCount: new Set(attending.map((r) => r.participantId)).size,
    };
  }
  async recordPage(
    ownerId: string,
    m: EntityManager,
    options: {
      groupId?: string;
      search?: string;
      before?: string;
      after?: string;
      offset: number;
    },
  ) {
    if (options.groupId)
      await this.groups.assertOwned(ownerId, options.groupId, m);
    const q = m
      .getRepository(Event)
      .createQueryBuilder("e")
      .where("e.ownerId = :ownerId", { ownerId });
    if (options.groupId)
      q.andWhere("e.groupId = :groupId", { groupId: options.groupId });
    if (options.search)
      q.andWhere("position(lower(:search) in lower(e.name)) > 0", {
        search: options.search,
      });
    if (options.before)
      q.andWhere("e.scheduledAt <= :before", { before: options.before });
    if (options.after)
      q.andWhere("e.scheduledAt >= :after", { after: options.after });
    const [rows, count] = await q
      .orderBy("e.scheduledAt", "DESC", "NULLS LAST")
      .addOrderBy("e.id", "DESC")
      .skip(options.offset)
      .take(20)
      .getManyAndCount();
    const ids = rows.map((e) => e.id);
    const attendance = ids.length
      ? await m
          .getRepository(AttendanceResponse)
          .createQueryBuilder("a")
          .select("a.eventId", "eventId")
          .addSelect("COUNT(DISTINCT a.participant_id)", "count")
          .where("a.eventId IN (:...ids)", { ids })
          .andWhere(
            "COALESCE(a.manager_override, a.self_answer, 'UNANSWERED') = 'ATTENDING'",
          )
          .groupBy("a.eventId")
          .getRawMany<{ eventId: string; count: string }>()
      : [];
    return {
      count,
      events: rows.map((e) => ({
        ...eventDto(e),
        attendingCount: Number(
          attendance.find((a) => a.eventId === e.id)?.count ?? 0,
        ),
      })),
    };
  }
  private async lockGroup(id: string, m: EntityManager, ownerId?: string) {
    const seed = await m.findOneBy(Event, { id });
    if (!seed) throw new NotFoundException();
    if (seed.groupId) {
      if (ownerId) await this.groups.assertOwned(ownerId, seed.groupId, m);
      else await this.groups.lock(seed.groupId, m);
    }
  }

  async transferGroup(
    groupId: string,
    from: string,
    to: string,
    m: EntityManager,
  ) {
    const rows = await m.find(Event, {
      where: { groupId },
      order: { id: "ASC" },
      lock: { mode: "pessimistic_write" },
    });
    for (const row of rows) {
      if (row.ownerId !== from)
        throw new DomainHttpException("VERSION_CONFLICT");
      row.ownerId = to;
      row.version++;
      await m.save(row);
    }
    return rows.map(eventDto);
  }

  async groupCount(groupId: string, m: EntityManager) {
    return m.countBy(Event, { groupId });
  }

  async assertOwned(
    ownerId: string,
    id: string,
    manager: EntityManager,
    lock = false,
  ): Promise<EventDto> {
    await this.lockGroup(id, manager, ownerId);
    const event = await manager.getRepository(Event).findOne({
      where: { id, ownerId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!event) throw new NotFoundException();
    return eventDto(event);
  }

  // Internal callers must authorize their own principal, then acquire this event lock first.
  async lockReservationEvent(
    id: string,
    manager: EntityManager,
  ): Promise<EventDto> {
    await this.lockGroup(id, manager);
    const event = await manager.findOne(Event, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    if (!event) throw new NotFoundException();
    return eventDto(event);
  }
  async setReservationSchedule(
    id: string,
    startsAt: string,
    locked: boolean,
    manager: EntityManager,
  ) {
    const event = await manager.findOneByOrFail(Event, { id });
    const date = new Date(startsAt);
    if (
      event.scheduledAt?.getTime() !== date.getTime() ||
      event.reservationScheduleLocked !== locked
    ) {
      if (event.scheduledAt?.getTime() !== date.getTime()) {
        event.scheduleUpdatedAt = new Date();
        event.scheduleRevision++;
      }
      event.scheduledAt = date;
      event.reservationScheduleLocked = locked;
      event.version++;
      await manager.save(event);
    }
  }

  async list(ownerId: string, groupId?: string): Promise<EventDto[]> {
    const db = await this.database.connect();
    if (groupId) await this.groups.assertOwned(ownerId, groupId, db.manager);
    return (
      await db.getRepository(Event).find({
        where: { ownerId, ...(groupId ? { groupId } : {}) },
        order: { createdAt: "DESC", id: "DESC" },
      })
    ).map(eventDto);
  }

  async create(ownerId: string, input: EventInput): Promise<EventDto> {
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          name: input.name.trim(),
          scheduledAt: input.scheduledAt
            ? new Date(input.scheduledAt).toISOString()
            : null,
          groupId: input.groupId ?? null,
          importGroupRoster: input.importGroupRoster ?? false,
        }),
      )
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      if (input.creationKey) {
        const previous = await manager.findOneBy(Event, {
          creatorId: ownerId,
          creationKey: input.creationKey,
        });
        if (previous) {
          if (previous.creationDigest !== digest)
            throw new DomainHttpException("EVENT_CREATION_CONFLICT");
          await this.assertOwned(ownerId, previous.id, manager);
          return eventDto(previous);
        }
      }
      if (input.importGroupRoster && !input.groupId)
        throw new DomainHttpException("EVENT_GROUP_REQUIRED");
      const members =
        input.importGroupRoster && input.groupId
          ? await this.groups.membersInTransaction(
              ownerId,
              input.groupId,
              manager,
              true,
            )
          : null;
      if (input.groupId && !members)
        await this.groups.assertOwned(ownerId, input.groupId, manager);
      const event = manager.getRepository(Event).create({
        id: randomUUID(),
        ownerId,
        creatorId: ownerId,
        groupId: input.groupId ?? null,
        version: 1,
        creationKey: input.creationKey ?? null,
        creationDigest: input.creationKey ? digest : null,
        reservationScheduleLocked: false,
        name: input.name,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdAt: new Date(),
        scheduleUpdatedAt: new Date(),
        scheduleRevision: 1,
      });
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Event)
        .values(event)
        .orIgnore()
        .returning("id")
        .execute();
      if (!(inserted.raw as unknown[]).length) {
        const previous = input.creationKey
          ? await manager.findOneBy(Event, {
              creatorId: ownerId,
              creationKey: input.creationKey,
            })
          : null;
        if (!previous || previous.creationDigest !== digest)
          throw new DomainHttpException("EVENT_CREATION_CONFLICT");
        await this.assertOwned(ownerId, previous.id, manager);
        return eventDto(previous);
      }
      if (members?.length) await copyGroupRoster(manager, event.id, members);
      return eventDto(event);
    });
  }

  async get(ownerId: string, id: string): Promise<EventDto> {
    const db = await this.database.connect();
    return this.assertOwned(ownerId, id, db.manager);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateEventInput,
  ): Promise<EventDto> {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.lockGroup(id, manager, ownerId);
      const repository = manager.getRepository(Event);
      const event = await repository.findOne({
        where: { id, ownerId },
        lock: { mode: "pessimistic_write" },
      });
      if (!event) throw new NotFoundException();
      if (event.version !== input.expectedVersion)
        throw new DomainHttpException("VERSION_CONFLICT");
      if (
        event.reservationScheduleLocked &&
        input.scheduledAt !== undefined &&
        (input.scheduledAt ? Date.parse(input.scheduledAt) : null) !==
          (event.scheduledAt?.getTime() ?? null)
      )
        throw new DomainHttpException("EVENT_SCHEDULE_LOCKED");
      if (input.name !== undefined) event.name = input.name;
      if (input.scheduledAt !== undefined) {
        const next =
          input.scheduledAt === null ? null : new Date(input.scheduledAt);
        if (
          (event.scheduledAt?.getTime() ?? null) !== (next?.getTime() ?? null)
        ) {
          event.scheduleUpdatedAt = new Date();
          event.scheduleRevision++;
        }
        event.scheduledAt = next;
      }
      event.version += 1;
      return eventDto(await repository.save(event));
    });
  }
}
