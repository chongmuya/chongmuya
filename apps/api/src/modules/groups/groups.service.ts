import { AuthService } from "../auth/auth.service.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import {
  GroupMembership,
  GroupInvitation,
  GroupRosterEdit,
} from "./entities/group-membership.entity.js";
import type {
  InvitationInput,
  EditGroupMemberInput,
} from "./dto/request/membership.request.dto.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
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
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  // Public resource authorization boundary. A caller's transaction must supply its manager.
  async assertOwned(
    ownerId: string,
    id: string,
    manager: EntityManager,
  ): Promise<void> {
    const group = await this.lock(id, manager);
    if (group.ownerId !== ownerId) throw new NotFoundException();
  }

  async lock(id: string, manager: EntityManager) {
    const group = await manager.findOne(Group, {
      where: { id },
      ...(manager.queryRunner?.isTransactionActive
        ? { lock: { mode: "pessimistic_write" as const } }
        : {}),
    });
    if (!group) throw new NotFoundException();
    return group;
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
      .where("member.excludedAt IS NULL AND member.groupId IN (:...ids)", {
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
        creatorId: ownerId,
        version: 1,
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
              .findOneBy({ creatorId: ownerId, creationKey: input.creationKey })
          : null;
        if (!existing || existing.creationDigest !== digest)
          throw new DomainHttpException("GROUP_REGISTRATION_CONFLICT");
        await this.assertOwned(ownerId, existing.id, manager);
        return groupDto(
          existing,
          await manager
            .getRepository(GroupMember)
            .countBy({ groupId: existing.id, excludedAt: IsNull() }),
        );
      }
      await manager.insert(GroupMembership, {
        groupId: group.id,
        accountId: ownerId,
        role: "ADMIN",
        joinedAt: group.createdAt,
      });
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
        where: { groupId: id, excludedAt: IsNull() },
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
      await db
        .getRepository(GroupMember)
        .countBy({ groupId: group.id, excludedAt: IsNull() }),
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
      await manager.getRepository(GroupMember).find({
        where: { groupId: id, excludedAt: IsNull() },
        order: { position: "ASC", id: "ASC" },
      })
    ).map(({ id: memberId, name, phoneLast4, label, version }) => ({
      version,
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
    await db.transaction(async (m) => {
      await this.assertOwned(ownerId, id, m);
      await m.update(Group, { id }, { name: input.name });
    });
    return this.get(ownerId, id);
  }
  async membershipBasics(accountId: string) {
    const db = await this.database.connect();
    const memberships = await db.manager.find(GroupMembership, {
      where: { accountId },
    });
    return Promise.all(
      memberships.map(async (member) => {
        const group = await db.manager.findOneByOrFail(Group, {
          id: member.groupId,
        });
        return {
          id: group.id,
          name: group.name,
          groupType: group.groupType,
          role: member.role,
        };
      }),
    );
  }
  async membershipState(ownerId: string, id: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.assertOwned(ownerId, id, m);
      const group = await this.lock(id, m);
      const memberships = await m.find(GroupMembership, {
        where: { groupId: id },
        order: { joinedAt: "ASC" },
      });
      const accounts = [];
      for (const row of memberships) {
        try {
          const a = await this.auth.groupAccount(m, { id: row.accountId });
          accounts.push({
            id: a.id,
            name: a.name,
            email: a.email,
            role: row.role,
          });
        } catch (error) {
          if (
            !(error instanceof DomainHttpException) ||
            error.code !== "GROUP_TARGET_UNAVAILABLE"
          )
            throw error;
        }
      }
      const invitations = await m.find(GroupInvitation, {
        where: { groupId: id },
        order: { createdAt: "DESC" },
        take: 20,
      });
      return {
        version: group.version,
        ownerId: group.ownerId,
        accounts,
        invitations: invitations.map((r) => ({
          id: r.id,
          targetId: r.targetId,
          status: r.status,
          expiresAt: r.expiresAt,
        })),
      };
    });
  }
  async invite(ownerId: string, id: string, input: InvitationInput) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `group-invite:${ownerId}`, 20);
    return db.transaction(async (m) => {
      await this.assertOwned(ownerId, id, m);
      const target = await this.auth.groupAccount(m, { email: input.email });
      if (target.id === ownerId)
        throw new DomainHttpException("GROUP_TARGET_UNAVAILABLE");
      const tokenHash = createHash("sha256")
        .update(`group-invitation:${input.token}`)
        .digest("hex");
      const digest = createHash("sha256")
        .update(JSON.stringify({ id, target: target.id, tokenHash }))
        .digest("hex");
      const previous = await m.findOneBy(GroupInvitation, {
        actorId: ownerId,
        requestKey: input.requestKey,
      });
      if (previous) {
        if (previous.digest !== digest)
          throw new DomainHttpException("GROUP_HANDOVER_CONFLICT");
        return {
          id: previous.id,
          status: previous.status,
          expiresAt: previous.expiresAt,
        };
      }
      const row = await m.save(GroupInvitation, {
        id: randomUUID(),
        groupId: id,
        actorId: ownerId,
        targetId: target.id,
        requestKey: input.requestKey,
        digest,
        tokenHash,
        status: "PENDING",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        completedAt: null,
      });
      return { id: row.id, status: row.status, expiresAt: row.expiresAt };
    });
  }
  async invitation(
    accountId: string,
    id: string,
    token: string,
    accept = false,
  ) {
    const db = await this.database.connect();
    await consumeRequestLimit(
      db.manager,
      `group-invitation-link:${accountId}`,
      60,
    );
    return db.transaction(async (m) => {
      const seed = await m.findOneBy(GroupInvitation, { id });
      if (!seed) throw new DomainHttpException("GROUP_LINK_UNAVAILABLE");
      const group = await this.lock(seed.groupId, m);
      const row = await m.findOneOrFail(GroupInvitation, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      const hash = createHash("sha256")
        .update(`group-invitation:${token}`)
        .digest("hex");
      if (
        row.targetId !== accountId ||
        row.tokenHash !== hash ||
        row.status === "CANCELLED"
      )
        throw new DomainHttpException("GROUP_LINK_UNAVAILABLE");
      // Accepted links return only a completion receipt and never regain admin data.
      if (row.status === "ACCEPTED")
        return { id, status: row.status, completedAt: row.completedAt };
      if (row.expiresAt <= new Date() || row.actorId !== group.ownerId)
        throw new DomainHttpException("GROUP_LINK_UNAVAILABLE");
      await this.auth.groupAccount(m, { id: accountId });
      if (!accept)
        return {
          id,
          status: row.status,
          groupName: group.name,
          expiresAt: row.expiresAt,
        };
      await m
        .createQueryBuilder()
        .insert()
        .into(GroupMembership)
        .values({
          groupId: group.id,
          accountId,
          role: "MEMBER",
          joinedAt: new Date(),
        })
        .orIgnore()
        .execute();
      row.status = "ACCEPTED";
      row.completedAt = new Date();
      await m.save(row);
      return { id, status: row.status, completedAt: row.completedAt };
    });
  }
  async cancelInvitation(ownerId: string, groupId: string, id: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.assertOwned(ownerId, groupId, m);
      const row = await m.findOneBy(GroupInvitation, { id, groupId });
      if (!row) throw new NotFoundException();
      if (row.status === "ACCEPTED")
        throw new DomainHttpException("GROUP_HANDOVER_CONFLICT");
      row.status = "CANCELLED";
      await m.save(row);
      return { ok: true };
    });
  }
  async assertActiveMember(
    groupId: string,
    accountId: string,
    m: EntityManager,
  ) {
    if (!(await m.existsBy(GroupMembership, { groupId, accountId })))
      throw new DomainHttpException("GROUP_TARGET_UNAVAILABLE");
    return this.auth.groupAccount(m, { id: accountId });
  }
  async acceptManager(
    groupId: string,
    from: string,
    to: string,
    version: number,
    m: EntityManager,
  ) {
    const group = await this.lock(groupId, m);
    if (group.ownerId !== from || group.version !== version || from === to)
      throw new DomainHttpException("GROUP_HANDOVER_CONFLICT");
    await this.assertActiveMember(groupId, to, m);
    await m.update(
      GroupMembership,
      { groupId, accountId: from },
      { role: "MEMBER" },
    );
    await m.update(
      GroupMembership,
      { groupId, accountId: to },
      { role: "ADMIN" },
    );
    group.ownerId = to;
    group.version++;
    await m.save(group);
    return group.version;
  }
  async rosterCount(groupId: string, m: EntityManager) {
    return m.countBy(GroupMember, { groupId, excludedAt: IsNull() });
  }
  async editMember(
    ownerId: string,
    groupId: string,
    memberId: string,
    input: EditGroupMemberInput,
  ) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.assertOwned(ownerId, groupId, m);
      const digest = createHash("sha256")
        .update(JSON.stringify({ memberId, input }))
        .digest("hex");
      const old = await m.findOneBy(GroupRosterEdit, {
        groupId,
        actorId: ownerId,
        requestKey: input.requestKey,
      });
      if (old) {
        if (old.digest !== digest)
          throw new DomainHttpException("GROUP_HANDOVER_CONFLICT");
        return { ok: true };
      }
      const row = await m.findOneBy(GroupMember, {
        id: memberId,
        groupId,
        excludedAt: IsNull(),
      });
      if (!row || row.version !== input.expectedVersion)
        throw new DomainHttpException("ROSTER_MEMBER_CONFLICT");
      const beforeSnapshot = { ...row };
      const name = normalizePersonName(input.name);
      const others = (
        await m.find(GroupMember, { where: { groupId, excludedAt: IsNull() } })
      ).filter((r) => r.id !== memberId);
      if (!input.exclude)
        this.validateNames(
          [{ name, label: input.label }],
          others,
          input.duplicatesConfirmed,
        );
      Object.assign(row, {
        name,
        phoneLast4: input.phoneLast4 ?? null,
        label: input.label ?? null,
        version: row.version + 1,
        excludedAt: input.exclude ? new Date() : null,
      });
      await m.save(row);
      await m.insert(GroupRosterEdit, {
        groupId,
        actorId: ownerId,
        requestKey: input.requestKey,
        memberId,
        digest,
        beforeSnapshot,
        afterSnapshot: { ...row },
        createdAt: new Date(),
      });
      return { ok: true };
    });
  }
}
