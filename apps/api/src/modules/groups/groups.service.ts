import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { Group } from "./entities/group.entity.js";
import { GroupMember } from "./entities/group-member.entity.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import type { CreateGroupInput } from "./dto/request/create-group.request.dto.js";
import type { GroupInput } from "./dto/request/group-name.request.dto.js";
import type {
  GroupDto,
  GroupMemberDto,
} from "./dto/response/group.response.dto.js";

const groupDto = (group: Group, memberCount: number): GroupDto => ({
  id: group.id,
  name: group.name,
  groupType: group.groupType,
  memberCount,
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
    const groups = await db
      .getRepository(Group)
      .find({ where: { ownerId }, order: { createdAt: "ASC", id: "ASC" } });
    if (!groups.length) return [];
    const counts = await db
      .getRepository(GroupMember)
      .createQueryBuilder("member")
      .select("member.groupId", "groupId")
      .addSelect("COUNT(*)", "count")
      .where("member.groupId IN (:...ids)", {
        ids: groups.map((group) => group.id),
      })
      .groupBy("member.groupId")
      .getRawMany<{ groupId: string; count: string }>();
    const countById = new Map(
      counts.map((row) => [row.groupId, Number(row.count)]),
    );
    return groups.map((group) => groupDto(group, countById.get(group.id) ?? 0));
  }

  async create(ownerId: string, input: CreateGroupInput): Promise<GroupDto> {
    const members = (input.members ?? []).map((member) => ({
      name: member.name,
      phoneLast4: member.phoneLast4 ?? null,
    }));
    if (
      new Set(members.map((member) => member.name)).size !== members.length &&
      !input.duplicatesConfirmed
    )
      throw new DomainHttpException("ROSTER_DUPLICATES_UNCONFIRMED");
    const groupType = input.groupType ?? null;
    const digest = createHash("sha256")
      .update(JSON.stringify({ name: input.name, groupType, members }))
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      const group = manager.getRepository(Group).create({
        id: randomUUID(),
        ownerId,
        name: input.name,
        groupType,
        creationKey: input.creationKey ?? null,
        creationDigest: input.creationKey ? digest : null,
        createdAt: new Date(),
      });
      // PostgreSQL's unique index serializes competing retries. Only the insert winner writes members.
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Group)
        .values(group)
        .orIgnore()
        .returning("id")
        .execute();
      if (!(inserted.raw as unknown[]).length) {
        const existing = input.creationKey
          ? await manager
              .getRepository(Group)
              .findOneBy({ ownerId, creationKey: input.creationKey })
          : null;
        if (!existing || existing.creationDigest !== digest)
          throw new DomainHttpException("GROUP_REGISTRATION_CONFLICT");
        return groupDto(
          existing,
          await manager
            .getRepository(GroupMember)
            .countBy({ groupId: existing.id }),
        );
      }
      if (members.length)
        await manager.getRepository(GroupMember).insert(
          members.map((member, position) => ({
            ...member,
            id: randomUUID(),
            groupId: group.id,
            position,
            createdAt: group.createdAt,
          })),
        );
      return groupDto(group, members.length);
    });
  }

  async get(ownerId: string, id: string): Promise<GroupDto> {
    const db = await this.database.connect();
    const group = await db.getRepository(Group).findOneBy({ id, ownerId });
    if (!group) throw new NotFoundException();
    return groupDto(
      group,
      await db.getRepository(GroupMember).countBy({ groupId: group.id }),
    );
  }

  async members(ownerId: string, id: string): Promise<GroupMemberDto[]> {
    const db = await this.database.connect();
    await this.assertOwned(ownerId, id, db.manager);
    return (
      await db
        .getRepository(GroupMember)
        .find({ where: { groupId: id }, order: { position: "ASC", id: "ASC" } })
    ).map(({ id: memberId, name, phoneLast4 }) => ({
      id: memberId,
      name,
      phoneLast4,
    }));
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
    return this.get(ownerId, id);
  }
}
