import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { EventsService } from "../events/events.service.js";
import { CalendarService } from "../calendar/calendar.service.js";
import { FilesService } from "../files/files.service.js";
import { SettlementsService } from "../settlements/settlements.service.js";
import { FavoritesService } from "../favorites/favorites.service.js";
import { ReservationHandoverService } from "../reservations/reservation-handover.service.js";
import { GroupHandover } from "./entities/group-handover.entity.js";
import type {
  HandoverInput,
  AcceptHandoverInput,
} from "./dto/request/handover.request.dto.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const receipt = (r: GroupHandover) => ({
  id: r.id,
  status: r.status,
  completedAt: r.completedAt,
});
const unavailable = () => new DomainHttpException("GROUP_LINK_UNAVAILABLE");
const conflict = () => new DomainHttpException("GROUP_HANDOVER_CONFLICT");
@Injectable()
export class HandoversService {
  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
    private readonly events: EventsService,
    private readonly calendar: CalendarService,
    private readonly files: FilesService,
    private readonly settlements: SettlementsService,
    private readonly favorites: FavoritesService,
    private readonly reservations: ReservationHandoverService,
  ) {}
  private async scope(groupId: string, m: EntityManager) {
    const ids = (await this.events.groupEvents(groupId, m)).map((e) => e.id);
    return {
      roster: await this.groups.rosterCount(groupId, m),
      events: ids.length,
      ...(await this.settlements.handoverCounts(ids, m)),
      files: await this.files.handoverCount(ids, m),
      favorites: await this.favorites.count(groupId, m),
      ongoingReservations: await this.reservations.ongoing(ids, m),
    };
  }
  async preview(ownerId: string, groupId: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.groups.assertOwned(ownerId, groupId, m);
      const group = await this.groups.lock(groupId, m);
      const requests = await m.find(GroupHandover, {
        where: { groupId },
        order: { createdAt: "DESC" },
        take: 20,
      });
      return {
        group: { id: group.id, name: group.name, version: group.version },
        scope: await this.scope(groupId, m),
        requests: requests.map((r) => ({
          ...receipt(r),
          targetId: r.toId,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
        })),
      };
    });
  }
  async create(ownerId: string, groupId: string, input: HandoverInput) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `handover-create:${ownerId}`, 20);
    return db.transaction(async (m) => {
      await this.groups.assertOwned(ownerId, groupId, m);
      const group = await this.groups.lock(groupId, m);
      const digest = hash({ groupId, ...input });
      const old = await m.findOneBy(GroupHandover, {
        fromId: ownerId,
        requestKey: input.requestKey,
      });
      if (old) {
        if (old.digest !== digest) throw conflict();
        return { ...receipt(old), expiresAt: old.expiresAt };
      }
      if (group.version !== input.expectedVersion || ownerId === input.targetId)
        throw conflict();
      await this.groups.assertActiveMember(groupId, input.targetId, m);
      const pending = await m.findOneBy(GroupHandover, {
        groupId,
        status: "PENDING",
      });
      if (pending) {
        if (pending.expiresAt > new Date()) throw conflict();
        pending.status = "EXPIRED";
        await m.save(pending);
      }
      const row = await m.save(GroupHandover, {
        id: randomUUID(),
        groupId,
        fromId: ownerId,
        toId: input.targetId,
        groupVersion: group.version,
        requestKey: input.requestKey,
        digest,
        tokenHash: hash(["group-handover", input.token]),
        status: "PENDING",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        completedAt: null,
        acceptedBy: null,
        acceptKey: null,
        acceptDigest: null,
        completedVersion: null,
      });
      return { ...receipt(row), expiresAt: row.expiresAt };
    });
  }
  async cancel(ownerId: string, groupId: string, id: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.groups.assertOwned(ownerId, groupId, m);
      const row = await m.findOneBy(GroupHandover, {
        id,
        groupId,
        fromId: ownerId,
      });
      if (!row || row.status === "ACCEPTED") throw conflict();
      row.status = "CANCELLED";
      await m.save(row);
      return receipt(row);
    });
  }
  async incoming(accountId: string, id: string, token: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `handover-link:${accountId}`, 60);
    return db.transaction(async (m) => {
      const row = await m.findOneBy(GroupHandover, { id });
      if (
        !row ||
        row.toId !== accountId ||
        row.tokenHash !== hash(["group-handover", token])
      )
        throw unavailable();
      const group = await this.groups.lock(row.groupId, m);
      if (
        row.status !== "PENDING" ||
        row.expiresAt <= new Date() ||
        group.ownerId !== row.fromId ||
        group.version !== row.groupVersion
      )
        throw unavailable();
      await this.groups.assertActiveMember(group.id, accountId, m);
      return {
        id,
        group: { id: group.id, name: group.name, version: group.version },
        scope: await this.scope(group.id, m),
        expiresAt: row.expiresAt,
      };
    });
  }
  async accept(accountId: string, id: string, input: AcceptHandoverInput) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `handover-accept:${accountId}`, 60);
    const result = await db.transaction(async (m) => {
      const seed = await m.findOneBy(GroupHandover, { id });
      if (!seed) throw unavailable();
      await this.groups.lock(seed.groupId, m);
      const row = await m.findOneOrFail(GroupHandover, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      const digest = hash({ id, ...input });
      if (
        row.toId !== accountId ||
        row.tokenHash !== hash(["group-handover", input.token])
      )
        throw unavailable();
      if (row.status === "ACCEPTED") {
        if (
          row.acceptedBy !== accountId ||
          row.acceptKey !== input.requestKey ||
          row.acceptDigest !== digest
        )
          throw conflict();
        return { receipt: receipt(row), requests: [] as string[] };
      }
      if (
        row.status !== "PENDING" ||
        row.expiresAt <= new Date() ||
        row.groupVersion !== input.expectedVersion
      )
        throw conflict();
      const target = await this.groups.assertActiveMember(
        row.groupId,
        accountId,
        m,
      );
      // One atomic commit: roles, manager, resource authorization, current contact and audit.
      const version = await this.groups.acceptManager(
        row.groupId,
        row.fromId,
        row.toId,
        row.groupVersion,
        m,
      );
      const events = await this.events.transferGroup(
        row.groupId,
        row.fromId,
        row.toId,
        m,
      );
      await this.calendar.transferGroup(row.groupId, row.fromId, row.toId, m);
      const requests = await this.reservations.transfer(
        events.map((e) => e.id),
        row.fromId,
        target,
        id,
        m,
      );
      row.status = "ACCEPTED";
      row.completedAt = new Date();
      row.acceptedBy = accountId;
      row.acceptKey = input.requestKey;
      row.acceptDigest = digest;
      row.completedVersion = version;
      await m.save(row);
      return { receipt: receipt(row), requests };
    });
    await this.reservations.dispatch(result.requests);
    return result.receipt;
  }
}
