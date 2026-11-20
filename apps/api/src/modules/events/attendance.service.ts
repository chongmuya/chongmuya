import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { normalizePersonName } from "../../common/validation/person-name.js";
import { GroupsService } from "../groups/groups.service.js";
import { EventsService } from "./events.service.js";
import { Event } from "./entities/event.entity.js";
import { EventParticipant } from "./entities/event-participant.entity.js";
import { AttendanceRound } from "./entities/attendance-round.entity.js";
import { AttendanceResponse } from "./entities/attendance-response.entity.js";
import { AttendanceReview } from "./entities/attendance-review.entity.js";
import {
  identifyAttendance,
  participantDto,
  responseDto,
} from "./lib/attendance-rules.js";
import {
  issueAttendanceAccess,
  readAttendanceAccess,
  type AttendanceAccess,
} from "./lib/attendance-access.js";
import type {
  CreateRoundInput,
  OpenAttendanceInput,
  SaveAttendanceInput,
  SetAttendanceInput,
  ResolveAttendanceInput,
} from "./dto/request/attendance.request.dto.js";
import type {
  RoundDto,
  RoundDetailDto,
  PublicAttendanceInfo,
  PublicAttendanceAccess,
} from "./dto/response/attendance.response.dto.js";
import type { AttendanceAnswer } from "./types/attendance.js";

