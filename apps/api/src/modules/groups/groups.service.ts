import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import {
  normalizePersonName,
  personNamePattern,
} from "../../common/validation/person-name.js";
import { DatabaseService } from "../../database/database.service.js";
import { Group } from "./entities/group.entity.js";
import { GroupRosterAddition } from "./entities/group-roster-addition.entity.js";
import type { AddGroupMembersInput } from "./dto/request/add-group-members.request.dto.js";
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

  async getLabel(
    ownerId: string,
    id: string,
    manager: EntityManager,
  ): Promise<{ name: string; groupType: string | null }> {
    const group = await manager.getRepository(Group).findOneBy({ id, ownerId });
    if (!group) throw new NotFoundException();
    return { name: group.name, groupType: group.groupType };
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
      name: normalizePersonName(member.name),
      phoneLast4: member.phoneLast4 ?? null,
      ...(member.label ? { label: member.label } : {}),
    }));
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
      this.validateNames(members, [], input.duplicatesConfirmed);
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

  private validateNames(
    members: { name: string; label?: string | null }[],
    existing: { name: string; label: string | null }[],
    confirmed?: boolean,
  ) {
    const byName = new Map<string, number>();
    for (const member of [...existing, ...members]) {
      const name = normalizePersonName(member.name);
      byName.set(name, (byName.get(name) ?? 0) + 1);
    }
    for (const member of members) {
      if (!personNamePattern.test(member.name))
        throw new DomainHttpException("VALIDATION_FAILED");
      if (byName.get(normalizePersonName(member.name))! <= 1) continue;
      if (!confirmed)
        throw new DomainHttpException("ROSTER_DUPLICATES_UNCONFIRMED");
    }
  }

  async addMembers(ownerId: string, id: string, input: AddGroupMembersInput) {
    const rows = input.members.map((row) => ({
      name: normalizePersonName(row.name),
      phoneLast4: row.phoneLast4 ?? null,
      label: row.label ?? null,
      existingMemberId: row.existingMemberId ?? null,
    }));
    const digest = createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      // All additions lock the owned group before reading its members or retry receipt.
      const group = await manager.findOne(Group, {
        where: { id, ownerId },
        lock: { mode: "pessimistic_write" },
      });
      if (!group) throw new NotFoundException();
      const existing = await manager.find(GroupMember, {
        where: { groupId: id },
      });
      const receipt = await manager.findOneBy(GroupRosterAddition, {
        groupId: id,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== digest)
          throw new DomainHttpException("GROUP_REGISTRATION_CONFLICT");
        return {
          group: groupDto(group, existing.length),
          addedCount: receipt.addedCount,
        };
      }
      const members = rows.filter((row) => !row.existingMemberId);
      for (const row of rows) {
        if (!row.existingMemberId) continue;
        const match = existing.find(
          (member) => member.id === row.existingMemberId,
        );
        // Selecting an existing member is an explicit no-op, never a profile update.
        if (
          !match ||
          match.name !== row.name ||
          match.phoneLast4 !== row.phoneLast4 ||
          match.label !== row.label
        )
          throw new DomainHttpException("ROSTER_MEMBER_CONFLICT");
      }
      this.validateNames(members, existing, input.duplicatesConfirmed);
      const position = existing.reduce(
        (max, row) => Math.max(max, row.position + 1),
        0,
      );
      const createdAt = new Date();
      if (members.length)
        await manager.insert(
          GroupMember,
          members.map(({ name, phoneLast4, label }, index) => ({
            id: randomUUID(),
            groupId: id,
            name,
            phoneLast4,
            label,
            position: position + index,
            createdAt,
          })),
        );
      await manager.insert(GroupRosterAddition, {
        groupId: id,
        requestKey: input.requestKey,
        digest,
        addedCount: members.length,
        createdAt,
      });
      return {
        group: groupDto(group, existing.length + members.length),
        addedCount: members.length,
      };
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
    return this.membersInTransaction(ownerId, id, db.manager);
  }

  async membersInTransaction(
    ownerId: string,
    id: string,
    manager: EntityManager,
    lock = false,
  ): Promise<GroupMemberDto[]> {
    const group = await manager.findOne(Group, {
      where: { id, ownerId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!group) throw new NotFoundException();
    return (
      await manager
        .getRepository(GroupMember)
        .find({ where: { groupId: id }, order: { position: "ASC", id: "ASC" } })
    ).map(({ id: memberId, name, phoneLast4, label }) => ({
      id: memberId,
      label,
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
