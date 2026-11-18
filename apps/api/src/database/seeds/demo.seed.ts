import { createHash } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import { Account } from "../../modules/auth/entities/account.entity.js";
import {
  hashPassword,
  passwordPattern,
} from "../../modules/auth/utils/password.js";
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
  options: { password: string; set: string; encryptionKey: Buffer; now?: Date },
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
    if (bootstrap)
      await seedDemoRestaurantRows(m, true, demoAccounts[3]!.phone);
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
            id: demoId("menu:set"),
            restaurantId: owned.id,
            name: "데모 단체 세트",
            kind: "SET",
            price: 48000,
            unit: "4인 세트",
            position: 1,
            available: true,
          },
          {
            id: demoId("menu:unknown"),
            restaurantId: owned.id,
            name: "데모 계절 메뉴",
            kind: "REGULAR",
            price: null,
            unit: "1접시",
            position: 2,
            available: true,
          },
          {
            id: demoId("menu:stopped"),
            restaurantId: owned.id,
            name: "데모 판매 중단 메뉴",
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
        name: ["데모 동아리", "데모 운영팀", "데모 B 모임"][i]!,
        groupType: "친목",
        creationKey: demoId(`group-key:${i}`),
        creationDigest: digest({ fixture: i }),
        createdAt: now,
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
    const rootId = demoId(`set:${options.set}:attendance`);
    const root = await m.findOneBy(Event, { id: rootId });
    if (root) {
      if (root.ownerId !== demoAccounts[0]!.id)
        throw new DemoSeedConflict("SET_OWNER_CONFLICT");
      // One transaction creates the whole set. Root presence is the completion receipt;
      // do not restore deleted children or change expirations on subsequent executions.
      counts.preserved++;
    } else {
      const scheduledAt = new Date(now.getTime() + 14 * 86400_000);
      for (const [index, key] of [
        "attendance",
        "waiting",
        "comparison",
        "private-b",
      ].entries()) {
        const id = demoId(`set:${options.set}:${key}`),
          ownerId = demoAccounts[index === 3 ? 1 : 0]!.id;
        if (await m.existsBy(Event, { id }))
          throw new DemoSeedConflict("SET_KEY_CONFLICT");
        const event = Object.assign(new Event(), {
          id,
          ownerId,
          groupId: index === 2 ? null : groupIds[index === 3 ? 2 : 0]!,
          version: 1,
          name: `[데모 ${options.set}] ${["참석 관리", "답변 대기", "응답 비교 · 개인 행사", "B의 비공개 행사"][index]}`,
          scheduledAt,
          createdAt: new Date(now.getTime() + index),
        });
        await m.insert(Event, event);
        if (index === 0) await attendance(m, event, options.set, now);
        if (index === 1 || index === 2)
          await inquiry(m, event, index === 2, options.encryptionKey, now);
        counts.created++;
      }
    }
    const events = await m.findBy(
      Event,
      ["attendance", "waiting", "comparison", "private-b"].map((key) => ({
        id: demoId(`set:${options.set}:${key}`),
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
  compare: boolean,
  key: Buffer,
  now: Date,
) {
  const indices = compare ? [0, 1, 3] : [0];
  const restaurants: Restaurant[] = [];
  for (const i of indices)
    restaurants.push(
      await m.findOneByOrFail(Restaurant, { id: demoRestaurantIds[i]! }),
    );
  const conditions = {
    startsAt: event.scheduledAt!.toISOString(),
    expectedGuests: 20,
    region: "건대입구",
    seating: "CLOSE" as const,
    space: "HALL" as const,
    seatingImportance: "PREFERRED" as const,
    spaceImportance: "PREFERRED" as const,
    budgetBasis: "PER_PERSON" as const,
    budgetAmount: 30000,
    alcohol: "UNKNOWN" as const,
    additionalRequests: "개발용 데모 문의 · 실제 예약/발송 아님",
  };
  const request = Object.assign(new ReservationRequest(), {
    id: demoId(`request:${event.id}`),
    eventId: event.id,
    requestKey: demoId(`request-key:${event.id}`),
    closedAt: null,
    digest: digest({
      conditions,
      contact: { name: demoAccounts[0]!.name, phone: demoAccounts[0]!.phone },
      restaurantIds: restaurants.map((r) => r.id).sort(),
      expectedEventVersion: 1,
    }),
    snapshot: {
      ...conditions,
      eventName: event.name,
      groupName: compare ? null : "데모 동아리",
      groupType: compare ? null : "친목",
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
      where: { restaurantId: r.id, active: true },
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
      replyVersion: compare ? (i === 1 ? 2 : 1) : 0,
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
    if (!compare) continue;
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
              deposit: { kind: "PER_RESERVATION" as const, amount: null },
              menuDeadlineAt: null,
              note: "데모 제안: 선택 기한까지 좌석을 유지한다고 가정한 fixture",
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
        reason: kind === "DECLINE" ? "데모 사례: 해당 일시 이용 불가" : "",
        holdConfirmed: kind !== "DECLINE",
      };
      await m.insert(MerchantReplyRevision, {
        id: demoId(`reply:${target.id}:${revision}`),
        targetId: target.id,
        revision,
        requestKey: input.requestKey,
        digest: digest(input),
        kind,
        snapshot: {
          ...request.snapshot,
          ...(proposal
            ? {
                startsAt: proposal.startsAt,
                expectedGuests: proposal.expectedGuests,
                space: proposal.space,
                seating: proposal.seating,
              }
            : {}),
          offered: proposal,
          requested: request.snapshot,
        },
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        actor: { kind: "MERCHANT_LINK", id: `${target.id}:1` },
        createdAt: new Date(now.getTime() + revision),
      });
    }
  }
}
