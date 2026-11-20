import { NotificationsService } from "../notifications/notifications.service.js";
import { copyGroupRoster } from "./lib/copy-group-roster.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { EventsService } from "./events.service.js";
import { EventParticipant } from "./entities/event-participant.entity.js";
import { EventRosterAddition } from "./entities/event-roster-addition.entity.js";
import { participantDto } from "./lib/attendance-rules.js";
import type {
  AddEventParticipantsInput,
  ImportSelectedGroupMembersInput,
  UpdateEventParticipantInput,
  RosterPersonChoice,
} from "./dto/request/event-participants.request.dto.js";
import { normalizePersonName } from "../../common/validation/person-name.js";

const normalizeChoices = (members: RosterPersonChoice[]) =>
  members.map((p) => ({
    name: normalizePersonName(p.name),
    phoneLast4: p.phoneLast4 ?? null,
    label: p.label ?? null,
    existingParticipantId: p.existingParticipantId ?? null,
    newPersonConfirmed: p.newPersonConfirmed ?? false,
  }));

@Injectable()
export class EventRosterService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
  ) {}
  private async rows(eventId: string, manager: EntityManager) {
    return manager.find(EventParticipant, {
      where: { eventId },
      order: { position: "ASC", id: "ASC" },
    });
  }
  async list(ownerId: string, eventId: string) {
    const db = await this.database.connect();
    await this.events.assertOwned(ownerId, eventId, db.manager);
    return (await this.rows(eventId, db.manager)).map(participantDto);
  }
  private async appendDirect(
    manager: EntityManager,
    eventId: string,
    choices: ReturnType<typeof normalizeChoices>,
    input: Pick<
      AddEventParticipantsInput,
      "expectedRoster" | "duplicatesConfirmed"
    >,
    reviewedRoster?: EventParticipant[],
  ) {
    const existing = await this.rows(eventId, manager);
    const reviewed = reviewedRoster ?? existing;
    const versions = (rows: { id: string; version: number }[]) =>
      JSON.stringify(
        rows
          .map(({ id, version }) => ({ id, version }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
    if (
      input.expectedRoster &&
      versions(input.expectedRoster) !== versions(reviewed)
    )
      throw new DomainHttpException("ROSTER_MEMBER_CONFLICT");
    for (const row of choices) {
      const match = reviewed.find((p) => p.id === row.existingParticipantId);
      if (
        row.existingParticipantId &&
        (!input.expectedRoster ||
          !match ||
          match.name !== row.name ||
          match.phoneLast4 !== row.phoneLast4 ||
          match.label !== row.label)
      )
        throw new DomainHttpException("ROSTER_MEMBER_CONFLICT");
      if (
        !row.existingParticipantId &&
        existing.some((p) => p.name === row.name) &&
        (!input.expectedRoster || !row.newPersonConfirmed)
      )
        throw new DomainHttpException("ROSTER_DUPLICATES_UNCONFIRMED");
    }
    const members = choices
      .filter((p) => !p.existingParticipantId)
      .map(({ name, phoneLast4, label }) => ({ name, phoneLast4, label }));
    if (
      new Set(members.map((p) => p.name)).size !== members.length &&
      !input.duplicatesConfirmed
    )
      throw new DomainHttpException("ROSTER_DUPLICATES_UNCONFIRMED");
    if (members.length && existing.length + members.length > 500)
      throw new DomainHttpException("ROSTER_LIMIT");
    const position = existing.reduce(
      (max, p) => Math.max(max, p.position + 1),
      0,
    );
    const createdAt = new Date();
    if (members.length)
      await manager.insert(
        EventParticipant,
        members.map((p, i) => ({
          ...p,
          id: randomUUID(),
          eventId,
          groupMemberId: null,
          position: position + i,
          version: 1,
          identityVersion: 1,
          createdAt,
        })),
      );
    return {
      addedCount: members.length,
      totalCount: existing.length + members.length,
    };
  }
  async add(
    ownerId: string,
    eventId: string,
    input: AddEventParticipantsInput,
  ) {
    const choices = normalizeChoices(input.members);
    const digest = createHash("sha256")
      .update(
        JSON.stringify(
          input.expectedRoster === undefined &&
            input.duplicatesConfirmed === undefined &&
            input.members.every(
              (p) =>
                p.existingParticipantId === undefined &&
                p.newPersonConfirmed === undefined,
            )
            ? choices.map(({ name, phoneLast4, label }) => ({
                name,
                phoneLast4,
                label,
              }))
            : {
                choices,
                expectedRoster: input.expectedRoster ?? null,
                duplicatesConfirmed: input.duplicatesConfirmed ?? false,
              },
        ),
      )
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      const event = await this.events.assertOwned(
        ownerId,
        eventId,
        manager,
        true,
      );
      const receipt = await manager.findOneBy(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== digest)
          throw new DomainHttpException("ROSTER_SAVE_CONFLICT");
        return { addedCount: receipt.addedCount };
      }
      const result = await this.appendDirect(manager, eventId, choices, input);
      const createdAt = new Date();
      await manager.insert(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
        digest,
        addedCount: result.addedCount,
        createdAt,
      });
      if (result.addedCount)
        await this.notifications.record(manager, {
          eventKey: `roster:${eventId}:${input.requestKey}`,
          kind: "MEMBERS_ADDED",
          category: "EVENT",
          eventId,
          requestId: input.requestKey,
          revision: result.totalCount,
          accounts: [
            {
              id: ownerId,
              title: "행사에 새 구성원이 추가됐어요",
              summary: `${event.name} · ${result.addedCount}명이 추가됐어요.`,
              destination: `/events?event=${eventId}&view=roster`,
            },
          ],
          messages: [],
        });
      return { addedCount: result.addedCount };
    });
  }
  async importGroup(ownerId: string, eventId: string) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      const event = await this.events.assertOwned(
        ownerId,
        eventId,
        manager,
        true,
      );
      if (!event.groupId) throw new DomainHttpException("EVENT_GROUP_REQUIRED");
      const members = await this.groups.membersInTransaction(
        ownerId,
        event.groupId,
        manager,
        true,
      );
      const result = await copyGroupRoster(manager, eventId, members);
      if (result.addedCount)
        await this.notifications.record(manager, {
          eventKey: `roster-import:${eventId}:${createHash("sha256")
            .update(JSON.stringify(members.map((r) => r.id).sort()))
            .digest("hex")}`,
          kind: "MEMBERS_ADDED",
          category: "EVENT",
          eventId,
          requestId: eventId,
          revision: members.length,
          accounts: [
            {
              id: ownerId,
              title: "행사에 새 구성원이 추가됐어요",
              summary: `${event.name} · ${result.addedCount}명이 추가됐어요.`,
              destination: `/events?event=${eventId}&view=roster`,
            },
          ],
          messages: [],
        });
      return result;
    });
  }
  async importSelectedGroup(
    ownerId: string,
    eventId: string,
    input: ImportSelectedGroupMembersInput,
  ) {
    const selected = [...input.members].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const direct = normalizeChoices(input.directMembers ?? []);
    if (!selected.length && !direct.length)
      throw new DomainHttpException("VALIDATION_FAILED");
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          kind: "IMPORT_SELECTED_GROUP",
          selected,
          ...(input.directMembers !== undefined ||
          input.expectedRoster !== undefined ||
          input.duplicatesConfirmed !== undefined
            ? {
                direct,
                expectedRoster: input.expectedRoster ?? null,
                duplicatesConfirmed: input.duplicatesConfirmed ?? false,
              }
            : {}),
        }),
      )
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      // assertOwned locks the actual group before its event and rechecks ownership.
      const event = await this.events.assertOwned(
        ownerId,
        eventId,
        manager,
        true,
      );
      if (!event.groupId) throw new DomainHttpException("EVENT_GROUP_REQUIRED");
      const receipt = await manager.findOneBy(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== digest)
          throw new DomainHttpException("ROSTER_SAVE_CONFLICT");
        return { addedCount: receipt.addedCount };
      }
      const members = await this.groups.membersInTransaction(
        ownerId,
        event.groupId,
        manager,
      );
      const byId = new Map(members.map((member) => [member.id, member]));
      const chosen = selected.map(({ id, version }) => {
        const member = byId.get(id);
        if (!member || member.version !== version)
          throw new DomainHttpException("ROSTER_MEMBER_CONFLICT");
        return member;
      });
      const reviewedRoster = await this.rows(eventId, manager);
      const copied = await copyGroupRoster(manager, eventId, chosen);
      const appended = await this.appendDirect(
        manager,
        eventId,
        direct,
        input,
        reviewedRoster,
      );
      const result = { addedCount: copied.addedCount + appended.addedCount };
      await manager.insert(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
        digest,
        addedCount: result.addedCount,
        createdAt: new Date(),
      });
      if (result.addedCount)
        await this.notifications.record(manager, {
          eventKey: `roster-import-selected:${eventId}:${input.requestKey}`,
          kind: "MEMBERS_ADDED",
          category: "EVENT",
          eventId,
          requestId: input.requestKey,
          revision: appended.totalCount,
          accounts: [
            {
              id: ownerId,
              title: "행사에 새 구성원이 추가됐어요",
              summary: `${event.name} · ${result.addedCount}명이 추가됐어요.`,
              destination: `/events?event=${eventId}&view=roster`,
            },
          ],
          messages: [],
        });
      return result;
    });
  }
  async update(
    ownerId: string,
    eventId: string,
    id: string,
    input: UpdateEventParticipantInput,
  ) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const p = await manager.findOneBy(EventParticipant, { id, eventId });
      if (!p) throw new NotFoundException();
      if (p.version !== input.expectedVersion)
        throw new DomainHttpException("ATTENDANCE_CONFLICT");
      const name = normalizePersonName(input.name),
        phone = input.phoneLast4 ?? null;
      if (p.name !== name || p.phoneLast4 !== phone) p.identityVersion++;
      p.name = name;
      p.phoneLast4 = phone;
      p.label = input.label ?? null;
      p.version++;
      return participantDto(await manager.save(p));
    });
  }
}
