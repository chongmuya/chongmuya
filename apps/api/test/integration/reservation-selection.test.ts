import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { Notification } from "../../src/modules/notifications/entities/notification.entity.js";
import { ReservationNotificationsService } from "../../src/modules/reservations/reservation-notifications.service.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";
import { SolapiMessageGateway } from "../../src/modules/reservations/providers/solapi-message.gateway.js";
import { ConfigService } from "../../src/config/config.service.js";
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
  async function fixture(jar = owner) {
    const event = await json<{ id: string; version: number }>(
      await call("events", jar, "POST", {
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
      await call(`events/${event.id}/reservation-requests`, jar, "POST", input),
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
    "fake delivery sends one inquiry and only material replies and seat releases",
    async (t) => {
      const gateway = app.get(MessageGateway);
      const send = gateway.send.bind(gateway);
      const sent: string[] = [];
      t.mock.method(
        gateway,
        "send",
        async (...args: Parameters<MessageGateway["send"]>) => {
          sent.push(args[2]);
          return send(...args);
        },
      );
      const notices = app.get(NotificationsService);
      for (const scenario of [
        "held",
        "unanswered",
        "declined",
        "expired",
        "unheld",
      ] as const) {
        const f = await fixture();
        const inquiry = sent.splice(0);
        assert.equal(inquiry.length, 2);
        assert.equal(
          new Set(inquiry.map((text) => text.split("\n").at(-1))).size,
          2,
        );
        assert(inquiry.every((text) => /24명\n예약 문의.*답변/.test(text)));
        const [selected, other] = f.request.targets;
        const first = proposal(f.request);
        await replies.save(selected.id, principal, first, "sms-policy");
        await replies.save(selected.id, principal, first, "sms-policy");
        await replies.save(
          selected.id,
          principal,
          { ...first, requestKey: randomUUID(), expectedVersion: 1 },
          "sms-policy",
        );
        const note = {
          ...first,
          requestKey: randomUUID(),
          expectedVersion: 1,
          proposal: { ...first.proposal!, note: "메모 수정" },
        };
        await replies.save(selected.id, principal, note, "sms-policy");
        assert.equal(sent.length, 1);
        assert.match(sent[0], /매장 답변 확인/);
        await replies.save(
          selected.id,
          principal,
          {
            ...note,
            requestKey: randomUUID(),
            expectedVersion: 2,
            proposal: { ...note.proposal, minimumSpend: 50000 },
          },
          "sms-policy",
        );
        assert.equal(sent.length, 2);
        assert.match(sent[1], /답변 변경/);

        const oldClosure = proposal(f.request);
        if (scenario !== "unanswered") {
          await replies.save(
            other.id,
            principal,
            scenario === "declined"
              ? {
                  ...oldClosure,
                  kind: "DECLINE",
                  proposal: null,
                  expiresAt: null,
                  holdConfirmed: false,
                  reason: "좌석 없음",
                }
              : oldClosure,
            "sms-policy",
          );
          if (scenario === "expired")
            await db.manager.update(
              MerchantReplyRevision,
              { targetId: other.id },
              { expiresAt: new Date(Date.now() - 1000) },
            );
          if (scenario === "unheld")
            await db.manager.update(
              MerchantReplyRevision,
              { targetId: other.id },
              {
                snapshot: {
                  offered: oldClosure.proposal,
                  requested: f.request.snapshot,
                  holdConfirmed: false,
                },
              },
            );
        }
        sent.length = 0;
        const input = decide(await get(f.event.id), selected.id);
        await json(await call(input.url, owner, "POST", input.body), 201);
        const rows = await notices.messages(f.request.id, db.manager);
        assert.equal(
          rows.filter(
            (row) =>
              row.eventKey.includes(":STORE_SELECTED") &&
              row.recipientKey.startsWith("organizer:"),
          ).length,
          0,
        );
        assert.equal(sent.length, scenario === "held" ? 2 : 1);
        assert.equal(sent.filter((text) => /확정 전/.test(text)).length, 1);
        const released = sent.find((text) => text.includes("좌석 유지를 해제"));
        if (scenario === "held") {
          assert(released);
          const closedUrl = new URL(released.split("\n").at(-1)!);
          const original = inquiry.find((text) =>
            text.includes(`target=${other.id}`),
          )!;
          assert.equal(
            closedUrl.href,
            new URL(original.split("\n").at(-1)!).href,
          );
          const token = new URLSearchParams(closedUrl.hash.slice(1)).get(
            "token",
          );
          const closed = await json<{ closedState: string }>(
            await call(`merchant-replies/${other.id}/access`, "", "POST", {
              token,
            }),
          );
          assert.equal(closed.closedState, "OTHER_SELECTED");
        } else assert.equal(released, undefined);
        sent.length = 0;
      }
    },
  );

  await t.test(
    "different organizers selecting opposite A/B stores both commit with ordered PostgreSQL inbox locks",
    async () => {
      const accountIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const jar = await signup();
        const account = await json<{ id: string }>(await call("auth/me", jar));
        accountIds.push(account.id);
        await db.manager.update(
          Restaurant,
          { id: demoRestaurantIds[i] },
          { ownerAccountId: account.id },
        );
      }
      const left = await fixture(owner),
        right = await fixture(alien);
      for (const f of [left, right])
        for (const target of f.request.targets)
          await replies.save(
            target.id,
            principal,
            proposal(f.request),
            "cross-event",
          );
      const read = async (f: typeof left, jar: string) =>
        (
          await json<{ request: ReservationRequestDto }>(
            await call(`events/${f.event.id}/reservation-requests`, jar),
          )
        ).request;
      const a = await read(left, owner),
        b = await read(right, alien);
      const inputs = [
        decide(
          a,
          a.targets.find((t) => t.restaurantId === demoRestaurantIds[0])!.id,
        ),
        decide(
          b,
          b.targets.find((t) => t.restaurantId === demoRestaurantIds[1])!.id,
        ),
      ];
      const notices = app.get(NotificationsService),
        lock = notices.lockAccount.bind(notices);
      // These remain real PostgreSQL advisory locks. A short database delay
      // widens the overlap that formerly acquired A/B in opposite orders.
      notices.lockAccount = async (m, id) => {
        await lock(m, id);
        await m.query("SELECT pg_sleep(0.03)");
      };
      try {
        await Promise.all(
          inputs.map(async (input, i) =>
            json(
              await call(input.url, i ? alien : owner, "POST", input.body),
              201,
            ),
          ),
        );
        await Promise.all(
          inputs.map(async (input, i) =>
            json(
              await call(input.url, i ? alien : owner, "POST", input.body),
              201,
            ),
          ),
        );
        for (const q of [a, b]) {
          assert.equal(
            await db.manager.countBy(SelectedReservation, { requestId: q.id }),
            1,
          );
          const targets = await db.manager.findBy(RequestTarget, {
            requestId: q.id,
          });
          assert.equal(
            targets.filter((t) => t.candidateState === "SELECTED").length,
            1,
          );
          assert.equal(
            targets.filter((t) => t.candidateState === "OTHER_SELECTED").length,
            1,
          );
          assert.equal(
            await db.manager.countBy(NotificationFact, {
              requestId: q.id,
              kind: "STORE_SELECTED",
            }),
            2,
          );
          assert.equal(
            await db.manager.countBy(NotificationFact, {
              requestId: q.id,
              kind: "CANDIDATE_CLOSED",
            }),
            1,
          );
        }
        for (const id of accountIds)
          assert.equal(
            await db.manager.countBy(Notification, { accountId: id }),
            2,
          );
      } finally {
        notices.lockAccount = lock;
        for (const id of demoRestaurantIds.slice(0, 2))
          await db.manager.update(Restaurant, { id }, { ownerAccountId: null });
      }
    },
  );
  await t.test(
    "replacement recipient is snapshotted for selection and closure without changing original history",
    async () => {
      const f = await fixture();
      const replacements = new Map<string, { id: string; phone: string }>();
      for (const target of f.request.targets) {
        const contact = await db.manager.save(RestaurantContact, {
          id: randomUUID(),
          restaurantId: target.restaurantId,
          name: "새 담당자",
          phone: "01099998888",
          active: true,
          isPrimary: false,
          requestConsentAt: new Date(),
        });
        replacements.set(target.id, contact);
        await app
          .get(MessageDeliveryService)
          .changeRecipient(target.id, contact.id, "test", "담당자 교체", false);
        await replies.save(
          target.id,
          principal,
          proposal(f.request),
          "recipient",
        );
      }
      const q = await get(f.event.id),
        input = decide(q, q.targets[0].id);
      await json(await call(input.url, owner, "POST", input.body), 201);
      await json(await call(input.url, owner, "POST", input.body), 201);
      const notices = app.get(NotificationsService);
      const rows = (await notices.messages(q.id, db.manager)).filter(
        (r) =>
          r.recipientKey.startsWith("merchant:") ||
          r.recipientKey.startsWith("reservation:"),
      );
      assert.equal(rows.length, 2);
      for (const row of rows) {
        const id = row.recipientKey.startsWith("reservation:")
            ? q.targets[0].id
            : row.recipientKey.split(":")[1]!,
          contact = replacements.get(id)!;
        assert.equal(row.contactIdSnapshot, contact.id);
        assert.equal(row.phoneSnapshot, contact.phone);
        assert.equal(row.attempts, 1);
        assert.notEqual(row.status, "HELD");
        assert.notEqual(
          (await db.manager.findOneByOrFail(RequestTarget, { id })).contactId,
          contact.id,
        );
        await app.get(ReservationNotificationsService).dispatch(row.id);
        assert.equal(
          (
            await db.manager.findOneByOrFail(NotificationMessage, {
              id: row.id,
            })
          ).attempts,
          1,
        );
      }
    },
  );
  await t.test(
    "HTTP rejection retries explicitly, while transport uncertainty and delivery failures cannot resend",
    async (t) => {
      const f = await fixture(),
        notices = app.get(NotificationsService);
      const provider = new SolapiMessageGateway({
        environment: {
          solapiApiKey: "fake",
          solapiApiSecret: "fake",
          solapiSenderNumber: "0299999999",
          providerTimeoutMs: 100,
        },
      } as ConfigService);
      let mode = 403;
      const originalFetch = globalThis.fetch;
      t.mock.method(
        globalThis,
        "fetch",
        async (...args: Parameters<typeof fetch>) => {
          if (!String(args[0]).startsWith("https://api.solapi.com/"))
            return originalFetch(...args);
          if (mode === 0) throw new DOMException("timeout", "TimeoutError");
          if (mode === 200)
            return Response.json({
              failedMessageList: [],
              groupInfo: { groupId: "test" },
            });
          return new Response("", { status: mode });
        },
      );
      for (const code of [403, 429]) {
        mode = code;
        await db.transaction((m) =>
          notices.record(m, {
            eventKey: randomUUID(),
            kind: "STORE_SELECTED",
            eventId: f.event.id,
            requestId: f.request.id,
            revision: 1,
            accounts: [],
            messages: [
              {
                recipientKey: `organizer:${code}`,
                phone: "01000001234",
                text: "test",
                isDemo: true,
              },
            ],
          }),
        );
        const row = (await notices.messages(f.request.id, db.manager)).find(
          (r) => r.recipientKey === `organizer:${code}`,
        )!;

        const claimed = await notices.claim(row.id, false);
        await notices.settle(
          row.id,
          await provider.send(row.id, row.phoneSnapshot, "test"),
          claimed!.attempts,
        );
        assert.equal(
          (
            await db.manager.findOneByOrFail(NotificationMessage, {
              id: row.id,
            })
          ).failureStage,
          "SUBMISSION",
        );
        const retry = await notices.claim(row.id, false, {
          actor: "test",
          reason: "원인 해결",
        });
        assert.equal(retry!.attempts, 2);
        mode = code === 403 ? 200 : 0;
        await notices.settle(
          row.id,
          await provider.send(row.id, row.phoneSnapshot, "test", 2),
          2,
        );
        assert.equal(
          (
            await db.manager.findOneByOrFail(NotificationMessage, {
              id: row.id,
            })
          ).status,
          code === 403 ? "ACCEPTED" : "UNKNOWN",
        );
        await assert.rejects(
          notices.claim(row.id, false, {
            actor: "test",
            reason: "접수 또는 불명 재시도",
          }),
        );
        await notices.settle(
          row.id,
          { status: "FAILED", provider: "solapi", failureStage: "DELIVERY" },
          2,
        );
        await assert.rejects(
          notices.claim(row.id, false, { actor: "test", reason: "전달 실패" }),
        );
      }
    },
  );
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
      assert.equal(selected.notifications.length, 4);
      assert(selected.notifications.every((n) => n.status === "ACCEPTED"));
      assert.equal(
        (await call(winner.url, owner, "POST", winner.body)).status,
        201,
      );
      assert.equal((await get(f.event.id)).notifications.length, 4);
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
      assert.equal(
        (await replies.get(target.id, principal)).closedState,
        "EXPIRED",
      );
      assert.equal(
        (await db.manager.findOneByOrFail(RequestTarget, { id: target.id }))
          .candidateState,
        "OPEN",
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
