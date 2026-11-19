import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import {
  seedDemoRestaurants,
  demoRestaurantIds,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { MerchantRepliesService } from "../../src/modules/reservations/merchant-replies.service.js";
import { ReservationCompletionService } from "../../src/modules/reservations/reservation-completion.service.js";
import { ReservationPaymentsService } from "../../src/modules/reservations/reservation-payments.service.js";
import { ReservationChangesService } from "../../src/modules/reservations/reservation-changes.service.js";
import { ReservationAccessService } from "../../src/modules/reservations/reservation-access.service.js";
import {
  ReservationManagementLink,
  ReservationCompletionHistory,
} from "../../src/modules/reservations/entities/reservation-progress.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { NotificationFact } from "../../src/modules/notifications/entities/notification.entity.js";
import type { ReservationRequestDto } from "../../src/modules/reservations/dto/response/reservation-request.response.dto.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
test("reservation completion preserves contracts, scoped links, money evidence and concurrent decisions", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  await seedDemoRestaurants(db);
  const organizer = await signup(),
    alien = await signup();
  const completion = app.get(ReservationCompletionService),
    payments = app.get(ReservationPaymentsService),
    changes = app.get(ReservationChangesService),
    access = app.get(ReservationAccessService);
  const operator = {
    kind: "operator" as const,
    actor: "integration",
    confirmer: "테스트 사장",
    method: "PHONE" as const,
    confirmedAt: new Date().toISOString(),
    reason: "격리 테스트 확인",
  };
  const key = (version: number) => ({
    requestKey: randomUUID(),
    expectedVersion: version,
  });
  type View = Awaited<ReturnType<ReservationCompletionService["get"]>>;
  // Preserve the actual fetch result rather than passing a Promise as a Response.
  const view = async (id: string) =>
    json<View>(await call(`reservations/${id}`, organizer));
  const post = async (
    id: string,
    action: string,
    input: unknown,
    status = 200,
  ) =>
    json<View>(
      await call(`reservations/${id}/${action}`, organizer, "POST", {
        command: input,
      }),
      status,
    );
  async function fixture(kind: "NONE" | "UNKNOWN" = "NONE") {
    const event = await json<{ id: string; version: number }>(
      await call("events", organizer, "POST", {
        creationKey: randomUUID(),
        name: "PR2 통합",
      }),
      201,
    );
    const q = await json<ReservationRequestDto>(
      await call(`events/${event.id}/reservation-requests`, organizer, "POST", {
        requestKey: randomUUID(),
        mode: "DIRECT",
        expectedEventVersion: event.version,
        restaurantIds: [demoRestaurantIds[0]],
        conditions: {
          startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
          expectedGuests: 20,
          region: "건대입구",
          seating: "ANY",
          space: "ANY",
        },
        contact: { name: "총무", phone: "01000001234" },
      }),
      201,
    );
    await app.get(MerchantRepliesService).save(
      q.targets[0].id,
      operator,
      {
        requestKey: randomUUID(),
        expectedVersion: 0,
        kind: "AVAILABLE",
        proposal: {
          startsAt: q.snapshot.startsAt,
          expectedGuests: 20,
          seating: "ANY",
          space: "ANY",
          minimumSpend: null,
          separateFee: null,
          deposit: { kind, amount: kind === "NONE" ? 0 : null },
          menuDeadlineAt: null,
          note: "",
          changeCancellationPolicy: "매장과 합의 후 처리",
        },
        reason: "",
        holdConfirmed: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      "pr2",
    );
    const latest = (
      await json<{ request: ReservationRequestDto }>(
        await call(`events/${event.id}/reservation-requests`, organizer),
      )
    ).request;
    const chosen = await json<ReservationRequestDto>(
      await call(
        `events/${event.id}/reservation-requests/${q.id}/select`,
        organizer,
        "POST",
        { ...key(latest.version), targetId: q.targets[0].id, revision: 1 },
      ),
      201,
    );
    return view(chosen.selection!.id);
  }
  const menu = (v: View) => ({
    ...key(v.version),
    catalogVersion: v.catalog.version,
    items: [
      {
        id: v.catalog.menus.find((m) => m.price !== null && m.available)!.id,
        quantity: 2,
      },
    ],
    guidanceRevision: v.guidance.revision,
    confirmed: true,
  });
  const guide = (v: View, channel: "SMS" | "WEB" = "SMS") => ({
    ...key(v.version),
    kind: "REQUIRED",
    amount: 10000,
    deadline: new Date(Date.now() + 3600000).toISOString(),
    channel,
    bank: "테스트은행",
    account: "123-TEST-SECRET",
    holder: "가짜매장",
    policy: "합의 후 환불",
    webConsent: channel === "WEB",
  });
  await t.test(
    "mandatory menu, unknown price, draft recovery, snapshot and exact request retry",
    async () => {
      let v = await fixture();
      const draft = {
        ...key(v.version),
        catalogVersion: v.catalog.version,
        items: [{ id: v.catalog.menus[0].id, quantity: 0 }],
      };
      v = await post(v.id, "menu-draft", draft);
      assert.equal(v.draft!.items[0].quantity, 0);
      assert.equal(v.status, "PREPARING");
      const bad = { ...menu(v), items: [] };
      await post(v.id, "menu-submit", bad, 409);
      const submit = menu(v),
        before = v.catalog.menus.find((m) => m.id === submit.items[0].id)!;
      await db.manager.update(
        RestaurantMenu,
        { id: before.id },
        { price: null },
      );
      await post(v.id, "menu-submit", submit, 409);
      await db.manager.update(
        RestaurantMenu,
        { id: before.id },
        { price: before.price },
      );
      const results = await Promise.all([
        post(v.id, "menu-submit", submit),
        post(v.id, "menu-submit", submit),
      ]);
      v = results[0];
      assert.equal(v.status, "CONFIRMED");
      assert.equal(v.order!.lines[0].price, before.price);
      await db.manager.update(
        RestaurantMenu,
        { id: before.id },
        { price: before.price! + 100 },
      );
      assert.equal((await view(v.id)).order!.lines[0].price, before.price);
      await db.manager.update(
        RestaurantMenu,
        { id: before.id },
        { price: before.price },
      );
      assert.equal(
        await db.manager.countBy(ReservationCompletionHistory, {
          reservationId: v.id,
          action: "MENU_SUBMITTED",
        }),
        1,
      );
      assert.equal(
        await db.manager.countBy(NotificationFact, {
          reservationId: v.id,
          eventKey: `${v.id}:CONFIRMED:${v.version}`,
        }),
        1,
      );
    },
  );
  await t.test(
    "unknown guidance blocks completion; SMS hides account; reports are not receipt; receipt then menu confirms once",
    async () => {
      let v = await fixture("UNKNOWN");
      await post(v.id, "menu-submit", menu(v), 409);
      const input = guide(v);
      v = await payments.guidance(v.id, operator, input);
      const visible = await view(v.id);
      assert.equal(visible.guidance.account, "");
      assert(!JSON.stringify(visible).includes("123-TEST-SECRET"));
      v = await post(v.id, "transfer", {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        payer: "총무",
        amount: 10000,
      });
      assert.equal(v.status, "PREPARING");
      assert.equal(v.receivedAmount, 0);
      v = await payments.receipt(v.id, operator, {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 10000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "은행 대조",
      });
      assert.equal(v.status, "PREPARING");
      v = await post(v.id, "menu-submit", menu(v));
      assert.equal(v.status, "CONFIRMED");
      assert.equal(v.confirmation!.receivedAmount, 10000);
      const correction = {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 5000,
        receivedAt: new Date().toISOString(),
        corrects: v.receipt!.id,
        reason: "잘못 읽은 내역 정정",
      };
      v = await payments.receipt(v.id, operator, correction);
      assert.equal(v.status, "CHECK_REQUIRED");
      assert(v.confirmation);
      assert.equal(v.receipt!.corrects, correction.corrects);
    },
  );
  await t.test(
    "late and mismatched report requires explicit merchant review, never automatic cancellation",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, {
        ...guide(v, "WEB"),
        deadline: new Date(Date.now() - 1000).toISOString(),
      });
      v = await post(v.id, "menu-submit", {
        ...menu(v),
        transfer: { payer: "늦은 총무", amount: 12000 },
      });
      assert.equal(v.status, "PREPARING");
      v = await payments.receipt(v.id, operator, {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 12000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "초과 입금 대조",
      });
      assert.notEqual(v.status, "CONFIRMED");
      assert(v.issues.includes("AMOUNT_REVIEW"));
      v = await payments.resolve(v.id, operator, {
        ...key(v.version),
        reason: "초과분 보관과 지연 진행을 양측 확인",
      });
      assert.equal(v.status, "CONFIRMED");
      assert.equal(v.receivedAmount, 12000);
    },
  );
  await t.test(
    "management capability is separate, scoped, revocable and access expiration remains separate",
    async () => {
      const v = await fixture();
      const link = await db.manager.findOneByOrFail(ReservationManagementLink, {
        reservationId: v.id,
      });
      const raw = new URL(access.url(link)).hash.slice(7);
      const exchanged = await access.exchange(v.id, raw, "local");
      assert(
        Date.parse(exchanged.accessExpiresAt) <=
          Date.parse(exchanged.linkExpiresAt),
      );
      const principal = {
        kind: "link" as const,
        access: exchanged.accessToken,
      };
      assert.equal((await completion.get(v.id, principal)).id, v.id);
      assert.equal((await call(`reservations/${v.id}`, alien)).status, 404);
      assert.equal(
        (await call(`reservation-management/${v.id}`, "", "GET")).status,
        403,
      );
      await assert.rejects(
        app.get(MerchantRepliesService).get(v.targetId, principal),
      );
      const other = await fixture();
      await assert.rejects(completion.get(other.id, principal));
      await completion.manageLink(v.id, operator, {
        ...key(v.version),
        operation: "REVOKE",
      });
      await assert.rejects(completion.get(v.id, principal));
      const { RestaurantContact } =
        await import("../../src/modules/restaurants/entities/restaurant-contact.entity.js");
      const former = await db.manager.findOneByOrFail(RestaurantContact, {
        id: link.contactId,
      });
      const replacement = await db.manager.save(RestaurantContact, {
        ...former,
        id: randomUUID(),
        isPrimary: false,
        name: "교체 담당",
        phone: "01000009876",
      });
      const updated = await completion.get(v.id, operator);
      await completion.manageLink(v.id, operator, {
        ...key(updated.version),
        operation: "ISSUE",
        contactId: replacement.id,
      });
      await assert.rejects(completion.get(v.id, principal));
      const fresh = await db.manager.findOneByOrFail(
        ReservationManagementLink,
        { reservationId: v.id },
      );
      assert.equal(fresh.generation, 2);
      assert.equal(fresh.contactId, replacement.id);
      assert.equal(fresh.phoneSnapshot, replacement.phone);
      const evidence = await db.manager.findOneByOrFail(
        ReservationCompletionHistory,
        { reservationId: v.id, version: updated.version + 1 },
      );
      assert.equal(
        (evidence.evidence.previousLink as { contactId: string }).contactId,
        former.id,
      );
      await db.manager.delete(RestaurantContact, { id: replacement.id });
      await db.manager.update(
        ReservationManagementLink,
        { reservationId: v.id },
        { expiresAt: new Date(Date.now() - 1) },
      );
      await assert.rejects(
        access.exchange(
          v.id,
          new URL(access.url(fresh)).hash.slice(7),
          "expired",
        ),
      );
    },
  );
  await t.test(
    "change request leaves agreement unchanged until accepted; cancellation and actual refunds remain separate",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      v = await payments.receipt(v.id, operator, {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 10000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "확인",
      });
      v = await post(v.id, "menu-submit", menu(v));
      const original = v.agreement;
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CHANGE",
        subject: "GUESTS",
        reason: "인원 변경",
      });
      assert.deepEqual(v.agreement, original);
      await post(
        v.id,
        "change-request",
        { ...key(v.version), kind: "CANCEL", subject: "OTHER", reason: "중복" },
        409,
      );
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "18명 합의 제안",
        agreement: { ...v.agreement, expectedGuests: 18 },
        refundExpected: null,
      });
      assert.equal(v.agreement.expectedGuests, 20);
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      assert.equal(v.agreement.expectedGuests, 18);
      assert.equal(v.selectionSnapshot.offered!.expectedGuests, 20);
      assert.equal(v.progress, "CHECK_REQUIRED");
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CANCEL",
        subject: "OTHER",
        reason: "취소 협의",
      });
      assert.equal(v.cancellation, null);
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "전액 환불 합의",
        refundExpected: 10000,
      });
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      assert.equal(v.status, "CANCELLED");
      assert.equal(v.progress, "REFUND_PENDING");
      assert.equal(v.refundedAmount, 0);
      const refund = {
        ...key(v.version),
        amount: 6000,
        refundedAt: new Date().toISOString(),
        reason: "실제 반환 확인",
      };
      await Promise.all([
        changes.refund(v.id, operator, refund),
        changes.refund(v.id, operator, refund),
      ]);
      v = await view(v.id);
      assert.equal(v.refundedAmount, 6000);
      await assert.rejects(
        changes.refund(v.id, operator, {
          ...key(v.version),
          amount: 5000,
          refundedAt: new Date().toISOString(),
          reason: "초과",
        }),
      );
      v = await changes.refund(v.id, operator, {
        ...key(v.version),
        amount: 4000,
        refundedAt: new Date().toISOString(),
        reason: "잔액 반환 확인",
      });
      assert.equal(v.progress, "CANCELLED");
      assert.equal(v.receivedAmount, 10000);
      assert.equal(v.refundedAmount, 10000);
    },
  );
  await t.test(
    "guidance revision, stale menu and mutation authorization require fresh confirmation",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      await post(
        v.id,
        "receipt",
        {
          ...key(v.version),
          guidanceRevision: v.guidance.revision,
          amount: 10000,
          receivedAt: new Date().toISOString(),
          corrects: null,
          reason: "unauthorized",
        },
        403,
      );
      const oldMenu = menu(v);
      v = await payments.guidance(v.id, operator, guide(v, "WEB"));
      await post(v.id, "menu-submit", oldMenu, 409);
      const link = await db.manager.findOneByOrFail(ReservationManagementLink, {
        reservationId: v.id,
      });
      const token = await access.exchange(
        v.id,
        new URL(access.url(link)).hash.slice(7),
        "permission",
      );
      const principal = { kind: "link" as const, access: token.accessToken };
      await assert.rejects(
        app
          .get(
            (
              await import("../../src/modules/reservations/reservation-menus.service.js")
            ).ReservationMenusService,
          )
          .submit(v.id, principal, menu(v)),
      );
      const item = v.catalog.menus.find(
        (m) => m.available && m.price !== null,
      )!;
      await db.manager.update(
        RestaurantMenu,
        { id: item.id },
        { available: false },
      );
      await post(v.id, "menu-submit", menu(v), 409);
      await db.manager.update(
        RestaurantMenu,
        { id: item.id },
        { available: true },
      );
      v = await post(v.id, "menu-submit", menu(v));
      const oldRevision = v.guidance.revision;
      v = await payments.guidance(v.id, operator, guide(v));
      assert.equal(v.acknowledgedRevision, null);
      await post(
        v.id,
        "acknowledge",
        { ...key(v.version), guidanceRevision: oldRevision, confirmed: true },
        409,
      );
      v = await payments.receipt(v.id, operator, {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 10000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "bank",
      });
      assert.notEqual(v.status, "CONFIRMED");
      v = await post(v.id, "acknowledge", {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        confirmed: true,
      });
      assert.equal(v.status, "CONFIRMED");
    },
  );
  await t.test(
    "simultaneous cancellation acceptance and receipt serialize without erasing evidence",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      v = await post(v.id, "menu-submit", menu(v));
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CANCEL",
        subject: "OTHER",
        reason: "취소",
      });
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "환불 미확인 취소",
        refundExpected: null,
      });
      const version = v.version;
      const results = await Promise.allSettled([
        changes.acceptOperator(v.id, operator, {
          ...key(version),
          changeId: v.changes[0].id,
          confirmed: true,
          organizerConfirmer: "총무",
          merchantConfirmer: "사장",
          agreementEvidence: "전화로 양측 취소 동의 확인",
        }),
        payments.receipt(v.id, operator, {
          ...key(version),
          guidanceRevision: v.guidance.revision,
          amount: 10000,
          receivedAt: new Date().toISOString(),
          corrects: null,
          reason: "은행 확인",
        }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      v = await view(v.id);
      assert.equal(v.version, version + 1);
      const audit = await db.manager.findOneByOrFail(
        ReservationCompletionHistory,
        { reservationId: v.id, version: v.version },
      );
      assert.equal(audit.audit.recorder, "integration");
      assert(audit.evidence.command);
      await assert.rejects(
        changes.acceptOperator(v.id, operator, {
          ...key(v.version),
          changeId: v.changes[0].id,
          confirmed: true,
        }),
      );
    },
  );

  await t.test(
    "logged owner matches link authority and post-commit sender failure preserves completion",
    async (t) => {
      const owner = await signup();
      await json(
        await call("auth/first-setup", owner, "PATCH", {
          accountType: "owner",
        }),
      );
      const identity = await json<{ id: string }>(await call("auth/me", owner));
      let v = await fixture();
      const { Restaurant } =
        await import("../../src/modules/restaurants/entities/restaurant.entity.js");
      const original = await db.manager.findOneByOrFail(Restaurant, {
        id: v.restaurantId,
      });
      await db.manager.update(
        Restaurant,
        { id: v.restaurantId },
        { ownerAccountId: identity.id },
      );
      assert.equal(
        (await call(`owner/reservations/${v.id}`, owner)).status,
        200,
      );
      assert.equal(
        (await call(`owner/reservations/${v.id}`, alien)).status,
        403,
      );
      assert.equal(
        (
          await call(`owner/reservations/${v.id}/menu-submit`, owner, "POST", {
            command: menu(v),
          })
        ).status,
        403,
      );
      const { ReservationNotificationsService } =
        await import("../../src/modules/reservations/reservation-notifications.service.js");
      t.mock.method(
        app.get(ReservationNotificationsService),
        "dispatchRequest",
        async () => {
          throw new Error("after commit failure");
        },
      );
      const input = menu(v);
      v = await post(v.id, "menu-submit", input);
      assert.equal(v.status, "CONFIRMED");
      await post(v.id, "menu-submit", input);
      assert.equal(
        await db.manager.countBy(NotificationFact, {
          reservationId: v.id,
          eventKey: `${v.id}:CONFIRMED:${v.version}`,
        }),
        1,
      );
      await db.manager.update(
        Restaurant,
        { id: v.restaurantId },
        { ownerAccountId: original.ownerAccountId },
      );
    },
  );

  await t.test(
    "actual refunds preserve unknown or lower plans and only enforce remaining received funds",
    async () => {
      for (const plan of [null, 2000]) {
        let v = await fixture("UNKNOWN");
        v = await payments.guidance(v.id, operator, guide(v));
        v = await payments.receipt(v.id, operator, {
          ...key(v.version),
          guidanceRevision: v.guidance.revision,
          amount: 10000,
          receivedAt: new Date().toISOString(),
          corrects: null,
          reason: "은행 실수령 확인",
        });
        v = await post(v.id, "change-request", {
          ...key(v.version),
          kind: "CANCEL",
          subject: "OTHER",
          reason: "취소 합의",
        });
        v = await changes.propose(v.id, operator, {
          ...key(v.version),
          changeId: v.changes[0].id,
          reason: "예정과 실제 반환 분리",
          refundExpected: plan,
        });
        v = await post(v.id, "change-accept", {
          ...key(v.version),
          changeId: v.changes[0].id,
          confirmed: true,
        });
        const command = {
          ...key(v.version),
          amount: 6000,
          refundedAt: new Date().toISOString(),
          reason: "은행에서 6000원 반환 확인",
        };
        v = await changes.refund(v.id, operator, command);
        assert.equal(v.refundExpected, plan);
        assert.equal(v.refundedAmount, 6000);
        assert.equal(v.progress, "REFUND_REVIEW");
        await changes.refund(v.id, operator, command);
        assert.equal((await view(v.id)).refundedAmount, 6000);
        const history = await db.manager.findBy(ReservationCompletionHistory, {
          reservationId: v.id,
          action: "REFUND_RECORDED",
        });
        assert.equal(history.length, 1);
        assert.deepEqual(history[0].evidence.refund, {
          amount: 6000,
          refundedAt: command.refundedAt,
          expected: plan,
          totalReturned: 6000,
          variance: plan === null ? null : 4000,
        });
        assert.equal(history[0].audit.confirmer, operator.confirmer);
        assert.equal(history[0].audit.confirmedAt, operator.confirmedAt);
        await assert.rejects(
          changes.refund(v.id, operator, {
            ...key(v.version),
            amount: 4001,
            refundedAt: new Date().toISOString(),
            reason: "잔액 초과",
          }),
        );
        const remainder = {
          ...key(v.version),
          amount: 4000,
          refundedAt: new Date().toISOString(),
          reason: "잔액 반환",
        };
        await Promise.all([
          changes.refund(v.id, operator, remainder),
          changes.refund(v.id, operator, remainder),
        ]);
        v = await view(v.id);
        assert.equal(v.refundedAmount, 10000);
        assert.equal(v.refundExpected, plan);
        assert.equal(
          await db.manager.countBy(ReservationCompletionHistory, {
            reservationId: v.id,
            action: "REFUND_RECORDED",
          }),
          2,
        );
      }
    },
  );

  await t.test(
    "CHANGE rejects unused refund plans and revalidates proposal dates when either actor applies",
    async (t) => {
      let v = await fixture();
      const original = v.agreement;
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CHANGE",
        subject: "SCHEDULE",
        reason: "일정 변경",
      });
      const changeId = v.changes[0].id;
      for (const refundExpected of [0, 1000])
        await assert.rejects(
          changes.propose(v.id, operator, {
            ...key(v.version),
            changeId,
            reason: "지원하지 않는 변경 환불",
            refundExpected,
          }),
        );
      assert.equal((await view(v.id)).changes[0].status, "REQUESTED");
      const now = Date.now(),
        agreement = {
          ...v.agreement,
          startsAt: new Date(now + 60000).toISOString(),
          menuDeadlineAt: new Date(now + 30000).toISOString(),
        };
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId,
        agreement,
        reason: "곧 시작하는 변경 제안",
        refundExpected: null,
      });
      const version = v.version;
      t.mock.timers.enable({ apis: ["Date"], now: now + 120000 });
      try {
        await post(
          v.id,
          "change-accept",
          { ...key(version), changeId, confirmed: true },
          400,
        );
        await assert.rejects(
          changes.acceptOperator(v.id, operator, {
            ...key(version),
            changeId,
            confirmed: true,
            organizerConfirmer: "총무",
            merchantConfirmer: "사장",
            agreementEvidence: "양측 합의",
          }),
        );
        const unchanged = await view(v.id);
        assert.equal(unchanged.version, version);
        assert.deepEqual(unchanged.agreement, original);
        assert.equal(unchanged.changes[0].status, "PROPOSED");
        assert.equal(
          await db.manager.countBy(ReservationCompletionHistory, {
            reservationId: v.id,
            action: "CHANGE_APPLIED",
          }),
          0,
        );
        const event = await json<{ scheduledAt: string }>(
          await call(`events/${v.eventId}`, organizer),
        );
        assert.equal(
          Date.parse(event.scheduledAt),
          Date.parse(original.startsAt),
        );
      } finally {
        t.mock.timers.reset();
      }
    },
  );
  await t.test(
    "audited operator can record and correct late bank evidence after cancellation without reopening or negative remaining funds",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CANCEL",
        subject: "OTHER",
        reason: "입금 확인 전 취소",
      });
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "환불 예정 미확인",
        refundExpected: null,
      });
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      const cancelled = v.cancellation;
      const link = await db.manager.findOneByOrFail(ReservationManagementLink, {
        reservationId: v.id,
      });
      const token = await access.exchange(
        v.id,
        new URL(access.url(link)).hash.slice(7),
        "late-cancelled-receipt",
      );
      const input = {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 10000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "취소 후 은행 원장을 뒤늦게 확인",
      };
      await assert.rejects(
        payments.receipt(
          v.id,
          { kind: "link", access: token.accessToken },
          input,
        ),
      );
      v = await payments.receipt(v.id, operator, input);
      assert.equal(v.status, "CANCELLED");
      assert.deepEqual(v.cancellation, cancelled);
      assert.equal(v.receivedAmount, 10000);
      assert.equal(v.confirmation, null);
      v = await changes.refund(v.id, operator, {
        ...key(v.version),
        amount: 6000,
        refundedAt: new Date().toISOString(),
        reason: "뒤늦게 확인한 원금 중 실제 반환",
      });
      const correction = {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        receivedAt: new Date().toISOString(),
        corrects: v.receipt!.id,
        reason: "은행 수령 총액 재대조",
      };
      await assert.rejects(
        payments.receipt(v.id, operator, { ...correction, amount: 5000 }),
      );
      v = await payments.receipt(v.id, operator, {
        ...correction,
        amount: 8000,
      });
      assert.equal(v.receivedAmount, 8000);
      assert.equal(v.refundedAmount, 6000);
      assert.equal(v.status, "CANCELLED");
      assert.deepEqual(v.cancellation, cancelled);
      assert.equal(v.confirmation, null);
      const receipts = await db.manager.find(ReservationCompletionHistory, {
        where: { reservationId: v.id, action: "RECEIPT_RECORDED" },
        order: { version: "ASC" },
      });
      assert.deepEqual(
        receipts.map((r) => r.snapshot.receipt!.amount),
        [10000, 8000],
      );
      assert(
        receipts.every(
          (r) =>
            r.audit.kind === "OPERATOR_RECORDED" &&
            r.audit.confirmer === operator.confirmer,
        ),
      );
      assert.equal(
        (
          await db.manager.findBy(NotificationFact, { reservationId: v.id })
        ).filter((f) => f.eventKey.includes(":CONFIRMED:")).length,
        0,
      );
      const event = await json<{ reservationScheduleLocked: boolean }>(
        await call(`events/${v.eventId}`, organizer),
      );
      assert.equal(event.reservationScheduleLocked, false);
    },
  );
  assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries, []);
});
