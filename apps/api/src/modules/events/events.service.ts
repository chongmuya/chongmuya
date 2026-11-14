import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { GroupsService } from "../groups/groups.service.js";
import { Event } from "./event.entity.js";
import type { EventInput } from "./event-request.dto.js";
import type { EventDto } from "./event-response.dto.js";

const eventDto = (event: Event): EventDto => ({
  id: event.id,
  groupId: event.groupId,
  name: event.name,
  scheduledAt: event.scheduledAt?.toISOString() ?? null,
});

@Injectable()
export class EventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
  ) {}

  async list(ownerId: string, groupId: string): Promise<EventDto[]> {
    const db = await this.database.connect();
    await this.groups.assertOwned(ownerId, groupId, db.manager);
    return (
      await db.getRepository(Event).find({
        where: { groupId },
        order: { createdAt: "DESC", id: "DESC" },
      })
    ).map(eventDto);
  }

  async create(
    ownerId: string,
    groupId: string,
    input: EventInput,
  ): Promise<EventDto> {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.groups.assertOwned(ownerId, groupId, manager);
      return eventDto(
        await manager.getRepository(Event).save({
          id: randomUUID(),
          groupId,
          name: input.name,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdAt: new Date(),
        }),
      );
    });
  }

  async get(ownerId: string, groupId: string, id: string): Promise<EventDto> {
    const db = await this.database.connect();
    await this.groups.assertOwned(ownerId, groupId, db.manager);
    const event = await db.getRepository(Event).findOneBy({ id, groupId });
    if (!event) throw new NotFoundException();
    return eventDto(event);
  }
}
