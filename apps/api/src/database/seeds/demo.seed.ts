import { createHash } from "node:crypto";
import { In, type DataSource, type EntityManager } from "typeorm";
import { Account } from "../../modules/auth/entities/account.entity.js";
import {
  hashPassword,
  passwordPattern,
} from "../../modules/auth/utils/password.js";
import { GroupMembership } from "../../modules/groups/entities/group-membership.entity.js";
import { Group } from "../../modules/groups/entities/group.entity.js";
import { GroupMember } from "../../modules/groups/entities/group-member.entity.js";
import { Event } from "../../modules/events/entities/event.entity.js";
import { EventParticipant } from "../../modules/events/entities/event-participant.entity.js";
import { AttendanceRound } from "../../modules/events/entities/attendance-round.entity.js";
import { AttendanceResponse } from "../../modules/events/entities/attendance-response.entity.js";
import { AttendanceReview } from "../../modules/events/entities/attendance-review.entity.js";
import { Restaurant } from "../../modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantMenu } from "../../modules/restaurants/entities/restaurant-menu.entity.js";
import { ReservationRequest } from "../../modules/reservations/entities/reservation-request.entity.js";
import { MessageDelivery } from "../../modules/reservations/entities/message-delivery.entity.js";
import { RequestTarget } from "../../modules/reservations/entities/request-target.entity.js";
import { MerchantReplyLink } from "../../modules/reservations/entities/merchant-reply-link.entity.js";
import { MerchantReplyRevision } from "../../modules/reservations/entities/merchant-reply.entity.js";
import { SelectedReservation } from "../../modules/reservations/entities/selected-reservation.entity.js";
import {
  ReservationChange,
  ReservationCompletionHistory,
  ReservationProgress,
} from "../../modules/reservations/entities/reservation-progress.entity.js";
import { EventSettlement } from "../../modules/settlements/entities/settlement.entity.js";
import { issueMerchantToken } from "../../modules/reservations/lib/merchant-link-codec.js";
import { newMessageDelivery } from "../../modules/reservations/lib/message-delivery.js";
import {
  demoRestaurantIds,
  seedDemoRestaurantRows,
} from "./restaurants-demo.seed.js";

