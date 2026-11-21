import assert from "node:assert/strict";
import { MessageGateway } from "../../src/modules/reservations/providers/message.gateway.js";
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
  ReservationProgress,
} from "../../src/modules/reservations/entities/reservation-progress.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { ReservationFactsService } from "../../src/modules/reservations/reservation-facts.service.js";
import {
  completionStatus,
  completionIssues,
  initialPreparation,
} from "../../src/modules/reservations/lib/reservation-completion.js";
import { SelectedReservation } from "../../src/modules/reservations/entities/selected-reservation.entity.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantOperation } from "../../src/modules/restaurants/entities/restaurant-operation.entity.js";
import { RestaurantDataService } from "../../src/modules/restaurants/restaurant-data.service.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";
import { ReservationNotificationsService } from "../../src/modules/reservations/reservation-notifications.service.js";
import {
  NotificationFact,
  Notification,
  NotificationMessage,
} from "../../src/modules/notifications/entities/notification.entity.js";
import type { ReservationRequestDto } from "../../src/modules/reservations/dto/response/reservation-request.response.dto.js";
import type { ReservationPrincipal } from "../../src/modules/reservations/types/reservation-completion.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
test("reservation completion preserves contracts, scoped links, money evidence and concurrent decisions", async (t) => {
  const { app, db, call, signup, existingOwner, url } =
    await startResourceApplication(t);
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
    return selectDemoProposal(q, kind);
  }
  async function selectDemoProposal(
    q: ReservationRequestDto,
    kind: "NONE" | "UNKNOWN",
  ) {
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
        await call(`events/${q.eventId}/reservation-requests`, organizer),
      )
    ).request;
    const chosen = await json<ReservationRequestDto>(
      await call(
        `events/${q.eventId}/reservation-requests/${q.id}/select`,
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
    "reservation contacts use an independent public number and scoped current organizer contact",
    async () => {
      const v = await fixture();
      type Contact = Awaited<
        ReturnType<ReservationCompletionService["contact"]>
      >;
      const restaurant = await db.manager.findOneByOrFail(Restaurant, {
        id: v.restaurantId,
      });
      const selection = await db.manager.findOneByOrFail(SelectedReservation, {
        id: v.id,
      });
      const request = await db.manager.findOneByOrFail(ReservationRequest, {
        id: selection.requestId,
      });
      assert.equal(restaurant.publicPhone, null);
      assert.deepEqual(
        await json<Contact>(
          await call(`reservations/${v.id}/contact`, organizer),
        ),
        {
          kind: "restaurant",
          name: v.restaurantName,
          phone: null,
          changedAt: null,
        },
      );
      assert.equal(
        (await call(`reservations/${v.id}/contact`, alien)).status,
        404,
      );
      assert.equal(
        (await call(`reservation-management/${v.id}/contact`)).status,
        403,
      );
      const link = await db.manager.findOneByOrFail(ReservationManagementLink, {
        reservationId: v.id,
      });
      const session = await access.exchange(
        v.id,
        new URL(access.url(link)).hash.slice(7),
        "contacts",
      );
      const principal = { kind: "link" as const, access: session.accessToken };
      const current = await completion.contact(v.id, principal);
      assert.equal(current.kind, "organizer");
      assert.equal(
        current.phone,
        request.currentContactPhone ?? request.contactPhone,
      );
      assert.deepEqual(
        await json<Contact>(
          await fetch(`${url}/api/v1/reservation-management/${v.id}/contact`, {
            headers: { "X-Reservation-Access": session.accessToken },
          }),
        ),
        current,
      );
      assert.equal(
        Object.hasOwn(
          (await completion.get(v.id, principal)).currentContact,
          "phone",
        ),
        false,
      );
      const other = await fixture();
      await assert.rejects(completion.contact(other.id, principal));
      try {
        await db.manager.update(
          Restaurant,
          { id: restaurant.id },
          { publicPhone: "0212345678" },
        );
        const contact = await json<Contact>(
          await call(`reservations/${v.id}/contact`, organizer),
        );
        assert.equal(contact.phone, "0212345678");
        assert.notEqual(contact.phone, link.phoneSnapshot);
        const changedAt = new Date().toISOString();
        await db.manager.update(
          ReservationRequest,
          { id: request.id },
          {
            currentContactName: "새 담당자",
            currentContactPhone: "01098765432",
            contactChanges: [
              ...request.contactChanges,
              {
                handoverId: randomUUID(),
                from:
                  request.currentContactAccountId ??
                  request.createdById ??
                  randomUUID(),
                to: randomUUID(),
                name: "새 담당자",
                at: changedAt,
                actor: "isolated-fixture",
              },
            ],
          },
        );
        assert.deepEqual(await completion.contact(v.id, principal), {
          kind: "organizer",
          name: "새 담당자",
          phone: "01098765432",
          changedAt,
        });
        const original = await db.manager.findOneByOrFail(ReservationRequest, {
          id: request.id,
        });
        assert.equal(original.contactPhone, request.contactPhone);
      } finally {
        await db.manager.update(
          Restaurant,
          { id: restaurant.id },
          { publicPhone: restaurant.publicPhone },
        );
      }
      await completion.manageLink(v.id, operator, {
        ...key(v.version),
        operation: "REVOKE",
      });
      await assert.rejects(completion.contact(v.id, principal));
    },
  );
  await t.test(
    "rejection reasons remain tied to their original request and retry identity",
    async () => {
      let v = await fixture();
      const baseline = structuredClone(v.agreement);
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CHANGE",
        subject: "SCHEDULE",
        reason: "일정을 늦춰 주세요",
      });
      const firstId = v.changes[0].id;
      const rejection = {
        ...key(v.version),
        changeId: firstId,
        reason: "해당 시간은 다른 예약이 있어요",
      };
      v = await changes.reject(v.id, operator, rejection);
      assert.equal(v.changes[0].resolutionReason, rejection.reason);
      assert.deepEqual(v.agreement, baseline);
      const version = v.version;
      v = await changes.reject(v.id, operator, rejection);
      assert.equal(v.version, version);
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CHANGE",
        subject: "GUESTS",
        reason: "인원을 바꿔 주세요",
      });
      v = await changes.reject(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "수용 인원을 넘어요",
      });
      assert.equal(
        v.changes.find((c) => c.id === firstId)?.resolutionReason,
        rejection.reason,
      );
      assert.equal(v.changes[0].resolutionReason, "수용 인원을 넘어요");
      assert.deepEqual(v.agreement, baseline);
    },
  );
  await t.test(
    "fake delivery combines menu and latest transfer, respects the earlier menu deadline and keeps receipt authority",
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
      const take = () => sent.splice(0);
      await json(
        await call("auth/first-setup", organizer, "PATCH", {
          accountType: "organizer",
          nickname: "문자 테스트",
        }),
      );
      const { id: accountId } = await json<{ id: string }>(
        await call("auth/me", organizer),
      );
      const notices = app.get(NotificationsService);

      let paid = await fixture("UNKNOWN");
      const selected = take().filter((text) => text.includes("매장 선택"));
      assert.equal(selected.length, 1);
      assert.match(selected[0], /확정 전/);
      const url = new URL(selected[0].split("\n").at(-1)!);
      const token = new URLSearchParams(url.hash.slice(1)).get("token")!;
      const session = await json<{ accessToken: string }>(
        await call(`reservation-management/${paid.id}/access`, "", "POST", {
          token,
        }),
      );
      const merchant = { kind: "link" as const, access: session.accessToken };

      const web = guide(paid, "WEB");
      paid = await payments.guidance(paid.id, merchant, web);
      const webMessages = take();
      assert.equal(webMessages.length, 1);
      assert.match(webMessages[0], /\/notifications$/);
      assert.doesNotMatch(
        webMessages[0],
        /123-TEST-SECRET|테스트은행|가짜매장/,
      );
      assert.equal((await view(paid.id)).guidance.account, web.account);
      const guidanceRevision = paid.guidance.revision;
      paid = await payments.guidance(paid.id, merchant, {
        ...web,
        ...key(paid.version),
      });
      assert.equal(paid.guidance.revision, guidanceRevision);
      assert.deepEqual(take(), []);

      const preferences = await notices.preferences(accountId);
      await notices.savePreferences(accountId, {
        reservation: false,
        settlement: preferences.settlement,
        event: preferences.event,
        expectedVersion: preferences.version,
      });
      const sms = { ...guide(paid), amount: 12000 };
      paid = await payments.guidance(paid.id, merchant, sms);
      const [accountMessage] = take();
      assert.match(
        accountMessage,
        /12,000원 \(기한 \d{4}\/\d+\/\d+ \d\d:\d\d\)/,
      );
      assert.match(
        accountMessage,
        /테스트은행 123-TEST-SECRET 예금주 가짜매장/,
      );
      assert.match(
        accountMessage,
        new RegExp(`/events\\?event=${paid.eventId}&request=`),
      );
      assert.equal((await view(paid.id)).guidance.account, "");

      paid = await post(paid.id, "menu-draft", {
        ...key(paid.version),
        catalogVersion: paid.catalog.version,
        items: [],
      });
      assert.deepEqual(take(), []);
      const submit = {
        ...menu(paid),
        transfer: { amount: sms.amount, payer: "총무" },
      };
      paid = await post(paid.id, "menu-submit", submit);
      await post(paid.id, "menu-submit", submit);
      const merged = take();
      assert.equal(merged.length, 1);
      assert.match(merged[0], /20명\n메뉴와 송금 신고.*실입금을 확인/);
      assert.equal(paid.receivedAmount, 0);

      paid = await payments.receipt(paid.id, merchant, {
        ...key(paid.version),
        guidanceRevision: paid.guidance.revision,
        amount: sms.amount,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "은행 대조",
      });
      assert.equal(paid.status, "CONFIRMED");
      const confirmation = take();
      assert.equal(confirmation.length, 1);
      assert.match(confirmation[0], /예약 확정/);
      assert.doesNotMatch(confirmation[0], /reservation-manage/);
      assert.equal(
        await db.manager.countBy(NotificationFact, {
          reservationId: paid.id,
          eventKey: `${paid.id}:RECEIPT_RECORDED:${paid.version}`,
        }),
        1,
      );

      for (const scenario of [
        "menu-first",
        "transfer-first",
        "earlier-deadline",
        "no-report",
      ] as const) {
        let v = await fixture("UNKNOWN");
        take();
        if (scenario === "earlier-deadline") {
          const selection = await db.manager.findOneByOrFail(
            SelectedReservation,
            { id: v.id },
          );
          selection.snapshot.offered!.menuDeadlineAt = new Date(
            Date.now() + 10 * 60000,
          ).toISOString();
          await db.manager.save(selection);
        }
        v = await payments.guidance(v.id, operator, guide(v));
        take();
        const transfer = () =>
          post(v.id, "transfer", {
            ...key(v.version),
            guidanceRevision: v.guidance.revision,
            amount: 10000,
            payer: "총무",
          });
        if (scenario === "transfer-first") {
          v = await transfer();
          assert.deepEqual(take(), []);
        }
        v = await post(v.id, "menu-submit", menu(v));
        const menuMessages = take();
        if (scenario === "transfer-first") {
          assert.equal(menuMessages.length, 1);
          assert.match(menuMessages[0], /메뉴와 송금 신고/);
        } else if (scenario === "earlier-deadline") {
          assert.equal(menuMessages.length, 1);
          assert.match(menuMessages[0], /메뉴 마감이 먼저/);
        } else assert.deepEqual(menuMessages, []);

        if (scenario === "no-report") {
          v = await payments.receipt(v.id, operator, {
            ...key(v.version),
            guidanceRevision: v.guidance.revision,
            amount: 10000,
            receivedAt: new Date().toISOString(),
            corrects: null,
            reason: "은행 대조",
          });
          assert.equal(v.status, "CONFIRMED");
          assert.equal(v.transfer, null);
          const delegated = take();
          assert.equal(delegated.length, 2);
          assert.equal(
            delegated.filter((text) => text.includes("reservation-manage"))
              .length,
            1,
          );
        } else {
          v = await transfer();
          const messages = take();
          assert.equal(messages.length, scenario === "transfer-first" ? 0 : 1);
          if (messages.length) assert.match(messages[0], /메뉴와 송금 신고/);
          await transfer();
          assert.deepEqual(take(), []);
        }
      }

      let none = await fixture();
      take();
      none = await payments.guidance(none.id, operator, {
        ...guide(none),
        kind: "NONE",
        amount: 0,
        deadline: null,
      });
      assert.deepEqual(take(), []);
      none = await post(none.id, "menu-submit", menu(none));
      assert.equal(none.status, "CONFIRMED");
      const noDeposit = take();
      assert.equal(noDeposit.length, 2);
      assert.equal(
        noDeposit.filter((text) => text.includes("reservation-manage")).length,
        1,
      );
      assert(noDeposit.some((text) => text.includes("예약 확정 및 메뉴 접수")));
      none = await post(none.id, "change-request", {
        ...key(none.version),
        kind: "CHANGE",
        subject: "MENU",
        reason: "메뉴 수량 조정",
      });
      const changeId = none.changes[0].id;
      none = await changes.propose(none.id, operator, {
        ...key(none.version),
        changeId,
        reason: "수량 조정 가능",
        menu: {
          catalogVersion: none.catalog.version,
          items: menu(none).items.map((line) => ({ ...line, quantity: 3 })),
        },
      });
      take();
      none = await changes.acceptOperator(none.id, operator, {
        ...key(none.version),
        changeId,
        confirmed: true,
        organizerConfirmer: "총무",
        merchantConfirmer: "사장",
        agreementEvidence: "전화 합의 확인",
      });
      assert.equal(none.status, "CONFIRMED");
      const changeMessages = take();
      assert.equal(changeMessages.length, 2);
      assert(
        changeMessages.every((text) => text.includes("예약 변경 적용 및 확정")),
      );
      assert.equal(
        changeMessages.filter((text) => text.includes("reservation-manage"))
          .length,
        1,
      );

      const disabled = await notices.preferences(accountId);
      await notices.savePreferences(accountId, {
        reservation: true,
        settlement: disabled.settlement,
        event: disabled.event,
        expectedVersion: disabled.version,
      });
    },
  );

  await t.test(
    "cancellation keeps request, response and result delivery while legacy refund rows stay held",
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
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      v = await payments.receipt(v.id, operator, {
        ...key(v.version),
        guidanceRevision: v.guidance.revision,
        amount: 10000,
        receivedAt: new Date().toISOString(),
        corrects: null,
        reason: "입금 확인",
      });
      sent.length = 0;
      const requestCancel = () =>
        post(v.id, "change-request", {
          ...key(v.version),
          kind: "CANCEL",
          subject: "OTHER",
          reason: "행사 취소",
        });
      v = await requestCancel();
      assert.equal(sent.length, 1);
      assert.match(sent[0], /취소 요청.*처리안/);
      v = await changes.reject(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "다른 처리안 요청",
      });
      assert.equal(sent.length, 2);
      assert.match(sent[1], /취소 요청 처리 불가/);
      v = await requestCancel();
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "취소 처리 가능",
      });
      assert.match(sent.at(-1)!, /취소 처리안 확인/);
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      assert.match(sent.at(-1)!, /취소 완료.*전화로/);
      assert.equal(sent.filter((text) => text.includes("취소 완료")).length, 1);
      assert.equal(v.refundExpected, null);
      assert.equal(v.progress, "REFUND_REVIEW");
      const cancelVersion = v.version;
      const facts = () =>
        db.manager.findBy(NotificationFact, { reservationId: v.id });
      const cancel = (await facts()).find(
        (f) => f.eventKey === `${v.id}:CHANGE_APPLIED:${cancelVersion}`,
      )!;
      sent.length = 0;

      v = await changes.refund(v.id, operator, {
        ...key(v.version),
        amount: 1000,
        refundedAt: new Date().toISOString(),
        reason: "반환",
      });
      assert.equal(v.refundedAmount, 1000);
      assert.equal(v.refundExpected, null);
      assert.equal(v.progress, "CANCELLED");
      assert.equal(v.receivedAmount - v.refundedAmount, 9000);
      assert.equal(
        v.history.find((h) => h.action === "REFUND_RECORDED")!.refund!.expected,
        null,
      );
      const recorded = v.version;
      v = await changes.refundPlan(v.id, operator, {
        ...key(v.version),
        amount: 5000,
        reason: "기존 환불 제안 호환",
      });
      const proposed = v.version;
      v = await changes.reject(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "철회",
      });
      const rejected = v.version;
      v = await changes.refundPlan(v.id, operator, {
        ...key(v.version),
        amount: 5000,
        reason: "기존 환불 제안 호환",
      });
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      const applied = v.version;
      assert.deepEqual(sent, []);

      const messages = app.get(NotificationsService);
      const dispatcher = app.get(ReservationNotificationsService);
      const previous = await messages.messages(cancel.requestId, db.manager);
      const organizerRow = previous.find((row) =>
        row.recipientKey.startsWith("organizer:"),
      )!;
      const cancelledMerchant = previous.find(
        (row) => row.eventKey === cancel.eventKey,
      )!;
      const pending = [];
      for (const [kind, revision, status] of [
        ["REFUND_RECORDED", recorded, "PENDING"],
        ["REFUND_PROPOSED", proposed, "PENDING"],
        ["CHANGE_REJECTED", rejected, "FAILED"],
        ["CHANGE_APPLIED", applied, "FAILED"],
        ["CHANGE_APPLIED", applied, "UNKNOWN"],
        ["CHANGE_APPLIED", cancelVersion, "PENDING"],
      ] as const) {
        const eventKey = `${v.id}:${kind}:${revision}`;
        await db.manager.update(
          NotificationFact,
          { eventKey },
          { smsPolicyVersion: null },
        );
        if (revision === cancelVersion)
          await db.manager.delete(NotificationMessage, {
            id: cancelledMerchant.id,
          });
        const source =
          kind === "CHANGE_APPLIED" ? cancelledMerchant : organizerRow;
        pending.push(
          await db.manager.save(NotificationMessage, {
            id: randomUUID(),
            eventKey,
            recipientKey:
              status === "UNKNOWN"
                ? organizerRow.recipientKey
                : source.recipientKey,
            phoneSnapshot:
              status === "UNKNOWN"
                ? organizerRow.phoneSnapshot
                : source.phoneSnapshot,
            contactIdSnapshot:
              status === "UNKNOWN" ? null : source.contactIdSnapshot,
            text: "동일한 과거 본문",
            isDemo: true,
            status,
            failureStage: status === "FAILED" ? "SUBMISSION" : null,
            attempts: status === "PENDING" ? 0 : 1,
            updatedAt: new Date(),
          }),
        );
      }
      for (const row of pending) {
        await dispatcher.dispatch(
          row.id,
          row.status === "FAILED"
            ? { actor: "test", reason: "접수 실패 확인" }
            : undefined,
        );
        const current = await db.manager.findOneByOrFail(NotificationMessage, {
          id: row.id,
        });
        assert.equal(
          current.status,
          row.eventKey === cancel.eventKey
            ? "ACCEPTED"
            : row.status === "UNKNOWN"
              ? "UNKNOWN"
              : "HELD",
        );
        if (current.status === "HELD")
          assert.equal(current.errorCode, "SMS_POLICY_SUPPRESSED");
      }
      assert.equal(sent.length, 1);
      assert.match(sent[0], /취소 완료/);
    },
  );

  await t.test(
    "cancellation with no deposit or expected refund completes without refund review",
    async () => {
      let v = await fixture();
      v = await post(v.id, "change-request", {
        ...key(v.version),
        kind: "CANCEL",
        subject: "OTHER",
        reason: "예약금 없는 취소",
      });
      v = await changes.propose(v.id, operator, {
        ...key(v.version),
        changeId: v.changes[0].id,
        reason: "취소 동의",
      });
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      assert.equal(v.refundExpected, null);
      assert.equal(v.refundedAmount, 0);
      assert.equal(v.progress, "CANCELLED");
    },
  );

  await t.test(
    "operator reads omit evidence but cannot authorize mutations",
    async () => {
      let v = await fixture("UNKNOWN");
      v = await payments.guidance(v.id, operator, guide(v));
      const snapshot = async () => ({
        selection: await db.manager.findOneByOrFail(SelectedReservation, {
          id: v.id,
        }),
        progress: await db.manager.findOneByOrFail(ReservationProgress, {
          reservationId: v.id,
        }),
        history: await db.manager.findBy(ReservationCompletionHistory, {
          reservationId: v.id,
        }),
        link: await db.manager.findOneByOrFail(ReservationManagementLink, {
          reservationId: v.id,
        }),
        facts: await db.manager.findBy(NotificationFact, {
          reservationId: v.id,
        }),
        messages: await app.get(NotificationsService).messages(
          (
            await db.manager.findOneByOrFail(SelectedReservation, {
              id: v.id,
            })
          ).requestId,
          db.manager,
        ),
      });
      const before = await snapshot();
      const read = { kind: "operator" as const };
      assert.deepEqual(
        await completion.get(v.id, read),
        await completion.get(v.id, operator),
      );
      const incomplete = [
        read,
        ...["actor", "reason", "confirmer", "method", "confirmedAt"].map(
          (field) => ({ ...operator, [field]: undefined }),
        ),
      ];
      for (const principal of incomplete) {
        // Exercise the runtime boundary used by the untyped CLI, bypassing TS deliberately.
        const invalid = principal as ReservationPrincipal;
        await assert.rejects(payments.guidance(v.id, invalid, guide(v)), {
          code: "VALIDATION_FAILED",
        });
        for (const preview of [false, true])
          await assert.rejects(
            completion.manageLink(
              v.id,
              invalid,
              {
                ...key(v.version),
                operation: "REVOKE",
              },
              preview,
            ),
            { code: "VALIDATION_FAILED" },
          );
      }
      assert.deepEqual(await snapshot(), before);
    },
  );
  for (const amount of [0, 5000]) {
    await t.test(
      `agreed refund remains 10000 until the organizer accepts ${amount}, including retries`,
      async () => {
        let v = await fixture("UNKNOWN");
        v = await payments.guidance(v.id, operator, guide(v));
        v = await payments.receipt(v.id, operator, {
          ...key(v.version),
          guidanceRevision: v.guidance.revision,
          amount: 10000,
          receivedAt: new Date().toISOString(),
          corrects: null,
          reason: "실입금 확인",
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
          reason: "전액 반환",
          refundExpected: 10000,
        });
        v = await post(v.id, "change-accept", {
          ...key(v.version),
          changeId: v.changes[0].id,
          confirmed: true,
        });
        const proposal = {
          ...key(v.version),
          amount,
          reason: "환불 예정액 재합의",
        };
        await Promise.all([
          changes.refundPlan(v.id, operator, proposal),
          changes.refundPlan(v.id, operator, proposal),
        ]);
        v = await view(v.id);
        assert.equal(v.refundExpected, 10000);
        assert.equal(v.progress, "REFUND_PENDING");
        assert.equal(v.changes.filter((c) => c.kind === "REFUND").length, 1);
        const pending = v.changes.find((c) => c.kind === "REFUND")!;
        assert.equal(pending.status, "PROPOSED");
        await assert.rejects(
          changes.refundPlan(v.id, operator, {
            ...key(v.version),
            amount: 0,
            reason: "중복 제안",
          }),
        );
        const accept = {
          ...key(v.version),
          changeId: pending.id,
          confirmed: true,
        };
        v = await post(v.id, "change-accept", accept);
        const acceptedVersion = v.version;
        v = await post(v.id, "change-accept", accept);
        assert.equal(v.version, acceptedVersion);
        assert.equal(v.refundExpected, amount);
        assert.equal(v.progress, amount ? "REFUND_PENDING" : "CANCELLED");
        assert.equal(v.receivedAmount, 10000);
        assert.equal(v.refundedAmount, 0);
        await post(
          v.id,
          "change-accept",
          { ...key(v.version), changeId: pending.id, confirmed: true },
          409,
        );
        if (amount) {
          const refund = {
            ...key(v.version),
            amount,
            refundedAt: new Date().toISOString(),
            reason: "은행 반환 확인",
          };
          await Promise.all([
            changes.refund(v.id, operator, refund),
            changes.refund(v.id, operator, refund),
          ]);
          v = await view(v.id);
          assert.equal(v.refundedAmount, amount);
          assert.equal(v.progress, "CANCELLED");
        }
      },
    );
  }
  await t.test(
    "past event without a menu deadline requires explicit merchant confirmation",
    async () => {
      let v = await fixture();
      v = await post(v.id, "menu-draft", {
        ...key(v.version),
        catalogVersion: v.catalog.version,
        items: [],
      });
      const progress = await db.manager.findOneByOrFail(ReservationProgress, {
        reservationId: v.id,
      });
      progress.state.agreement.startsAt = new Date(
        Date.now() - 60000,
      ).toISOString();
      await db.manager.save(progress);
      v = await post(v.id, "menu-submit", menu(v));
      assert.equal(v.status, "CHECK_REQUIRED");
      assert(v.issues.includes("EVENT_STARTED"));
      assert.equal(v.confirmation, null);
      v = await payments.resolve(v.id, operator, {
        ...key(v.version),
        reason: "행사 시작 후 매장과 진행 여부를 확인함",
      });
      assert.equal(v.status, "CONFIRMED");
      assert.equal(v.confirmation!.audit.confirmer, operator.confirmer);
      assert.equal(v.confirmation!.audit.method, "PHONE");
    },
  );
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
    "cancellation permits one new round while the previous reservation's actual refund is pending",
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
      const requests = `events/${v.eventId}/reservation-requests`;
      const current = async () =>
        (
          await json<{ request: ReservationRequestDto }>(
            await call(requests, organizer),
          )
        ).request;
      const eventVersion = async () => {
        const event = await json<{
          version: number;
          scheduledAt: string;
          reservationScheduleLocked: boolean;
        }>(await call(`events/${v.eventId}`, organizer));
        return event;
      };
      const previous = await current();
      const newInquiry = {
        mode: "DIRECT",
        requestKey: randomUUID(),
        previousRequestId: previous.id,
        expectedRequestVersion: previous.version,
        expectedEventVersion: (await eventVersion()).version,
        updateEventSchedule: true,
        restaurantIds: [demoRestaurantIds[1]],
        conditions: {
          startsAt: new Date(
            Date.parse(v.agreement.startsAt) + 86400000,
          ).toISOString(),
          expectedGuests: 20,
          region: "건대입구",
          seating: "ANY",
          space: "ANY",
        },
        contact: { name: "총무", phone: "01000001234" },
      };
      assert.equal(previous.canReinquire, false);
      assert.equal(
        (await call(requests, organizer, "POST", newInquiry)).status,
        409,
      );
      v = await post(v.id, "change-accept", {
        ...key(v.version),
        changeId: v.changes[0].id,
        confirmed: true,
      });
      assert.equal(v.status, "CANCELLED");
      assert.equal(v.progress, "REFUND_PENDING");
      assert.equal(v.refundedAmount, 0);
      const cancelled = await current();
      assert.equal(cancelled.canReinquire, true);
      assert.equal(cancelled.selection?.id, v.id);
      newInquiry.expectedEventVersion = (await eventVersion()).version;
      assert.equal(
        (await call(requests, alien, "POST", newInquiry)).status,
        404,
      );
      const competing = { ...newInquiry, requestKey: randomUUID() };
      const responses = await Promise.all([
        call(requests, organizer, "POST", newInquiry),
        call(requests, organizer, "POST", competing),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const newRound = await json<ReservationRequestDto>(
        responses.find((r) => r.status === 201)!,
        201,
      );
      const replay = await json<ReservationRequestDto>(
        await call(
          requests,
          organizer,
          "POST",
          responses[0].status === 201 ? newInquiry : competing,
        ),
        201,
      );
      assert.equal(replay.id, newRound.id);
      assert.equal(newRound.round, previous.round + 1);
      assert.equal(newRound.selection, null);
      const oldRound = await json<ReservationRequestDto>(
        await call(`${requests}/${previous.id}`, organizer),
      );
      assert.equal(oldRound.lifecycle, "SELECTED");
      assert.equal(oldRound.selection?.id, v.id);
      assert.equal(oldRound.canReinquire, false);
      assert(oldRound.targets.every((target) => !target.canSelect));
      const next = await selectDemoProposal(newRound, "NONE");
      assert.notEqual(next.id, v.id);
      assert.equal(next.eventId, v.eventId);
      assert.equal(next.agreement.startsAt, newInquiry.conditions.startsAt);
      assert.equal(next.receivedAmount, 0);
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
      assert.equal((await current()).selection?.id, next.id);
      assert.equal((await view(next.id)).refundedAmount, 0);
      const rescheduled = await eventVersion();
      assert.equal(rescheduled.scheduledAt, next.agreement.startsAt);
      assert.equal(rescheduled.reservationScheduleLocked, true);
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
      const owner = await existingOwner();
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
      const contact = await json<{ kind: string; phone: string }>(
        await call(`owner/reservations/${v.id}/contact`, owner),
      );
      assert.equal(contact.kind, "organizer");
      assert(contact.phone);
      assert.equal(
        (await call(`owner/reservations/${v.id}/contact`, alien)).status,
        403,
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
        assert.equal(v.progress, plan === null ? "CANCELLED" : "REFUND_REVIEW");
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
  await t.test(
    "expired management links rotate once, invalidate access, and retain every notification intent",
    async () => {
      let v = await fixture();
      const original = await db.manager.findOneByOrFail(
        ReservationManagementLink,
        { reservationId: v.id },
      );
      const token = new URLSearchParams(
        new URL(access.url(original)).hash.slice(1),
      ).get("token")!;
      const session = await access.exchange(v.id, token, "rotation-test");
      await db.manager.update(
        ReservationManagementLink,
        { reservationId: v.id },
        { expiresAt: new Date(Date.now() - 86400000) },
      );
      const input = menu(v);
      await Promise.all([
        post(v.id, "menu-submit", input),
        post(v.id, "menu-submit", input),
      ]);
      v = await view(v.id);
      const rotated = await db.manager.findOneByOrFail(
        ReservationManagementLink,
        { reservationId: v.id },
      );
      assert.equal(rotated.generation, original.generation + 1);
      assert.equal(rotated.phoneSnapshot, original.phoneSnapshot);
      await assert.rejects(access.exchange(v.id, token, "rotation-test"));
      await assert.rejects(
        access.authorize(v.id, session.accessToken, db.manager),
      );
      const facts = await db.manager.findBy(NotificationFact, {
        reservationId: v.id,
      });
      assert.equal(
        facts.filter((f) => f.eventKey.includes(":MENU_SUBMITTED:")).length,
        1,
      );
      const messages = await app
        .get(NotificationsService)
        .messages(facts[0].requestId, db.manager);
      assert(
        messages.some(
          (n) =>
            n.recipientKey === `reservation:${v.id}:${rotated.generation}` &&
            n.text.includes(access.url(rotated)),
        ),
      );
      // A valid link survives the next independent follow-up notification.
      await db.transaction(async (m) => {
        const c = await completion.context(v.id, operator, m, true);
        await completion.notify(c, "VALID_LINK_TEST", "확인", "merchant");
        await app.get(NotificationsService).recordBatch(m, c.notifications);
      });
      assert.equal(
        (
          await db.manager.findOneByOrFail(ReservationManagementLink, {
            reservationId: v.id,
          })
        ).generation,
        rotated.generation,
      );
    },
  );
  await t.test(
    "unsafe expiration is held with a reason; operator replaces only an explicitly selected intent",
    async () => {
      for (const scenario of [
        "REVOKED",
        "MISSING",
        "PHONE_CHANGED",
        "CONSENT_WITHDRAWN",
        "CONTACT_INACTIVE",
        "UNKNOWN",
        "PROCESSING",
      ] as const) {
        const v = await fixture();
        const old = await db.manager.findOneByOrFail(
          ReservationManagementLink,
          { reservationId: v.id },
        );
        const contact = await db.manager.findOneByOrFail(RestaurantContact, {
          id: old.contactId,
        });
        await db.manager.update(
          ReservationManagementLink,
          { reservationId: v.id },
          {
            expiresAt: new Date(0),
            ...(scenario === "REVOKED" ? { revokedAt: new Date() } : {}),
          },
        );
        if (scenario === "MISSING")
          await db.manager.delete(ReservationManagementLink, {
            reservationId: v.id,
          });
        if (scenario === "PHONE_CHANGED")
          await db.manager.update(
            RestaurantContact,
            { id: contact.id },
            { phone: "01000009999" },
          );
        if (scenario === "CONSENT_WITHDRAWN")
          await db.manager.update(
            RestaurantContact,
            { id: contact.id },
            { requestConsentAt: null },
          );
        if (scenario === "CONTACT_INACTIVE")
          await db.manager.update(
            RestaurantContact,
            { id: contact.id },
            { active: false },
          );
        if (scenario === "UNKNOWN" || scenario === "PROCESSING") {
          const previous = await db.manager.findOneByOrFail(
            NotificationMessage,
            { recipientKey: `reservation:${v.id}:${old.generation}` },
          );
          await db.manager.update(
            NotificationMessage,
            { id: previous.id },
            { status: scenario },
          );
        }
        const saved = await post(v.id, "menu-submit", menu(v));
        assert(saved.order);
        const fact = (
          await db.manager.findBy(NotificationFact, { reservationId: v.id })
        ).find((f) => f.eventKey.includes(":MENU_SUBMITTED:"))!;
        assert.equal(
          fact.merchantHold?.reason,
          (
            {
              REVOKED: "MANAGEMENT_LINK_REVOKED",
              MISSING: "MANAGEMENT_LINK_MISSING",
              UNKNOWN: "DELIVERY_UNRESOLVED",
              PROCESSING: "DELIVERY_UNRESOLVED",
            } as Record<string, string>
          )[scenario] ?? scenario,
        );
        assert(
          (await app.get(NotificationsService).operations()).some(
            (n) => n.eventKey === fact.eventKey && n.status === "HELD",
          ),
        );
        await db.manager.save(contact);
        if (scenario === "REVOKED") {
          const recoverInput = {
            ...key(saved.version),
            operation: "ISSUE",
            contactId: contact.id,
            heldEventKey: fact.eventKey,
          };
          const linkBefore = await db.manager.findOneByOrFail(
            ReservationManagementLink,
            { reservationId: v.id },
          );
          const messageCount = await db.manager.count(NotificationMessage);
          await completion.manageLink(v.id, operator, recoverInput, true);
          assert.deepEqual(
            await db.manager.findOneByOrFail(ReservationManagementLink, {
              reservationId: v.id,
            }),
            linkBefore,
          );
          assert.equal(
            await db.manager.count(NotificationMessage),
            messageCount,
          );
          assert.equal((await view(v.id)).version, saved.version);
          assert.equal(
            (
              await db.manager.findOneByOrFail(NotificationFact, {
                eventKey: fact.eventKey,
              })
            ).merchantHold?.replacementEventKey,
            undefined,
          );
          await assert.rejects(
            completion.manageLink(
              v.id,
              operator,
              { ...recoverInput, heldEventKey: "not-this-reservation" },
              true,
            ),
          );
          await completion.manageLink(v.id, operator, recoverInput);
          const resolved = await db.manager.findOneByOrFail(NotificationFact, {
            eventKey: fact.eventKey,
          });
          assert(resolved.merchantHold?.replacementEventKey);
        } else {
          assert.equal(
            (
              await db.manager.findOneBy(ReservationManagementLink, {
                reservationId: v.id,
              })
            )?.generation ?? old.generation,
            old.generation,
          );
        }
      }
    },
  );
  await t.test(
    "rollback keeps link generation and held plans unchanged; dispatch blocks stale generations",
    async () => {
      const v = await fixture();
      const old = await db.manager.findOneByOrFail(ReservationManagementLink, {
        reservationId: v.id,
      });
      await db.manager.update(
        ReservationManagementLink,
        { reservationId: v.id },
        { expiresAt: new Date(0) },
      );
      await assert.rejects(
        db.transaction(async (m) => {
          const c = await completion.context(v.id, operator, m, true);
          await completion.notify(c, "ROLLBACK_TEST", "확인", "merchant");
          await app.get(NotificationsService).recordBatch(m, c.notifications);
          throw new Error("TEST_ROLLBACK");
        }),
      );
      assert.equal(
        (
          await db.manager.findOneByOrFail(ReservationManagementLink, {
            reservationId: v.id,
          })
        ).generation,
        old.generation,
      );
      assert(
        !(
          await db.manager.findBy(NotificationFact, { reservationId: v.id })
        ).some((f) => f.eventKey.includes("ROLLBACK_TEST")),
      );
      const prior = await db.manager.findOneByOrFail(NotificationMessage, {
        recipientKey: `reservation:${v.id}:${old.generation}`,
      });
      await db.manager.update(
        NotificationMessage,
        { id: prior.id },
        {
          status: "PENDING",
          providerMessageId: null,
          providerGroupId: null,
          reports: [],
        },
      );
      await app.get(ReservationNotificationsService).dispatch(prior.id);
      assert.equal(
        (
          await db.manager.findOneByOrFail(NotificationMessage, {
            id: prior.id,
          })
        ).status,
        "HELD",
      );
    },
  );
  await t.test(
    "operator menu price patch is atomic, versioned, non-destructive and preserves submitted snapshots",
    async () => {
      let v = await fixture();
      v = await post(v.id, "menu-submit", menu(v));
      const service = new RestaurantDataService(app.get(DatabaseService));
      const before = await service.menus(v.restaurantId);
      const chosen = before.menus[0];
      const owner = (
        await db.manager.findOneByOrFail(Restaurant, { id: v.restaurantId })
      ).ownerAccountId;
      const count = await db.manager.countBy(RestaurantOperation, {
        restaurantId: v.restaurantId,
      });
      const input = {
        expectedVersion: before.version,
        evidence: "가상 가격 확인",
        items: [{ id: chosen.id, price: (chosen.price ?? 1000) + 100 }],
      };
      const preview = await service.patchMenuPrices(
        v.restaurantId,
        input,
        "test",
        "격리 검증",
      );
      assert.equal(preview.changed, 1);
      assert.deepEqual(await service.menus(v.restaurantId), before);
      assert.equal(
        await db.manager.countBy(RestaurantOperation, {
          restaurantId: v.restaurantId,
        }),
        count,
      );
      for (const items of [
        [...input.items, ...input.items],
        [{ id: randomUUID(), price: 1 }],
        [{ id: chosen.id, price: -1 }],
        [{ id: chosen.id, price: 0.1 }],
        [{ id: chosen.id, price: 2_000_000_001 }],
        [...input.items, { id: randomUUID(), price: 1 }],
      ])
        await assert.rejects(
          service.patchMenuPrices(
            v.restaurantId,
            { ...input, items },
            "test",
            "격리 검증",
            false,
          ),
        );
      assert.deepEqual(await service.menus(v.restaurantId), before);
      const results = await Promise.allSettled([
        service.patchMenuPrices(
          v.restaurantId,
          input,
          "test",
          "격리 검증",
          false,
        ),
        service.patchMenuPrices(
          v.restaurantId,
          input,
          "test",
          "동시 검증",
          false,
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const after = await service.menus(v.restaurantId);
      assert.equal(after.version, before.version + 1);
      assert.deepEqual(
        structuredClone(after.menus),
        structuredClone(
          before.menus.map((m) =>
            m.id === chosen.id ? { ...m, price: input.items[0].price } : m,
          ),
        ),
      );
      await service.patchMenuPrices(
        v.restaurantId,
        { ...input, expectedVersion: after.version },
        "test",
        "동일 가격",
        false,
      );
      assert.equal(
        (await service.menus(v.restaurantId)).version,
        after.version,
      );
      assert.equal(
        await db.manager.countBy(RestaurantOperation, {
          restaurantId: v.restaurantId,
        }),
        count + 1,
      );
      assert.deepEqual((await view(v.id)).order, v.order);
      assert.equal(
        (await db.manager.findOneByOrFail(Restaurant, { id: v.restaurantId }))
          .ownerAccountId,
        owner,
      );
    },
  );

  await t.test(
    "calendar projection shares deadline rules and does not mutate saved state or expose private facts",
    async () => {
      const v = await fixture();
      const r = await db.manager.findOneByOrFail(Restaurant, {
        id: v.restaurantId,
      });
      const me = await json<{ id: string }>(await call("auth/me", organizer));
      await db.manager.update(
        Restaurant,
        { id: r.id },
        { ownerAccountId: me.id },
      );
      try {
        const selection = await db.manager.findOneByOrFail(
          SelectedReservation,
          { id: v.id },
        );
        const row = await db.manager.save(ReservationProgress, {
          reservationId: v.id,
          state: initialPreparation(selection),
        });
        row.state.agreement.menuDeadlineAt = new Date(
          Date.now() + 1000,
        ).toISOString();
        await db.manager.save(ReservationProgress, row);
        const before = await db.manager.findOneByOrFail(SelectedReservation, {
          id: v.id,
        });
        const service = app.get(ReservationFactsService);
        const now = Date.now() + 2000;
        const rows = await service.calendar(
          me.id,
          r.id,
          new Date(0),
          new Date("2100-01-01"),
          db.manager,
          now,
        );
        const projected = rows.find((item) => item.reservationId === v.id)!;
        assert.equal(projected.progress, completionStatus(row.state, now));
        assert.deepEqual(
          projected.issueCodes,
          completionIssues(row.state, now),
        );
        assert.equal(projected.progress, "CHECK_REQUIRED");
        assert.equal(projected.status, before.status);
        assert.equal("preparation" in projected, false);
        assert.equal("guidance" in projected, false);
        assert.deepEqual(
          await db.manager.findOneByOrFail(SelectedReservation, { id: v.id }),
          before,
        );
        await db.manager.delete(ReservationProgress, { reservationId: v.id });
        const legacy = await service.calendar(
          me.id,
          r.id,
          new Date(0),
          new Date("2100-01-01"),
          db.manager,
          Date.now(),
        );
        assert.equal(
          legacy.find((item) => item.reservationId === v.id)?.progress,
          "MENU_REQUIRED",
        );
        await assert.rejects(
          service.calendar(
            randomUUID(),
            r.id,
            new Date(0),
            new Date("2100-01-01"),
            db.manager,
          ),
        );
      } finally {
        await db.manager.save(r);
      }
    },
  );
  await t.test(
    "owner inbox survives a missing link and owner menu edits serialize with operator price patches",
    async () => {
      const account = await existingOwner();
      const me = await json<{ id: string }>(await call("auth/me", account));
      let v = await fixture();
      const original = await db.manager.findOneByOrFail(Restaurant, {
        id: v.restaurantId,
      });
      await db.manager.update(
        Restaurant,
        { id: original.id },
        { ownerAccountId: me.id },
      );
      try {
        await db.manager.delete(ReservationManagementLink, {
          reservationId: v.id,
        });
        v = await post(v.id, "menu-submit", menu(v));
        const fact = (
          await db.manager.findBy(NotificationFact, { reservationId: v.id })
        ).find((f) => f.eventKey.includes(":MENU_SUBMITTED:"))!;
        assert.equal(fact.merchantHold?.reason, "MANAGEMENT_LINK_MISSING");
        assert(
          await db.manager.findOneBy(Notification, {
            accountId: me.id,
            eventKey: fact.eventKey,
          }),
        );
        const service = new RestaurantDataService(app.get(DatabaseService));
        const before = await service.menus(original.id);
        const chosen = before.menus[0];
        const [ownerResult, operatorResult] = await Promise.allSettled([
          call(`owner/restaurants/${original.id}/menus`, account, "PUT", {
            version: before.version,
            menu: {
              id: chosen.id,
              name: chosen.name,
              kind: chosen.kind,
              price: (chosen.price ?? 1000) + 7,
              unit: chosen.unit,
              available: chosen.available,
              position: chosen.position,
            },
          }).then((r) => {
            assert([200, 409].includes(r.status));
            return r.status;
          }),
          service.patchMenuPrices(
            original.id,
            {
              expectedVersion: before.version,
              evidence: "가상 확인",
              items: [{ id: chosen.id, price: (chosen.price ?? 1000) + 11 }],
            },
            "test",
            "동시 확인",
            false,
          ),
        ]);
        assert.equal(
          (ownerResult.status === "fulfilled" && ownerResult.value === 200
            ? 1
            : 0) + (operatorResult.status === "fulfilled" ? 1 : 0),
          1,
        );
        assert.equal(
          (await service.menus(original.id)).version,
          before.version + 1,
        );
        assert.deepEqual((await view(v.id)).order, v.order);
      } finally {
        await db.manager.update(
          Restaurant,
          { id: original.id },
          { ownerAccountId: original.ownerAccountId },
        );
      }
    },
  );
  await t.test(
    "calendar progress matches detail through menu, guidance, deadline, payment and confirmation transitions",
    async () => {
      const me = await json<{ id: string }>(await call("auth/me", organizer));
      const original = await db.manager.findOneByOrFail(Restaurant, {
        id: demoRestaurantIds[0],
      });
      await db.manager.update(
        Restaurant,
        { id: original.id },
        { ownerAccountId: me.id },
      );
      const assertProjection = async (v: View, now = Date.now()) => {
        const state =
          (
            await db.manager.findOneBy(ReservationProgress, {
              reservationId: v.id,
            })
          )?.state ??
          initialPreparation(
            await db.manager.findOneByOrFail(SelectedReservation, { id: v.id }),
          );
        const row = (
          await app
            .get(ReservationFactsService)
            .calendar(
              me.id,
              original.id,
              new Date(0),
              new Date("2100-01-01"),
              db.manager,
              now,
            )
        ).find((r) => r.reservationId === v.id)!;
        assert.equal(row.progress, completionStatus(state, now));
        assert.deepEqual(row.issueCodes, completionIssues(state, now));
        return row;
      };
      try {
        let none = await fixture();
        assert.equal((await assertProjection(none)).progress, none.progress);
        none = await post(none.id, "menu-submit", menu(none));
        assert.equal((await assertProjection(none)).progress, "CONFIRMED");
        let paid = await fixture("UNKNOWN");
        assert.equal((await assertProjection(paid)).progress, paid.progress);
        paid = await payments.guidance(paid.id, operator, guide(paid));
        paid = await post(paid.id, "menu-submit", {
          ...menu(paid),
          transfer: { payer: "가상 총무", amount: 10000 },
        });
        assert.equal(
          (await assertProjection(paid)).progress,
          "PAYMENT_CHECKING",
        );
        const overdue = await assertProjection(
          paid,
          Date.parse(paid.guidance.deadline!) + 1,
        );
        assert.equal(overdue.progress, "CHECK_REQUIRED");
        assert(overdue.issueCodes.includes("PAYMENT_LATE"));
        paid = await payments.receipt(paid.id, operator, {
          ...key(paid.version),
          guidanceRevision: paid.guidance.revision,
          amount: 10000,
          receivedAt: new Date().toISOString(),
          corrects: null,
          reason: "가상 실입금",
        });
        assert.equal((await assertProjection(paid)).progress, "CONFIRMED");
        assert.equal((await view(paid.id)).progress, "CONFIRMED");
      } finally {
        await db.manager.update(
          Restaurant,
          { id: original.id },
          { ownerAccountId: original.ownerAccountId },
        );
      }
    },
  );
  assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries, []);
});
