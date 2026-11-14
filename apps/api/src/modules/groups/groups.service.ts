import {
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { Group, Event } from "./group.entity.js";
import type {
  GroupInput,
  EventInput,
  GroupDto,
  EventDto,
} from "./group.dto.js";
const groupDto = (g: Group): GroupDto => ({ id: g.id, name: g.name });
const eventDto = (e: Event): EventDto => ({
  id: e.id,
  groupId: e.groupId,
  name: e.name,
  scheduledAt: e.scheduledAt?.toISOString() ?? null,
});
@Injectable()
export class GroupsService {
  constructor(private readonly database: DatabaseService) {}
  private async run<T>(action: (db: DataSource) => Promise<T>): Promise<T> {
    try {
      return await action(await this.database.connect());
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }
  private async owned(db: DataSource, ownerId: string, id: string) {
    const group = await db.getRepository(Group).findOneBy({ id, ownerId });
    if (!group) throw new NotFoundException();
    return group;
  }
  list(ownerId: string) {
    return this.run(async (db) =>
      (
        await db
          .getRepository(Group)
          .find({ where: { ownerId }, order: { createdAt: "ASC", id: "ASC" } })
      ).map(groupDto),
    );
  }
  create(ownerId: string, input: GroupInput) {
    return this.run(async (db) =>
      groupDto(
        await db.getRepository(Group).save({
          id: randomUUID(),
          ownerId,
          name: input.name,
          createdAt: new Date(),
        }),
      ),
    );
  }
  get(ownerId: string, id: string) {
    return this.run(async (db) => groupDto(await this.owned(db, ownerId, id)));
  }
  rename(ownerId: string, id: string, input: GroupInput) {
    return this.run(async (db) => {
      const result = await db
        .getRepository(Group)
        .update({ id, ownerId }, { name: input.name });
      if (!result.affected) throw new NotFoundException();
      return { id, name: input.name };
    });
  }
  events(ownerId: string, groupId: string) {
    return this.run(async (db) => {
      await this.owned(db, ownerId, groupId);
      return (
        await db.getRepository(Event).find({
          where: { groupId },
          order: { createdAt: "DESC", id: "DESC" },
        })
      ).map(eventDto);
    });
  }
  createEvent(ownerId: string, groupId: string, input: EventInput) {
    return this.run(async (db) => {
      await this.owned(db, ownerId, groupId);
      return eventDto(
        await db.getRepository(Event).save({
          id: randomUUID(),
          groupId,
          name: input.name,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdAt: new Date(),
        }),
      );
    });
  }
  event(ownerId: string, groupId: string, id: string) {
    return this.run(async (db) => {
      await this.owned(db, ownerId, groupId);
      const event = await db.getRepository(Event).findOneBy({ id, groupId });
      if (!event) throw new NotFoundException();
      return eventDto(event);
    });
  }
}
