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
  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
  ) {}

  async assertOwned(
    ownerId: string,
    id: string,
    manager: EntityManager,
    lock = false,
  ): Promise<EventDto> {
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
          ownerId,
          creationKey: input.creationKey,
        });
        if (previous) {
          if (previous.creationDigest !== digest)
            throw new DomainHttpException("EVENT_CREATION_CONFLICT");
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
        groupId: input.groupId ?? null,
        version: 1,
        creationKey: input.creationKey ?? null,
        creationDigest: input.creationKey ? digest : null,
        reservationScheduleLocked: false,
        name: input.name,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdAt: new Date(),
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
              ownerId,
              creationKey: input.creationKey,
            })
          : null;
        if (!previous || previous.creationDigest !== digest)
          throw new DomainHttpException("EVENT_CREATION_CONFLICT");
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
      if (input.scheduledAt !== undefined)
        event.scheduledAt =
          input.scheduledAt === null ? null : new Date(input.scheduledAt);
      event.version += 1;
      return eventDto(await repository.save(event));
    });
  }
}