// Per-round 15-minute DB windows permit 100 shared-NAT participants.
// Name-scoped guessing limits are separate from successful write limits.
export const ATTENDANCE_LIMITS = {
  infoIp: 600,
  openIp: 600,
  openIdentity: 20,
  saveIp: 600,
  saveIdentity: 20,
} as const;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
  ) {}
  private async round(eventId: string, id: string, manager: EntityManager) {
    const row = await manager.findOneBy(AttendanceRound, { id, eventId });
    if (!row) throw new NotFoundException();
    return row;
  }
  private async detail(
    row: AttendanceRound,
    manager: EntityManager,
  ): Promise<RoundDetailDto> {
    const participants = await manager.find(EventParticipant, {
      where: { eventId: row.eventId },
      order: { position: "ASC", id: "ASC" },
    });
    const responses = await manager.findBy(AttendanceResponse, {
      roundId: row.id,
    });
    const reviews = await manager.find(AttendanceReview, {
      where: { roundId: row.id },
      order: { submittedAt: "DESC", id: "ASC" },
    });
    const byId = new Map(responses.map((r) => [r.participantId, r]));
    const rows = participants.map((p) => ({
      ...participantDto(p),
      response: responseDto(byId.get(p.id)),
    }));
    return {
      id: row.id,
      eventId: row.eventId,
      title: row.title,
      position: row.position,
      shareId: row.shareId,
      closedAt: row.closedAt?.toISOString() ?? null,
      counts: {
        attending: rows.filter((p) => p.response.finalState === "ATTENDING")
          .length,
        absent: rows.filter((p) => p.response.finalState === "ABSENT").length,
        unanswered: rows.filter((p) => p.response.finalState === "UNANSWERED")
          .length,
        pending: reviews.filter((r) => r.status === "PENDING").length,
      },
      participants: rows,
      reviews: reviews.map((r) => ({
        id: r.id,
        name: r.name,
        phoneLast4: r.phoneLast4,
        answer: r.answer,
        reason: r.reason,
        status: r.status,
        version: r.version,
        submittedAt: r.submittedAt.toISOString(),
        participantId: r.participantId,
        processedAt: r.processedAt?.toISOString() ?? null,
        resolution: r.resolution,
      })),
    };
  }
  async list(
    ownerId: string,
    eventId: string,
  ): Promise<{ rounds: RoundDto[]; nextTitle: string }> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager);
      const rounds = await manager.find(AttendanceRound, {
        where: { eventId },
        order: { position: "ASC" },
      });
      const totals: {
        id: string;
        attending: number;
        absent: number;
        unanswered: number;
        pending: number;
      }[] = await manager.query(
        `SELECT r.id, COALESCE(s.attending,0)::int AS attending,
          COALESCE(s.absent,0)::int AS absent,
          ((SELECT count(*) FROM event_participants WHERE event_id=$1)
            - COALESCE(s.attending,0) - COALESCE(s.absent,0))::int AS unanswered,
          COALESCE(p.pending,0)::int AS pending
        FROM attendance_rounds r
        LEFT JOIN (
          SELECT round_id,
            count(*) FILTER (WHERE COALESCE(manager_override,self_answer)='ATTENDING') AS attending,
            count(*) FILTER (WHERE COALESCE(manager_override,self_answer)='ABSENT') AS absent
          FROM attendance_responses WHERE event_id=$1 GROUP BY round_id
        ) s ON s.round_id=r.id
        LEFT JOIN (
          SELECT round_id,count(*) AS pending FROM attendance_reviews
          WHERE event_id=$1 AND status='PENDING' GROUP BY round_id
        ) p ON p.round_id=r.id WHERE r.event_id=$1`,
        [eventId],
      );
      const counts = new Map(totals.map(({ id, ...value }) => [id, value]));
      const results: RoundDto[] = rounds.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        title: r.title,
        position: r.position,
        shareId: r.shareId,
        closedAt: r.closedAt?.toISOString() ?? null,
        counts: counts.get(r.id)!,
      }));
      return {
        rounds: results,
        nextTitle: `${Math.max(0, ...rounds.map((r) => r.position)) + 1}차`,
      };
    });
  }
  async get(ownerId: string, eventId: string, roundId: string) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager);
      return this.detail(await this.round(eventId, roundId, manager), manager);
    });
  }
  async create(ownerId: string, eventId: string, input: CreateRoundInput) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const existing = await manager.findOneBy(AttendanceRound, {
        eventId,
        requestKey: input.requestKey,
      });
      if (existing) {
        if (existing.title !== input.title)
          throw new DomainHttpException("ATTENDANCE_CONFLICT");
        return this.detail(existing, manager);
      }
      const rounds = await manager.findBy(AttendanceRound, { eventId });
      const row = manager.create(AttendanceRound, {
        id: randomUUID(),
        eventId,
        title: input.title,
        position: Math.max(0, ...rounds.map((r) => r.position)) + 1,
        shareId: randomUUID(),
        requestKey: input.requestKey,
        closedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      });
      await manager.insert(AttendanceRound, row);
      return this.detail(row, manager);
    });
  }
  async close(ownerId: string, eventId: string, roundId: string) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const row = await this.round(eventId, roundId, manager);
      if (!row.closedAt) {
        row.closedAt = new Date();
        await manager.save(row);
      }
      return this.detail(row, manager);
    });
  }
  private async publicScope(
    shareId: string,
    manager: EntityManager,
    lock = false,
  ) {
    const found = await manager.findOneBy(AttendanceRound, { shareId });
    if (!found || found.revokedAt) throw new NotFoundException();
    if (lock) await this.events.lockReservationEvent(found.eventId, manager);
    const event = await manager.findOne(Event, {
      where: { id: found.eventId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!event) throw new NotFoundException();
    const round = await this.round(event.id, found.id, manager);
    if (round.revokedAt) throw new NotFoundException();
    return { round, event };
  }
  async publicInfo(shareId: string, ip: string): Promise<PublicAttendanceInfo> {
    const db = await this.database.connect();
    await consumeRequestLimit(
      db.manager,
      `attendance:info:ip:${shareId}:${ip}`,
      ATTENDANCE_LIMITS.infoIp,
    );
    const { round, event } = await this.publicScope(shareId, db.manager);
    return {
      eventName: event.name,
      roundTitle: round.title,
      scheduledAt: event.scheduledAt?.toISOString() ?? null,
      closed: !!round.closedAt,
    };
  }
  private async decision(
    event: Event,
    name: string,
    phone: string,
    manager: EntityManager,
  ) {
    const people = await manager.findBy(EventParticipant, {
      eventId: event.id,
    });
    const group = event.groupId
      ? await this.groups.membersInTransaction(
          event.ownerId,
          event.groupId,
          manager,
          true,
        )
      : [];
    return identifyAttendance(people, group, name, phone);
  }
  private sign(
    roundId: string,
    name: string,
    phoneLast4: string,
    p?: EventParticipant,
  ) {
    return issueAttendanceAccess(
      {
        roundId,
        name,
        phoneLast4,
        participantId: p?.id ?? null,
        identityVersion: p?.identityVersion ?? null,
      },
      this.config.environment.authSecret,
    );
  }
  async open(
    shareId: string,
    input: OpenAttendanceInput,
    ip: string,
  ): Promise<PublicAttendanceAccess> {
    const db = await this.database.connect();
    const name = normalizePersonName(input.name);
    await consumeRequestLimit(
      db.manager,
      `attendance:open:ip:${shareId}:${ip}`,
      ATTENDANCE_LIMITS.openIp,
    );
    await consumeRequestLimit(
      db.manager,
      `attendance:guess:${shareId}:${ip}:${name}`,
      30,
    );
    await consumeRequestLimit(
      db.manager,
      `attendance:open:identity:${shareId}:${name}:${input.phoneLast4}`,
      ATTENDANCE_LIMITS.openIdentity,
    );
    return db.transaction(async (manager) => {
      const { event, round } = await this.publicScope(shareId, manager, true);
      if (round.closedAt) throw new DomainHttpException("ATTENDANCE_CLOSED");
      const decision = await this.decision(
        event,
        name,
        input.phoneLast4,
        manager,
      );
      const p = "participant" in decision ? decision.participant : undefined;
      return {
        kind: decision.kind,
        reason: decision.kind === "REVIEW" ? decision.reason : null,
        accessToken:
          decision.kind === "MISMATCH"
            ? null
            : this.sign(round.id, name, input.phoneLast4, p),
        response:
          decision.kind === "DIRECT"
            ? responseDto(
                await manager.findOneBy(AttendanceResponse, {
                  roundId: round.id,
                  participantId: decision.participant.id,
                }),
              )
            : null,
      };
    });
  }
  private async writeSelf(
    round: AttendanceRound,
    p: EventParticipant,
    answer: AttendanceAnswer,
    manager: EntityManager,
  ) {
    const response =
      (await manager.findOneBy(AttendanceResponse, {
        roundId: round.id,
        participantId: p.id,
      })) ??
      manager.create(AttendanceResponse, {
        roundId: round.id,
        participantId: p.id,
        eventId: round.eventId,
        selfAnswer: null,
        managerOverride: null,
        version: 0,
        selfRespondedAt: null,
        overriddenAt: null,
      });
    response.selfAnswer = answer;
    response.selfRespondedAt = new Date();
    response.version++;
    return manager.save(response);
  }
  async save(shareId: string, input: SaveAttendanceInput, ip: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(
      db.manager,
      `attendance:save:ip:${shareId}:${ip}`,
      ATTENDANCE_LIMITS.saveIp,
    );
    const access: AttendanceAccess = readAttendanceAccess(
      input.accessToken,
      this.config.environment.authSecret,
    );
    await consumeRequestLimit(
      db.manager,
      `attendance:save:identity:${shareId}:${access.name}:${access.phoneLast4}`,
      ATTENDANCE_LIMITS.saveIdentity,
    );
    return db.transaction(async (manager) => {
      // Every attendance/roster write locks this event before reading identity or response.
      const { event, round } = await this.publicScope(shareId, manager, true);
      if (access.roundId !== round.id)
        throw new DomainHttpException("ATTENDANCE_ACCESS_INVALID");
      if (round.closedAt) throw new DomainHttpException("ATTENDANCE_CLOSED");
      const decision = await this.decision(
        event,
        access.name,
        access.phoneLast4,
        manager,
      );
      if (decision.kind === "MISMATCH")
        throw new DomainHttpException("ATTENDANCE_MISMATCH");
      if (decision.kind === "REVIEW") {
        const review =
          (await manager.findOneBy(AttendanceReview, {
            roundId: round.id,
            name: access.name,
            phoneLast4: access.phoneLast4,
            status: "PENDING",
          })) ??
          manager.create(AttendanceReview, {
            id: randomUUID(),
            eventId: event.id,
            roundId: round.id,
            name: access.name,
            phoneLast4: access.phoneLast4,
            status: "PENDING",
            version: 0,
            participantId: null,
            processedAt: null,
            resolution: null,
          });
        review.answer = input.answer;
        review.reason = decision.reason;
        review.submittedAt = new Date();
        review.version++;
        await manager.save(review);
        return {
          kind: "REVIEW" as const,
          response: null,
          accessToken: this.sign(round.id, access.name, access.phoneLast4),
        };
      }
      const p = decision.participant;
      if (
        access.participantId &&
        (access.participantId !== p.id ||
          access.identityVersion !== p.identityVersion)
      )
        throw new DomainHttpException("ATTENDANCE_IDENTITY_CHANGED");
      if (decision.kind === "FIRST") {
        p.phoneLast4 = access.phoneLast4;
        p.version++;
        p.identityVersion++;
        await manager.save(p);
      }
      const response = await this.writeSelf(round, p, input.answer, manager);
      return {
        kind: "SAVED" as const,
        response: responseDto(response),
        accessToken: this.sign(round.id, access.name, access.phoneLast4, p),
      };
    });
  }
  async setOverride(
    ownerId: string,
    eventId: string,
    roundId: string,
    participantId: string,
    input: SetAttendanceInput,
  ) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const round = await this.round(eventId, roundId, manager);
      if (
        !(await manager.existsBy(EventParticipant, {
          id: participantId,
          eventId,
        }))
      )
        throw new NotFoundException();
      const row =
        (await manager.findOneBy(AttendanceResponse, {
          roundId,
          participantId,
        })) ??
        manager.create(AttendanceResponse, {
          roundId,
          participantId,
          eventId,
          selfAnswer: null,
          managerOverride: null,
          version: 0,
          selfRespondedAt: null,
          overriddenAt: null,
        });
      if (row.version !== input.expectedVersion)
        throw new DomainHttpException("ATTENDANCE_CONFLICT");
      row.managerOverride = input.managerOverride;
      row.overriddenAt = new Date();
      row.version++;
      await manager.save(row);
      return this.detail(round, manager);
    });
  }
  async resolve(
    ownerId: string,
    eventId: string,
    roundId: string,
    id: string,
    input: ResolveAttendanceInput,
  ) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      await this.events.assertOwned(ownerId, eventId, manager, true);
      const round = await this.round(eventId, roundId, manager);
      const review = await manager.findOneBy(AttendanceReview, {
        id,
        eventId,
        roundId,
      });
      if (!review) throw new NotFoundException();
      if (review.status !== "PENDING") return this.detail(round, manager);
      if (review.version !== input.expectedReviewVersion)
        throw new DomainHttpException("ATTENDANCE_REVIEW_CONFLICT");
      if (input.action === "EXCLUDE") {
        review.status = "EXCLUDED";
        review.resolution = "EXCLUDE";
      } else {
        let p: EventParticipant;
        if (input.action === "NEW") {
          const existing = await manager.findBy(EventParticipant, { eventId });
          if (existing.length >= 500)
            throw new DomainHttpException("ROSTER_LIMIT");
          p = manager.create(EventParticipant, {
            id: randomUUID(),
            eventId,
            groupMemberId: null,
            name: review.name,
            phoneLast4: review.phoneLast4,
            label: null,
            version: 1,
            identityVersion: 1,
            position: existing.reduce((n, p) => Math.max(n, p.position + 1), 0),
            createdAt: new Date(),
          });
          await manager.insert(EventParticipant, p);
        } else {
          const found = await manager.findOneBy(EventParticipant, {
            id: input.participantId!,
            eventId,
          });
          if (!found) throw new NotFoundException();
          p = found;
          if (p.version !== input.expectedParticipantVersion)
            throw new DomainHttpException("ATTENDANCE_REVIEW_CONFLICT");
          if (p.phoneLast4 !== null && p.phoneLast4 !== review.phoneLast4)
            throw new DomainHttpException("ATTENDANCE_PHONE_CONFLICT");
        }
        const response = await manager.findOneBy(AttendanceResponse, {
          roundId,
          participantId: p.id,
        });
        if (
          input.action === "LINK" &&
          (response?.version ?? 0) !== input.expectedResponseVersion
        )
          throw new DomainHttpException("ATTENDANCE_REVIEW_CONFLICT");
        if (response?.selfAnswer && !input.responseChoice)
          throw new DomainHttpException("ATTENDANCE_CHOICE_REQUIRED");
        if (p.phoneLast4 === null) {
          p.phoneLast4 = review.phoneLast4;
          p.version++;
          p.identityVersion++;
          await manager.save(p);
        }
        const choice = response?.selfAnswer ? input.responseChoice! : "APPLY";
        if (choice === "APPLY")
          await this.writeSelf(round, p, review.answer, manager);
        review.status = "LINKED";
        review.participantId = p.id;
        review.resolution = choice;
      }
      review.processedAt = new Date();
      review.version++;
      await manager.save(review);
      return this.detail(round, manager);
    });
  }
}
