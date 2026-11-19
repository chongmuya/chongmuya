import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import {
  seedDemoRestaurants,
  demoRestaurantIds,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { MerchantRepliesService } from "../../src/modules/reservations/merchant-replies.service.js";
import { ReservationSelectionService } from "../../src/modules/reservations/reservation-selection.service.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";
import { MerchantReplyRevision } from "../../src/modules/reservations/entities/merchant-reply.entity.js";
import { SelectedReservation } from "../../src/modules/reservations/entities/selected-reservation.entity.js";
import { NotificationMessage } from "../../src/modules/notifications/entities/notification.entity.js";
import { MessageGateway } from "../../src/modules/reservations/providers/message.gateway.js";
import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import { MessageDelivery } from "../../src/modules/reservations/entities/message-delivery.entity.js";
import { NotificationFact } from "../../src/modules/notifications/entities/notification.entity.js";
import { In } from "typeorm";
import type { ReservationRequestDto } from "../../src/modules/reservations/dto/response/reservation-request.response.dto.js";
import type { MerchantReplyInput } from "../../src/modules/reservations/types/merchant-reply.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};

test("selection, reinquiry and durable notifications serialize competing commands and preserve old rounds", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  await seedDemoRestaurants(db);
  const owner = await signup(),
    alien = await signup();
  const replies = app.get(MerchantRepliesService),
    commands = app.get(ReservationSelectionService);
  const principal = {
    kind: "operator" as const,
    actor: "integration",
    method: "PHONE",
    confirmedAt: new Date().toISOString(),
    reason: "테스트 확인",
  };
  async function callResponse(eventId: string) {
    return call(`events/${eventId}/reservation-requests`, owner);
  }
  const get = async (eventId: string) =>
    (
      await json<{ request: ReservationRequestDto }>(
        await callResponse(eventId),
      )
    ).request;
  async function fixture() {
    const event = await json<{ id: string; version: number }>(
      await call("events", owner, "POST", {
        name: "선택 검증",
        creationKey: randomUUID(),
      }),
      201,
    );
    const input = {
      requestKey: randomUUID(),
      mode: "DIRECT",
      expectedEventVersion: event.version,
      restaurantIds: [demoRestaurantIds[0], demoRestaurantIds[1]],
      conditions: {
        startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        expectedGuests: 24,
        region: "건대입구",
        seating: "ANY",
        space: "ANY",
      },
      contact: { name: "테스트 총무", phone: "01000001234" },
    };
    const request = await json<ReservationRequestDto>(
      await call(
        `events/${event.id}/reservation-requests`,
        owner,
        "POST",
        input,
      ),
      201,
    );
    return { event, input, request };
  }
  function proposal(q: ReservationRequestDto, version = 0): MerchantReplyInput {
    return {
      requestKey: randomUUID(),
      expectedVersion: version,
      kind: "AVAILABLE",
      proposal: {
        startsAt: q.snapshot.startsAt,
        expectedGuests: 24,
        space: "ANY",
        seating: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
        usageTime: { kind: "UNLIMITED", minutes: null },
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reason: "",
      holdConfirmed: true,
    };
  }
  const decide = (
    q: ReservationRequestDto,
    targetId: string,
    action = "select",
    key = randomUUID(),
  ) => ({
    url: `events/${q.eventId}/reservation-requests/${q.id}/${action}`,
    body: {
      requestKey: key,
      targetId,
      revision: q.targets.find((t) => t.id === targetId)!.response!.revision,
      expectedVersion: q.version,
    },
  });
  await t.test(
    "different simultaneous selections produce one winner; retries, access and notifications stay isolated",
    async () => {
      const f = await fixture();
      for (const target of f.request.targets)
        await replies.save(
          target.id,
          principal,
          proposal(f.request),
          "selection",
        );
      const q = await get(f.event.id),
        inputs = q.targets.map((target) => decide(q, target.id));
      const results = await Promise.all(
        inputs.map((i) => call(i.url, owner, "POST", i.body)),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const winner = inputs[results.findIndex((r) => r.status === 201)];
      const selected = await get(f.event.id);
      assert.equal(selected.lifecycle, "SELECTED");
      assert.equal(selected.selection?.status, "PREPARING");
      assert.equal(
        await db.manager.countBy(SelectedReservation, { eventId: f.event.id }),
        1,
      );
      assert.equal(
        selected.targets.filter((t) => t.candidateState === "OTHER_SELECTED")
          .length,
        1,
      );
      assert.equal(selected.notifications.length, 5);
      assert(selected.notifications.every((n) => n.status === "ACCEPTED"));
      assert.equal(
        (await call(winner.url, owner, "POST", winner.body)).status,
        201,
      );
      assert.equal((await get(f.event.id)).notifications.length, 5);
      assert.equal(
        (
          await call(winner.url, owner, "POST", {
            ...winner.body,
            revision: 99,
          })
        ).status,
        409,
      );
      assert.equal(
        (await call(winner.url, alien, "POST", winner.body)).status,
        404,
      );
      assert.equal(
        (await call(`events/${f.event.id}/reservation-requests/${q.id}`, alien))
          .status,
        404,
      );
      for (const target of q.targets)
        await assert.rejects(
          replies.save(target.id, principal, proposal(q, 1), "selection"),
        );
      const event = await json<{ version: number }>(
        await call(`events/${f.event.id}`, owner),
      );
      assert.equal(
        (
          await call(`events/${f.event.id}`, owner, "PATCH", {
            expectedVersion: event.version,
            scheduledAt: new Date(Date.now() + 4 * 86400000).toISOString(),
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "reply edit and selection cannot silently select different conditions",
    async () => {
      const f = await fixture(),
        target = f.request.targets[0];
      await replies.save(target.id, principal, proposal(f.request), "edit");
      const q = await get(f.event.id),
        input = decide(q, target.id),
        edit = proposal(q, 1);
      edit.proposal!.note = "수정된 조건";
      const [accept, changed] = await Promise.allSettled([
        call(input.url, owner, "POST", input.body),
        replies.save(target.id, principal, edit, "edit"),
      ]);
      assert.equal(accept.status, "fulfilled");
      if (accept.status === "fulfilled" && accept.value.status === 201) {
        assert.equal(changed.status, "rejected");
        assert.equal(
          (await get(f.event.id)).selection!.snapshot.offered!.note,
          "",
        );
      } else {
        assert.equal(changed.status, "fulfilled");
        if (accept.status === "fulfilled")
          assert.equal(accept.value.status, 409);
      }
    },
  );
  await t.test(
    "expiry is authoritative even before sweep; repeated sweep emits one closure",
    async () => {
      const f = await fixture(),
        target = f.request.targets[0];
      await replies.save(target.id, principal, proposal(f.request), "expiry");
      const q = await get(f.event.id),
        input = decide(q, target.id);
      await db.manager.update(
        MerchantReplyRevision,
        { targetId: target.id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      const results = await Promise.all([
        call(input.url, owner, "POST", input.body),
        commands.expire(q.id),
        commands.expire(q.id),
      ]);
      assert.equal(results[0].status, 409);
      const expired = await get(f.event.id);
      assert.equal(expired.targets[0].candidateState, "EXPIRED");
      assert.equal(expired.canReinquire, false);
      assert.equal(
        await db.manager.countBy(NotificationFact, {
          requestId: q.id,
          kind: "PROPOSAL_EXPIRED",
        }),
        1,
      );
      await commands.closeUnanswered(
        expired.targets[1].id,
        "operator",
        "매장 연락 후 응답 불가 확인",
        false,
      );
      assert.equal((await get(f.event.id)).canReinquire, true);
    },
  );
  await t.test(
    "reinquiry commit and lost response retries preserve earlier revisions and block late writes",
    async () => {
      const f = await fixture();
      for (const target of f.request.targets)
        await replies.save(
          target.id,
          principal,
          {
            ...proposal(f.request),
            kind: "DECLINE",
            proposal: null,
            expiresAt: null,
            reason: "수용 불가",
            holdConfirmed: false,
          },
          "reinquiry",
        );
      const q = await get(f.event.id);
      assert(q.canReinquire);
      assert.equal(
        (await db.manager.findOneByOrFail(ReservationRequest, { id: q.id }))
          .closedAt,
        null,
        "GET is read only",
      );
      const event = await json<{ version: number }>(
        await call(`events/${f.event.id}`, owner),
      );
      const input = {
        ...f.input,
        requestKey: randomUUID(),
        expectedEventVersion: event.version,
        previousRequestId: q.id,
        expectedRequestVersion: q.version,
        updateEventSchedule: true,
        conditions: {
          ...f.input.conditions,
          startsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
          expectedGuests: 25,
        },
      };
      const url = `events/${f.event.id}/reservation-requests`;
      const rounds = await Promise.all([
        call(url, owner, "POST", input),
        call(url, owner, "POST", input),
      ]);
      const a = await json<ReservationRequestDto>(rounds[0], 201),
        b = await json<ReservationRequestDto>(rounds[1], 201);
      assert.equal(a.id, b.id);
      assert.equal(a.round, 2);
      assert.equal(
        await db.manager.countBy(ReservationRequest, { eventId: f.event.id }),
        2,
      );
      const old = await json<ReservationRequestDto>(
        await call(`${url}/${q.id}`, owner),
      );
      assert.equal(old.snapshot.startsAt, q.snapshot.startsAt);
      assert.equal(old.lifecycle, "CLOSED");
      assert.equal(
        (
          await call(url, owner, "POST", {
            ...input,
            conditions: { ...input.conditions, expectedGuests: 26 },
          })
        ).status,
        409,
      );
      await assert.rejects(
        replies.save(q.targets[0].id, principal, proposal(q, 1), "reinquiry"),
      );
      assert.equal((await get(f.event.id)).id, a.id);
      assert(
        (await get(f.event.id)).targets.every(
          (t) => t.candidateState === "AWAITING_REPLY",
        ),
      );
      const oldDelivery = await db.manager.findOneByOrFail(MessageDelivery, {
        targetId: q.targets[0].id,
      });
      await db.manager.update(
        MessageDelivery,
        { id: oldDelivery.id },
        { provider: "solapi" },
      );
      const beforeCurrent = await get(f.event.id);
      await app.get(MessageDeliveryService).applyReports([
        {
          provider: "solapi",
          deliveryId: oldDelivery.id,
          messageId: oldDelivery.providerMessageId!,
          status: "DELIVERED",
          statusCode: "4000",
          deliveryAttempt: oldDelivery.attempts,
        },
      ]);
      assert.deepEqual(
        await get(f.event.id),
        beforeCurrent,
        "late old-round callback cannot modify the new request",
      );
      assert.equal((await call(`${url}/${q.id}`, alien)).status, 404);
    },
  );
  await t.test(
    "a merchant reopening a decline races with reinquiry under the same event lock",
    async () => {
      const f = await fixture();
      for (const target of f.request.targets)
        await replies.save(
          target.id,
          principal,
          {
            requestKey: randomUUID(),
            expectedVersion: 0,
            kind: "DECLINE",
            reason: "불가",
            proposal: null,
            expiresAt: null,
            holdConfirmed: false,
          },
          "reopen",
        );
      const q = await get(f.event.id),
        e = await json<{ version: number }>(
          await call(`events/${f.event.id}`, owner),
        );
      const body = {
        ...f.input,
        requestKey: randomUUID(),
        previousRequestId: q.id,
        expectedRequestVersion: q.version,
        expectedEventVersion: e.version,
      };
      const [newRound, edit] = await Promise.allSettled([
        call(`events/${f.event.id}/reservation-requests`, owner, "POST", body),
        replies.save(q.targets[0].id, principal, proposal(q, 1), "reopen"),
      ]);
      assert.equal(newRound.status, "fulfilled");
      if (newRound.status === "fulfilled" && newRound.value.status === 201) {
        assert.equal(edit.status, "rejected");
        assert.equal((await get(f.event.id)).round, 2);
      } else {
        if (newRound.status === "fulfilled")
          assert.equal(newRound.value.status, 409);
        assert.equal(edit.status, "fulfilled");
        assert.equal((await get(f.event.id)).canReinquire, false);
      }
    },
  );
  await t.test(
    "organizer decline remains distinct from merchant decline; notification UNKNOWN preserves business success and deliveryStatus",
    async () => {
      const f = await fixture(),
        target = f.request.targets[0];
      const before = await db.manager.findOneByOrFail(RequestTarget, {
        id: target.id,
      });
      const send = t.mock.method(app.get(MessageGateway), "send", async () => ({
        status: "UNKNOWN" as const,
        provider: "fake" as const,
        errorCode: "TIMEOUT",
      }));
      await replies.save(target.id, principal, proposal(f.request), "unknown");
      assert.equal(
        (await db.manager.findOneByOrFail(RequestTarget, { id: target.id }))
          .deliveryStatus,
        before.deliveryStatus,
      );
      const q = await get(f.event.id),
        input = decide(q, target.id, "decline");
      assert.equal(
        (await call(input.url, owner, "POST", input.body)).status,
        201,
      );
      assert.equal(
        (await get(f.event.id)).targets[0].candidateState,
        "ORGANIZER_DECLINED",
      );
      assert.equal(
        (
          await db.manager.findOneByOrFail(MerchantReplyRevision, {
            targetId: target.id,
            revision: 1,
          })
        ).kind,
        "AVAILABLE",
      );
      const facts = await db.manager.findBy(NotificationFact, {
        requestId: q.id,
      });
      const rows = await db.manager.findBy(NotificationMessage, {
        eventKey: In(facts.map((f) => f.eventKey)),
      });
      assert(rows.every((r) => r.status === "UNKNOWN" && r.attempts === 1));
      const calls = send.mock.callCount();
      await call(input.url, owner, "POST", input.body);
      assert.equal(send.mock.callCount(), calls);
      send.mock.restore();
    },
  );
  const diff = await db.driver.createSchemaBuilder().log();
  assert.deepEqual(
    diff.upQueries.map((q) => q.query),
    [],
  );
});
