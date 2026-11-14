import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { Group } from "./entities/group.entity.js";
import type { GroupInput } from "./dto/request/group-name.request.dto.js";
import type { GroupDto } from "./dto/response/group.response.dto.js";

const groupDto = (group: Group): GroupDto => ({
  id: group.id,
  name: group.name,
});

@Injectable()
export class GroupsService {
  constructor(private readonly database: DatabaseService) {}

  // Public resource authorization boundary. A caller's transaction must supply its manager.
  async assertOwned(
    ownerId: string,
    id: string,
    manager: EntityManager,
  ): Promise<void> {
    if (!(await manager.getRepository(Group).existsBy({ id, ownerId })))
      throw new NotFoundException();
  }

  async list(ownerId: string): Promise<GroupDto[]> {
    const db = await this.database.connect();
    return (
      await db.getRepository(Group).find({
        where: { ownerId },
        order: { createdAt: "ASC", id: "ASC" },
      })
    ).map(groupDto);
  }

  async create(ownerId: string, input: GroupInput): Promise<GroupDto> {
    const db = await this.database.connect();
    return groupDto(
      await db.getRepository(Group).save({
        id: randomUUID(),
        ownerId,
        name: input.name,
        createdAt: new Date(),
      }),
    );
  }

  async get(ownerId: string, id: string): Promise<GroupDto> {
    const db = await this.database.connect();
    const group = await db.getRepository(Group).findOneBy({ id, ownerId });
    if (!group) throw new NotFoundException();
    return groupDto(group);
  }

  async rename(
    ownerId: string,
    id: string,
    input: GroupInput,
  ): Promise<GroupDto> {
    const db = await this.database.connect();
    const result = await db
      .getRepository(Group)
      .update({ id, ownerId }, { name: input.name });
    if (!result.affected) throw new NotFoundException();
    return { id, name: input.name };
  }
}