// Stable UUID namespace is exclusive to these local fixtures, not an identity matcher.
export function demoId(key: string) {
  const h = createHash("sha256")
    .update(`chongmuya-local-demo-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const demoAccounts = [
  ["organizer.a", "organizer", "데모 총무 A"],
  ["organizer.b", "organizer", "데모 총무 B"],
  ["organizer.empty", "organizer", "데모 빈 총무"],
  ["owner.a", "owner", "데모 사장님 A"],
  ["owner.empty", "owner", "데모 빈 사장님"],
].map(([key, role, name], i) => ({
  id: demoId(`account:${key}`),
  email: `${key}@example.test`,
  role: role as "organizer" | "owner",
  name: name!,
  phone: `0100000000${i + 1}`,
}));
export class DemoSeedConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const demoEvents = [
  { key: "attendance", name: "동아리 정기 모임", groupIndex: 0 },
  { key: "waiting", name: "운영팀 회식", groupIndex: 1 },
  { key: "comparison", name: "친구들과 송년 모임", groupIndex: null },
  { key: "private-b", name: "다온 정기 모임", groupIndex: 2 },
  { key: "payment", name: "예약금 입금 확인 대기", groupIndex: 1 },
  { key: "settlement", name: "지난 모임 정산 기록", groupIndex: 0 },
] as const;

const setEventId = (set: string, key: string) => demoId(`set:${set}:${key}`);
const paymentId = (eventId: string) => demoId(`selection:${eventId}`);
const demoPaymentVersion = 5;
const demoSetMenu = {
  id: demoId("menu:set"),
  name: "단체 모둠 세트",
  kind: "SET",
  price: 48000,
  unit: "4인 세트",
  position: 1,
  available: true,
} as const;

const names = [
  "김민수",
  "이서연",
  "박지훈",
  "최유진",
  "정수빈",
  "정수빈",
  "한지우",
  "윤서준",
  "오하늘",
  "강민지",
  "서도윤",
  "문예린",
  "신유나",
  "백지호",
  "임서아",
  "안태현",
  "송지안",
  "홍서진",
  "남도현",
  "유채원",
];
const phoneLast4 = (i: number) =>
  i === 1
    ? null
    : i === 4 || i === 5
      ? "7788"
      : i === 0
        ? "0012"
        : String(1000 + i);

export async function seedDemo(
  db: DataSource,
  options: {
    password: string;
    set: string;
    encryptionKey: Buffer;
    now?: Date;
    recreate?: boolean;
  },
) {
  if (
    !passwordPattern.test(options.password) ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(options.set)
  )
    throw new DemoSeedConflict("INVALID_SEED_INPUT");
  // Hash outside the transaction; no authentication or external provider is booted.
  const passwordHash = await hashPassword(options.password),
    now = options.now ?? new Date();
  const counts = { created: 0, preserved: 0, conflicts: 0 };
  return db.transaction(async (m) => {
    await m.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('local-demo-seed',0))",
    );
    // The first organizer account is the transactional completion receipt for shared fixtures.
    const bootstrap = !(await m.existsBy(Account, { id: demoAccounts[0]!.id }));
    for (const a of demoAccounts) {
      const existing = await m.findOneBy(Account, [
        { id: a.id },
        { email: a.email },
      ]);
      if (existing) {
        if (
          existing.id !== a.id ||
          existing.email !== a.email ||
          existing.accountType !== a.role
        )
          throw new DemoSeedConflict("ACCOUNT_ID_EMAIL_ROLE_CONFLICT");
        counts.preserved++;
      } else {
        if (!bootstrap) throw new DemoSeedConflict("DEMO_ACCOUNT_MISSING");
        await m.insert(Account, {
          id: a.id,
          email: a.email,
          accountType: a.role,
          name: a.name,
          nickname: a.role === "organizer" ? a.name : null,
          phone: a.phone,
          passwordHash,
          createdAt: now,
          // Synthetic local fixtures. No Resend/Octomo/Kakao verification took place.
          emailVerifiedAt: now,
          phoneVerifiedAt: now,
          emailVerificationSource: null,
          credentialsChangedAt: null,
        });
        counts.created++;
      }
    }
    const freshRestaurant = !(await m.existsBy(Restaurant, {
      id: demoRestaurantIds[0]!,
    }));
    if (bootstrap) await seedDemoRestaurantRows(m, demoAccounts[3]!.phone);
    else
      for (const id of demoRestaurantIds) {
        if (!(await m.existsBy(Restaurant, { id, isDemo: true })))
          throw new DemoSeedConflict("DEMO_RESTAURANT_MISSING_OR_CHANGED");
      }
    const owned = await m.findOneByOrFail(Restaurant, {
      id: demoRestaurantIds[0]!,
    });
    if (
      !owned.isDemo ||
      (owned.ownerAccountId && owned.ownerAccountId !== demoAccounts[3]!.id)
    )
      throw new DemoSeedConflict("DEMO_RESTAURANT_OWNER_CONFLICT");
    const initializeOwnedCatalog =
      bootstrap && (freshRestaurant || !owned.ownerAccountId);
    if (bootstrap && !owned.ownerAccountId)
      await m.update(
        Restaurant,
        { id: owned.id },
        { ownerAccountId: demoAccounts[3]!.id },
      );
    if (initializeOwnedCatalog)
      await m
        .createQueryBuilder()
        .insert()
        .into(RestaurantMenu)
        .values([
          {
            ...demoSetMenu,
            restaurantId: owned.id,
          },
          {
            id: demoId("menu:unknown"),
            restaurantId: owned.id,
            name: "계절 메뉴",
            kind: "REGULAR",
            price: null,
            unit: "1접시",
            position: 2,
            available: true,
          },
          {
            id: demoId("menu:stopped"),
            restaurantId: owned.id,
            name: "봄 한정 메뉴",
            kind: "REGULAR",
            price: 15000,
            unit: "1인분",
            position: 3,
            available: false,
          },
        ])
        .orIgnore()
        .execute();
    const groupIds = [
      demoId("group:a1"),
      demoId("group:a2"),
      demoId("group:b1"),
    ];
    for (const [i, id] of groupIds.entries()) {
      const ownerId = demoAccounts[i === 2 ? 1 : 0]!.id;
      const old = await m.findOneBy(Group, { id });
      if (old) {
        if (old.ownerId !== ownerId)
          throw new DemoSeedConflict("GROUP_OWNER_CONFLICT");
        counts.preserved++;
        continue;
      }
      if (!bootstrap) throw new DemoSeedConflict("DEMO_GROUP_MISSING");
      await m.insert(Group, {
        id,
        ownerId,
        name: ["늘봄 동아리", "늘봄 운영팀", "다온 모임"][i]!,
        groupType: "친목 모임",
        creationKey: demoId(`group-key:${i}`),
        creationDigest: digest({ fixture: i }),
        createdAt: now,
      });
      await m.insert(GroupMembership, {
        groupId: id,
        accountId: ownerId,
        role: "ADMIN",
        joinedAt: now,
      });
      await m.insert(
        GroupMember,
        names.map((name, j) => ({
          id: demoId(`member:${i}:${j}`),
          groupId: id,
          name,
          phoneLast4: phoneLast4(j),
          label: null,
          position: j,
          createdAt: now,
        })),
      );
      counts.created++;
    }
    if (options.recreate) await recreateDemoSet(m, options.set);
    const rootId = setEventId(options.set, "attendance");
    const root = await m.findOneBy(Event, { id: rootId });
    if (root) {
      if (root.ownerId !== demoAccounts[0]!.id)
        throw new DemoSeedConflict("SET_OWNER_CONFLICT");
      // One transaction creates the whole set. Root presence is the completion receipt;
      // do not restore deleted children or change expirations on subsequent executions.
      counts.preserved++;
    } else {
      const scheduledAt = new Date(now.getTime() + 14 * 86400_000);
      for (const { key, name, groupIndex } of demoEvents) {
        const id = setEventId(options.set, key);
        const ownerId = demoAccounts[key === "private-b" ? 1 : 0]!.id;
        if (await m.existsBy(Event, { id }))
          throw new DemoSeedConflict("SET_KEY_CONFLICT");
        const needsReservation =
          key === "waiting" || key === "comparison" || key === "payment";
        const startsAt =
          key === "settlement"
            ? new Date(now.getTime() - 7 * 86400_000)
            : scheduledAt;
        const event = Object.assign(new Event(), {
          id,
          ownerId,
          groupId: groupIndex === null ? null : groupIds[groupIndex]!,
          version: needsReservation ? 2 : 1,
          expectedGuests: needsReservation ? 20 : null,
          reservationScheduleLocked: needsReservation,
          name,
          scheduledAt: startsAt,
          createdAt: key === "settlement" ? startsAt : now,
        });
        await m.insert(Event, event);
        if (key === "attendance") await attendance(m, event, options.set, now);
        if (needsReservation)
          await inquiry(m, event, key, options.encryptionKey, now);
        if (key === "settlement")
          await seedSettlementRecord(m, event, startsAt);
        counts.created++;
      }
    }
    const events = await m.findBy(
      Event,
      demoEvents.map(({ key }) => ({
        id: setEventId(options.set, key),
      })),
    );
    const links = await m
      .createQueryBuilder(MerchantReplyLink, "l")
      .innerJoin(RequestTarget, "t", "t.id=l.target_id")
      .innerJoin(ReservationRequest, "r", "r.id=t.request_id")
      .where("r.event_id IN (:...ids)", { ids: events.map((e) => e.id) })
      .getMany();
    return {
      counts,
      accounts: demoAccounts.map(({ id, email, role }) => ({
        id,
        email,
        role,
      })),
      restaurantIds: demoRestaurantIds,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        path: `/events?event=${e.id}`,
        expired: !!e.scheduledAt && e.scheduledAt <= now,
      })),
      expiredLinks: links.filter((l) => l.expiresAt <= now || l.revokedAt)
        .length,
      note: "개발 fixture 인증 시각·동의입니다. 외부 인증·실제 발송을 수행하지 않았습니다.",
    };
  });
}
async function attendance(
  m: EntityManager,
  event: Event,
  set: string,
  now: Date,
) {
  const members = await m.find(GroupMember, {
    where: { groupId: event.groupId! },
    order: { position: "ASC" },
  });
  const people = members.map((a, i) => ({
    id: demoId(`set:${set}:participant:${i}`),
    eventId: event.id,
    groupMemberId: a.id,
    name: a.name,
    phoneLast4: a.phoneLast4,
    label: a.label,
    position: i,
    version: 1,
    identityVersion: 1,
    createdAt: now,
  }));
  if (people.length) await m.insert(EventParticipant, people);
  for (let i = 0; i < 2; i++) {
    const roundId = demoId(`set:${set}:round:${i}`);
    await m.insert(AttendanceRound, {
      id: roundId,
      eventId: event.id,
      title: `${i + 1}차`,
      position: i + 1,
      shareId: demoId(`set:${set}:share:${i}`),
      requestKey: demoId(`set:${set}:round-key:${i}`),
      closedAt: i === 1 ? now : null,
      revokedAt: null,
      createdAt: now,
    });
    const responses = people
      .slice(0, 8)
      .filter((_, j) => j !== 1)
      .map((a, j) => ({
        roundId,
        participantId: a.id,
        eventId: event.id,
        selfAnswer: j % 3 === 0 ? ("ABSENT" as const) : ("ATTENDING" as const),
        managerOverride: j === 0 ? ("ATTENDING" as const) : null,
        version: 1,
        selfRespondedAt: now,
        overriddenAt: j === 0 ? now : null,
      }));
    if (responses.length) await m.insert(AttendanceResponse, responses);
    if (i === 0)
      await m.insert(AttendanceReview, [
        {
          id: demoId(`set:${set}:review:duplicate`),
          eventId: event.id,
          roundId,
          name: "정수빈",
          phoneLast4: "7788",
          answer: "ATTENDING",
          reason: "DUPLICATE_IDENTITY",
          status: "PENDING",
          version: 1,
          submittedAt: now,
          participantId: null,
          processedAt: null,
          resolution: null,
        },
        {
          id: demoId(`set:${set}:review:missing`),
          eventId: event.id,
          roundId,
          name: "새로운친구",
          phoneLast4: "8899",
          answer: "ATTENDING",
          reason: "NOT_LISTED",
          status: "PENDING",
          version: 1,
          submittedAt: now,
          participantId: null,
          processedAt: null,
          resolution: null,
        },
      ]);
  }
}
async function inquiry(
  m: EntityManager,
  event: Event,
  scenario: "waiting" | "comparison" | "payment",
  key: Buffer,
  now: Date,
) {
  const compare = scenario === "comparison";
  const payment = scenario === "payment";
  await m.insert(AttendanceRound, {
    id: demoId(`first-round:${event.id}`),
    eventId: event.id,
    title: "1차",
    position: 1,
    shareId: demoId(`first-round-share:${event.id}`),
    requestKey: demoId(`first-round-key:${event.id}`),
    createdAt: now,
  });
  const indices = compare ? [0, 1, 3] : [0];
  const restaurants: Restaurant[] = [];
  for (const i of indices)
    restaurants.push(
      await m.findOneByOrFail(Restaurant, { id: demoRestaurantIds[i]! }),
    );
  const group = event.groupId
    ? await m.findOneByOrFail(Group, { id: event.groupId })
    : null;
  const conditions = {
    startsAt: event.scheduledAt!.toISOString(),
    expectedGuests: event.expectedGuests!,
    region: "건대입구",
    seating: "CLOSE" as const,
    space: "HALL" as const,
    seatingImportance: "PREFERRED" as const,
    spaceImportance: "PREFERRED" as const,
    budgetBasis: "PER_PERSON" as const,
    budgetAmount: 30000,
    alcohol: "UNKNOWN" as const,
    additionalRequests: "일행이 가까운 자리에 앉을 수 있으면 좋겠어요.",
  };
  const request = Object.assign(new ReservationRequest(), {
    id: demoId(`request:${event.id}`),
    eventId: event.id,
    requestKey: demoId(`request-key:${event.id}`),
    closedAt: payment ? now : null,
    state: payment ? "SELECTED" : "ACTIVE",
    version: payment ? 3 : compare ? 5 : 1,
    createdById: event.ownerId,
    currentContactAccountId: event.ownerId,
    currentContactName: demoAccounts[0]!.name,
    currentContactPhone: demoAccounts[0]!.phone,
    digest: digest({
      conditions,
      contact: { name: demoAccounts[0]!.name, phone: demoAccounts[0]!.phone },
      restaurantIds: restaurants.map((r) => r.id).sort(),
      expectedEventVersion: 1,
    }),
    snapshot: {
      ...conditions,
      eventName: event.name,
      groupName: group?.name ?? null,
      groupType: group?.groupType ?? null,
    },
    contactName: demoAccounts[0]!.name,
    contactPhone: demoAccounts[0]!.phone,
    contactPhoneVerifiedAt: now,
    createdAt: event.createdAt,
  });
  await m.insert(ReservationRequest, request);
  for (const [i, r] of restaurants.entries()) {
    if (!r.isDemo || !r.published)
      throw new DemoSeedConflict("DEMO_RESTAURANT_NOT_ELIGIBLE");
    const contact = await m.findOne(RestaurantContact, {
      where: { restaurantId: r.id, active: true, isPrimary: true },
      order: { id: "ASC" },
    });
    if (!contact?.requestConsentAt)
      throw new DemoSeedConflict("DEMO_CONTACT_NOT_ELIGIBLE");
    const target = Object.assign(new RequestTarget(), {
      id: demoId(`target:${event.id}:${r.id}`),
      requestId: request.id,
      restaurantId: r.id,
      restaurantName: r.name,
      address: r.address,
      isDemo: true,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      consentAt: contact.requestConsentAt,
      deliveryStatus: "ACCEPTED",
      candidateState: payment ? "SELECTED" : "OPEN",
      replyVersion: compare && i === 1 ? 2 : scenario === "waiting" ? 0 : 1,
    });
    await m.insert(RequestTarget, target);
    const link = Object.assign(new MerchantReplyLink(), {
      targetId: target.id,
      contactId: contact.id,
      phoneSnapshot: contact.phone,
      ...issueMerchantToken(key),
      generation: 1,
      expiresAt: new Date(now.getTime() + 7 * 86400_000),
      revokedAt: null,
    });
    await m.insert(MerchantReplyLink, link);
    const delivery = newMessageDelivery(
      request,
      target,
      link,
      "NEW_INQUIRY",
      demoId(`delivery:${target.id}`),
      now,
    );
    Object.assign(delivery, {
      provider: "fake",
      status: "ACCEPTED",
      attempts: 1,
      startedAt: now,
      providerMessageId: `fake-${delivery.id}`,
    });
    await m.insert(MessageDelivery, delivery);
    for (let revision = 1; revision <= target.replyVersion; revision++) {
      const kind =
        i === 0
          ? ("AVAILABLE" as const)
          : i === 1
            ? ("CHANGE" as const)
            : ("DECLINE" as const);
      const proposal =
        kind === "DECLINE"
          ? null
          : {
              startsAt: conditions.startsAt,
              expectedGuests: i === 1 ? (revision === 1 ? 19 : 18) : 20,
              space: conditions.space,
              seating: conditions.seating,
              minimumSpend: null,
              separateFee: 0,
              deposit: payment
                ? { kind: "FIXED" as const, amount: 20000 }
                : { kind: "PER_RESERVATION" as const, amount: null },
              menuDeadlineAt: payment
                ? new Date(now.getTime() + 7 * 86400_000).toISOString()
                : null,
              note:
                i === 1
                  ? "한 공간에 함께 앉으시려면 18명까지 가능해요."
                  : "요청하신 조건으로 이용하실 수 있어요.",
            };
      const input = {
        requestKey: demoId(`reply-key:${target.id}:${revision}`),
        expectedVersion: revision - 1,
        kind,
        proposal,
        expiresAt:
          kind === "DECLINE"
            ? null
            : new Date(now.getTime() + 12 * 3600_000).toISOString(),
        reason: kind === "DECLINE" ? "해당 일시에 다른 예약이 있어요." : "",
        holdConfirmed: kind !== "DECLINE",
      };
      const snapshot = {
        offered: proposal,
        requested: request.snapshot,
        holdConfirmed: input.holdConfirmed,
      };
      await m.insert(MerchantReplyRevision, {
        id: demoId(`reply:${target.id}:${revision}`),
        targetId: target.id,
        revision,
        requestKey: input.requestKey,
        digest: digest(input),
        kind,
        snapshot,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        actor: { kind: "MERCHANT_LINK", id: `${target.id}:1` },
        createdAt: payment ? now : new Date(now.getTime() + revision),
      });
      if (payment && proposal)
        await seedPaymentReview(
          m,
          event,
          target,
          { ...snapshot, offered: proposal },
          now,
        );
    }
  }
}

async function seedPaymentReview(
  m: EntityManager,
  event: Event,
  target: RequestTarget,
  snapshot: MerchantReplyRevision["snapshot"] & {
    offered: ReservationProgress["state"]["agreement"];
  },
  now: Date,
) {
  const reservationId = paymentId(event.id);
  const at = now.toISOString();
  const amount = snapshot.offered.deposit.amount!;
  const ownerId = demoAccounts[3]!.id;
  const audit = {
    kind: "OWNER",
    recorder: ownerId,
    confirmer: ownerId,
    method: "WEB",
    confirmedAt: at,
    recordedAt: at,
    reason: "개발용 가상 입금 안내",
  };
  const { id, name, unit, price } = demoSetMenu;
  const quantity = 5;
  const state: ReservationProgress["state"] = {
    agreementRevision: 1,
    agreement: snapshot.offered,
    guidance: {
      revision: 2,
      kind: "REQUIRED",
      amount,
      deadline: snapshot.offered.menuDeadlineAt,
      channel: "SMS",
      bank: "데모 은행",
      account: "DEMO-ONLY",
      holder: "데모 매장",
      policy: "개발용 가상 예약금 안내",
      issuedAt: at,
      audit,
    },
    draft: null,
    order: {
      revision: 1,
      catalogVersion: 1,
      lines: [{ id, name, unit, price, quantity, subtotal: price * quantity }],
      total: price * quantity,
      currency: "KRW",
      submittedAt: at,
    },
    acknowledgedRevision: 2,
    acknowledgedAt: at,
    transfer: {
      guidanceRevision: 2,
      payer: demoAccounts[0]!.name,
      amount,
      reportedAt: at,
    },
    receipt: null,
    exceptionResolution: null,
    confirmation: null,
    refundExpected: null,
    refunded: 0,
    cancellation: null,
  };
  await m.insert(SelectedReservation, {
    id: reservationId,
    eventId: event.id,
    requestId: target.requestId,
    targetId: target.id,
    revision: target.replyVersion,
    version: demoPaymentVersion,
    status: "PREPARING",
    snapshot,
    selectedBy: event.ownerId,
    selectedAt: now,
  });
  await m.insert(ReservationProgress, { reservationId, state });
  const changeId = demoId(`change:${reservationId}`);
  await m.insert(ReservationChange, {
    id: changeId,
    reservationId,
    kind: "CHANGE",
    subject: "SCHEDULE",
    reason: "일정을 한 시간 늦추고 싶어요.",
    status: "REJECTED",
    createdAt: now,
    resolvedAt: now,
  });
  const command = {
    requestKey: demoId(`reject-change:${reservationId}`),
    expectedVersion: demoPaymentVersion - 1,
    changeId,
    reason: "다음 시간대에 다른 예약이 있어요.",
  };
  await m.insert(ReservationCompletionHistory, {
    id: demoId(`history:${reservationId}`),
    reservationId,
    requestKey: command.requestKey,
    digest: digest(command),
    action: "CHANGE_REJECTED",
    version: demoPaymentVersion,
    audit: { ...audit, reason: command.reason },
    snapshot: state,
    evidence: { command },
  });
}

async function seedSettlementRecord(m: EntityManager, event: Event, day: Date) {
  const at = day.toISOString();
  const roundId = demoId(`record-round:${event.id}`);
  await m.insert(AttendanceRound, {
    id: roundId,
    eventId: event.id,
    title: "1차",
    position: 1,
    shareId: demoId(`record-share:${event.id}`),
    requestKey: demoId(`record-round-key:${event.id}`),
    closedAt: day,
    createdAt: day,
  });
  const people = names.slice(0, 3).map((name, i) => ({
    id: demoId(`record-participant:${event.id}:${i}`),
    name,
    label: null,
    phoneLast4: phoneLast4(i),
    version: 1,
  }));
  await m.insert(
    EventParticipant,
    people.map((person, position) => ({
      ...person,
      eventId: event.id,
      position,
      createdAt: day,
    })),
  );
  await m.insert(
    AttendanceResponse,
    people.map(({ id }) => ({
      roundId,
      eventId: event.id,
      participantId: id,
      managerOverride: "ATTENDING",
      overriddenAt: day,
    })),
  );
  const expense: EventSettlement["state"]["expenses"][number] = {
    id: demoId(`record-expense:${event.id}`),
    roundId,
    name: "모임 간식",
    total: 10000,
    deposit: 0,
    includeDeposit: true,
    support: 0,
    reservationId: null,
    memo: "",
    payers: people,
    remainder: null,
    remainderOrganizerId: event.ownerId,
    fileIds: [],
    version: 1,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  const share = Math.floor(expense.total / people.length);
  const target = share * people.length;
  const remainder = expense.total - target;
  await m.insert(EventSettlement, {
    eventId: event.id,
    state: {
      version: 5,
      calculationVersion: 1,
      finalizedAt: at,
      expenses: [expense],
      payments: people.map((person) => ({
        id: demoId(`record-receipt:${person.id}`),
        participant: person,
        kind: "RECEIPT",
        amount: share,
        corrects: null,
        reason: "개발용 입금 기록",
        actorId: event.ownerId,
        at,
        calculationVersion: 1,
      })),
      notices: [
        {
          id: demoId(`record-notice:${event.id}`),
          replaces: null,
          title: "지난 모임 정산 안내",
          message: "",
          bank: null,
          deadline: null,
          includePeople: false,
          scope: "UNCONFIRMED",
          text: `[지난 모임 정산 안내]\n${expense.name} ${expense.total.toLocaleString("ko-KR")}원 · 총무 부담 ${remainder}원\n추가 입금 요청이 없습니다.`,
          calculationVersion: 1,
          createdAt: at,
          actorId: event.ownerId,
          snapshot: {
            expenses: [expense],
            people: [],
            total: expense.total,
            target,
            organizerRemainder: remainder,
          },
        },
      ],
      memo: "",
    },
  });
}

// Explicitly scoped local fixture replacement. Shared accounts, catalog and groups never change.
async function recreateDemoSet(m: EntityManager, set: string) {
  const ids = demoEvents.map(({ key }) => setEventId(set, key));
  const rows = await m.find(Event, {
    where: { id: In(ids) },
    order: { id: "ASC" },
    lock: { mode: "pessimistic_write" },
  });
  if (
    rows.some(
      (row) =>
        row.ownerId !==
        demoAccounts[row.id === setEventId(set, "private-b") ? 1 : 0]!.id,
    )
  )
    throw new DemoSeedConflict("SET_OWNER_CONFLICT");
  const [unsafe] = (await m.query(
    `SELECT EXISTS(SELECT 1 FROM reservation_requests r JOIN reservation_request_targets t ON t.request_id=r.id JOIN restaurants s ON s.id=t.restaurant_id LEFT JOIN message_deliveries d ON d.target_id=t.id WHERE r.event_id=ANY($1::uuid[]) AND (s.is_demo=false OR t.is_demo=false OR d.provider IS DISTINCT FROM 'fake')) AS unsafe`,
    [ids],
  )) as { unsafe: boolean }[];
  if (unsafe?.unsafe)
    throw new DemoSeedConflict("SET_CONTAINS_NON_DEMO_DELIVERY");
  const reservationId = paymentId(setEventId(set, "payment"));
  const settlementId = setEventId(set, "settlement");
  const [record] = (await m.query(
    `SELECT (
      EXISTS (SELECT 1 FROM selected_reservations WHERE event_id=ANY($1::uuid[]) AND (id<>$2 OR version<>$3))
      OR EXISTS (SELECT 1 FROM reservation_decisions d JOIN reservation_requests r ON r.id=d.request_id WHERE r.event_id=ANY($1::uuid[]))
      OR EXISTS (SELECT 1 FROM event_settlements WHERE event_id=ANY($1::uuid[]) AND event_id<>$4)
      OR EXISTS (SELECT 1 FROM settlement_commands WHERE event_id=ANY($1::uuid[]))
      OR EXISTS (SELECT 1 FROM event_files WHERE event_id=ANY($1::uuid[]))
    ) AS protected`,
    [ids, reservationId, demoPaymentVersion, settlementId],
  )) as { protected: boolean }[];
  if (record?.protected)
    throw new DemoSeedConflict("SET_HAS_RESERVATION_OR_SETTLEMENT_RECORDS");

  for (const table of [
    "reservation_completion_history",
    "reservation_changes",
    "reservation_progress",
  ]) {
    await m.query(`DELETE FROM ${table} WHERE reservation_id=$1`, [
      reservationId,
    ]);
  }
  await m.delete(SelectedReservation, { id: reservationId });
  await m.delete(EventSettlement, { eventId: settlementId });

  for (const table of ["notifications", "notification_messages"]) {
    await m.query(
      `DELETE FROM ${table} WHERE event_key IN (SELECT event_key FROM notification_facts WHERE event_id=ANY($1::uuid[]))`,
      [ids],
    );
  }
  await m.query(
    "DELETE FROM notification_facts WHERE event_id=ANY($1::uuid[])",
    [ids],
  );

  const targets =
    "SELECT t.id FROM reservation_request_targets t JOIN reservation_requests r ON r.id=t.request_id WHERE r.event_id=ANY($1::uuid[])";
  await m.query(
    `DELETE FROM message_delivery_reports WHERE delivery_id IN (SELECT id FROM message_deliveries WHERE target_id IN (${targets}))`,
    [ids],
  );
  for (const table of [
    "reservation_operations",
    "merchant_reply_revisions",
    "merchant_reply_links",
    "message_deliveries",
  ])
    await m.query(`DELETE FROM ${table} WHERE target_id IN (${targets})`, [
      ids,
    ]);
  await m.query(
    `DELETE FROM reservation_request_targets WHERE id IN (${targets})`,
    [ids],
  );
  for (const table of [
    "reservation_requests",
    "attendance_reviews",
    "attendance_responses",
    "attendance_rounds",
    "event_roster_additions",
    "event_participants",
  ])
    await m.query(`DELETE FROM ${table} WHERE event_id=ANY($1::uuid[])`, [ids]);
  await m.query("DELETE FROM events WHERE id=ANY($1::uuid[])", [ids]);
}
