import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { Group } from "../../src/modules/groups/entities/group.entity.js";
import { GroupMember } from "../../src/modules/groups/entities/group-member.entity.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { EventParticipant } from "../../src/modules/events/entities/event-participant.entity.js";
import { AttendanceRound } from "../../src/modules/events/entities/attendance-round.entity.js";
import { AttendanceResponse } from "../../src/modules/events/entities/attendance-response.entity.js";
import { EventSettlement } from "../../src/modules/settlements/entities/settlement.entity.js";
import {
  initialSettlement,
  type Expense,
} from "../../src/modules/settlements/types/settlement.js";
import type {
  EventSummaryDto,
  MemberHistoryDto,
} from "../../src/modules/settlements/dto/response/event-summary.response.dto.js";

const json = async <T>(response: Response, status = 200) => {
  const body: unknown = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
};

test("summary batches and member history use current authority, final attendance and explicit IDs over all pages", async (t) => {
  const { db, signup, call } = await startResourceApplication(t);
  const owner = await signup();
  const other = await signup();
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "이력 검증 모임",
      creationKey: randomUUID(),
      members: [
        { name: "동명이인", phoneLast4: "0012", label: "첫 번째" },
        { name: "동명이인", phoneLast4: "0012", label: "두 번째" },
      ],
      duplicatesConfirmed: true,
    }),
    201,
  );
  const storedGroup = await db.manager.findOneByOrFail(Group, { id: group.id });
  const members = await db.manager.find(GroupMember, {
    where: { groupId: group.id },
    order: { position: "ASC" },
  });
  const events: Event[] = [];
  for (let index = 0; index < 21; index++) {
    const event = await db.manager.save(
      db.manager.create(Event, {
        id: randomUUID(),
        ownerId: storedGroup.ownerId,
        creatorId: storedGroup.ownerId,
        groupId: group.id,
        name: `연결 행사 ${index + 1}`,
        scheduledAt: new Date(
          `2026-11-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
        ),
        createdAt: new Date(),
        creationKey: null,
        creationDigest: null,
      }),
    );
    events.push(event);
    const linked = await db.manager.save(
      db.manager.create(EventParticipant, {
        id: randomUUID(),
        eventId: event.id,
        groupMemberId: members[0]!.id,
        name: "과거 이름",
        phoneLast4: "0012",
        label: "첫 번째",
        position: 0,
        createdAt: new Date(),
      }),
    );
    const round = await db.manager.save(
      db.manager.create(AttendanceRound, {
        id: randomUUID(),
        eventId: event.id,
        title: "1차",
        position: 0,
        shareId: randomUUID(),
        requestKey: randomUUID(),
        createdAt: new Date(),
      }),
    );
    const person = {
      id: linked.id,
      name: linked.name,
      phoneLast4: linked.phoneLast4,
      label: linked.label,
      version: linked.version,
    };
    const expense: Expense = {
      id: randomUUID(),
      roundId: round.id,
      name: "분담 내역",
      total: 100,
      deposit: 0,
      includeDeposit: true,
      support: 0,
      reservationId: null,
      memo: "",
      payers: [person],
      remainder: null,
      fileIds: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    const state = initialSettlement();
    state.expenses = [expense];
    state.version = 1;
    state.calculationVersion = 1;
    if (index < 3) {
      await db.manager.save(
        db.manager.create(AttendanceResponse, {
          eventId: event.id,
          roundId: round.id,
          participantId: linked.id,
          selfAnswer: index === 2 ? null : "ATTENDING",
          managerOverride:
            index === 1 ? "ABSENT" : index === 2 ? "ATTENDING" : null,
        }),
      );
    }
    if (index === 0) {
      const secondRound = await db.manager.save(
        db.manager.create(AttendanceRound, {
          id: randomUUID(),
          eventId: event.id,
          title: "2차",
          position: 1,
          shareId: randomUUID(),
          requestKey: randomUUID(),
          createdAt: new Date(),
        }),
      );
      await db.manager.save(
        db.manager.create(AttendanceResponse, {
          eventId: event.id,
          roundId: secondRound.id,
          participantId: linked.id,
          selfAnswer: "ATTENDING",
          managerOverride: null,
        }),
      );
      for (const [groupMemberId, amount, position] of [
        [members[1]!.id, 400, 1],
        [null, 700, 2],
      ] as const) {
        const sameName = await db.manager.save(
          db.manager.create(EventParticipant, {
            id: randomUUID(),
            eventId: event.id,
            groupMemberId,
            name: "동명이인",
            phoneLast4: "0012",
            label: null,
            position,
            createdAt: new Date(),
          }),
        );
        state.expenses.push({
          ...expense,
          id: randomUUID(),
          total: amount,
          payers: [
            {
              id: sameName.id,
              name: sameName.name,
              label: null,
              phoneLast4: "0012",
              version: 1,
            },
          ],
        });
      }
      state.expenses.push({
        ...expense,
        id: randomUUID(),
        total: 900,
        deletedAt: new Date().toISOString(),
      });
      state.payments.push({
        id: randomUUID(),
        participant: person,
        kind: "RECEIPT",
        amount: 50,
        corrects: null,
        reason: "일부 입금 확인",
        actorId: storedGroup.ownerId,
        at: new Date().toISOString(),
        calculationVersion: 1,
      });
    }
    await db.manager.save(
      db.manager.create(EventSettlement, { eventId: event.id, state }),
    );
  }

  const summariesPath = `settlements/summaries?eventIds=${events.map((e) => e.id).join(",")}`;
  const summaries = await json<EventSummaryDto[]>(
    await call(summariesPath, owner),
  );
  assert.equal(summaries.length, 21);
  const first = summaries.find((summary) => summary.eventId === events[0]!.id)!;
  assert.equal(first.participantCount, 3);
  assert.equal(first.roundCount, 2);
  assert.equal(first.attendingCount, 1);
  assert.equal(first.reservation, null);
  assert.equal(first.inquiry, null);
  assert.equal(first.expectedGuests, null);
  assert.equal(first.region, null);
  assert.equal(first.settlement.total, 1200);
  assert.equal(first.settlement.unconfirmed, 3);
  assert.doesNotMatch(
    JSON.stringify(summaries),
    /phoneLast4|bank|payments|notices|과거 이름/,
  );
  assert.equal((await call(summariesPath, other)).status, 404);
  assert.equal((await call(summariesPath)).status, 401);
  for (const query of [
    "",
    "?eventIds=",
    "?eventIds=invalid",
    `?eventIds=${events[0]!.id},${events[0]!.id}`,
    `?eventIds=${Array.from({ length: 101 }, () => randomUUID()).join(",")}`,
  ])
    assert.equal(
      (await call(`settlements/summaries${query}`, owner)).status,
      400,
    );
  assert.equal(
    (
      await call(
        `settlements/summaries?eventIds=${events[0]!.id},${randomUUID()}`,
        owner,
      )
    ).status,
    404,
  );

  const historyPath = `groups/${group.id}/members/${members[0]!.id}/history`;
  const history = await json<MemberHistoryDto>(await call(historyPath, owner));
  const next = await json<MemberHistoryDto>(
    await call(`${historyPath}?offset=20`, owner),
  );
  assert.equal(history.count, 21);
  assert.equal(history.events.length, 20);
  assert.equal(next.events.length, 1);
  assert.equal(history.attendedEventCount, 2);
  assert.equal(next.attendedEventCount, 2);
  assert.equal(history.contributionTotal, 2100);
  assert.equal(next.contributionTotal, 2100);
  assert.equal(next.events[0]!.contributionAmount, 100);
  const sameName = await json<MemberHistoryDto>(
    await call(`groups/${group.id}/members/${members[1]!.id}/history`, owner),
  );
  assert.equal(sameName.count, 1);
  assert.equal(sameName.attendedEventCount, 0);
  assert.equal(sameName.contributionTotal, 400);
  assert.equal((await call(historyPath, other)).status, 404);
  assert.equal((await call(historyPath)).status, 401);
  assert.equal((await call(`${historyPath}?offset=-1`, owner)).status, 400);
  await db.manager.update(
    GroupMember,
    { id: members[0]!.id },
    { excludedAt: new Date() },
  );
  assert.equal(
    (await json<MemberHistoryDto>(await call(historyPath, owner)))
      .contributionTotal,
    2100,
  );
  const lastState = await db.manager.findOneByOrFail(EventSettlement, {
    eventId: events[20]!.id,
  });
  lastState.state.expenses[0]!.total = 300;
  await db.manager.save(lastState);
  assert.equal(
    (await json<MemberHistoryDto>(await call(historyPath, owner)))
      .contributionTotal,
    2300,
  );
});
