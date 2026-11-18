import { Injectable, NotFoundException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { Event } from "./entities/event.entity.js";
import type { EventInput } from "./dto/request/create-event.request.dto.js";
import type { UpdateEventInput } from "./dto/request/update-event.request.dto.js";
import type { EventDto } from "./dto/response/event.response.dto.js";

const eventDto = (event: Event): EventDto => ({
  id: event.id,
  ownerId: event.ownerId,
  groupId: event.groupId,
  version: event.version,
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
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      if (input.groupId)
        await this.groups.assertOwned(ownerId, input.groupId, manager);
      return eventDto(
        await manager.getRepository(Event).save({
          id: randomUUID(),
          ownerId,
          groupId: input.groupId ?? null,
          version: 1,
          name: input.name,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdAt: new Date(),
        }),
      );
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
      if (input.name !== undefined) event.name = input.name;
      if (input.scheduledAt !== undefined)
        event.scheduledAt =
          input.scheduledAt === null ? null : new Date(input.scheduledAt);
      event.version += 1;
      return eventDto(await repository.save(event));
    });
  }
}
