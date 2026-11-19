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
  UpdateEventParticipantInput,
} from "./dto/request/event-participants.request.dto.js";
import { normalizePersonName } from "../../common/validation/person-name.js";

@Injectable()
export class EventRosterService {
  constructor(
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
  async add(
    ownerId: string,
    eventId: string,
    input: AddEventParticipantsInput,
  ) {
    const members = input.members.map((p) => ({
      name: normalizePersonName(p.name),
      phoneLast4: p.phoneLast4 ?? null,
      label: p.label ?? null,
    }));
    const digest = createHash("sha256")
      .update(JSON.stringify(members))
      .digest("hex");
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const receipt = await manager.findOneBy(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== digest)
          throw new DomainHttpException("ROSTER_SAVE_CONFLICT");
        return { addedCount: receipt.addedCount };
      }
      const existing = await this.rows(eventId, manager);
      if (existing.length + members.length > 500)
        throw new DomainHttpException("ROSTER_LIMIT");
      const position = existing.reduce(
        (max, p) => Math.max(max, p.position + 1),
        0,
      );
      const createdAt = new Date();
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
      await manager.insert(EventRosterAddition, {
        eventId,
        requestKey: input.requestKey,
        digest,
        addedCount: members.length,
        createdAt,
      });
      return { addedCount: members.length };
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
      return copyGroupRoster(manager, eventId, members);
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
