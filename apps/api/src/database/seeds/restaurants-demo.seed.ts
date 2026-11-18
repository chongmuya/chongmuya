import type { DataSource, EntityManager } from "typeorm";
import { Restaurant } from "../../modules/restaurants/entities/restaurant.entity.js";
import { RestaurantSpace } from "../../modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantContact } from "../../modules/restaurants/entities/restaurant-contact.entity.js";
import { claimSeedContact } from "./claim-contact.seed.js";

export const demoRestaurantIds = [1, 2, 3, 4].map(
  (n) => `c0210000-0000-4000-8000-${String(n).padStart(12, "0")}`,
);
// Internal test fixture; the public demo command creates accounts and scenarios together.
// Fixed IDs + DO NOTHING make reruns safe and preserve operator edits and inquiry references.
export async function seedDemoRestaurants(db: DataSource) {
  await db.transaction((manager) => seedDemoRestaurantRows(manager));
}

// The complete demo seed creates children only with a new restaurant root.
export async function seedDemoRestaurantRows(
  manager: EntityManager,
  preserveDeleted = false,
  ownerPhone?: string,
) {
  for (const [i, id] of demoRestaurantIds.entries()) {
    if (preserveDeleted && (await manager.existsBy(Restaurant, { id })))
      continue;
    const unknown = i === 2;
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(Restaurant)
      .values({
        id,
        name: [
          "가상 온기홀",
          "가상 한층식탁",
          "가상 확인중식당",
          "가상 사진없는집",
        ][i]!,
        address: `서울 광진구 가상 테스트길 ${i + 1} (실제 매장 아님)`,
        region: i % 2 === 0 ? "건대입구" : "세종대",
        category: "한식",
        latitude: i === 3 ? null : 37.543 + i * 0.001,
        longitude: i === 3 ? null : 127.07 + i * 0.001,
        maxCapacity: unknown ? null : [40, 60, 0, 20][i]!,
        photoPath: i < 2 ? `/images/restaurants/demo-${i + 1}.png` : null,
        operatingHours: unknown ? null : "17:00~23:00 · 테스트용 예시",
        facilities: unknown ? null : "화장실 · 이용 조건은 문의 후 확인",
        bookingPolicy: unknown
          ? null
          : "최소 1일 전 문의 · 실시간 좌석 재고 아님",
        depositPolicy: unknown
          ? null
          : "예약금은 문의 후 협의 · 이 정보로 송금하지 마세요",
        menuPolicy: unknown
          ? null
          : "일반 메뉴 주문 · 확정 기한은 문의 후 확인",
        cancellationPolicy: null,
        published: true,
        isDemo: true,
        verifiedAt: unknown ? null : new Date("2026-11-18T00:00:00Z"),
      })
      .orIgnore()
      .returning("id")
      .execute();
    const current = await manager.findOneByOrFail(Restaurant, { id });
    if (!current.isDemo) continue;
    if ((inserted.raw as unknown[]).length && i === 0) {
      await manager.update(
        Restaurant,
        { id },
        {
          spacePhotos: [
            {
              path: "/images/restaurants/demo-2.png",
              description: "가상 공간 사진 예시 2 · 실제 매장 아님",
              position: 2,
            },
            {
              path: "/images/restaurants/demo-1.png",
              description: "가상 공간 사진 예시 1 · 실제 매장 아님",
              position: 1,
            },
          ],
        },
      );
    }
    for (const [j, kind] of (["HALL", "FLOOR", "WHOLE"] as const).entries()) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(RestaurantSpace)
        .values({
          id: `c0220000-0000-4000-8000-${String(i * 3 + j + 1).padStart(12, "0")}`,
          restaurantId: id,
          label:
            kind === "HALL"
              ? "일반 홀"
              : kind === "FLOOR"
                ? "2층 단독 대관"
                : "전체 대관",
          kind,
          availability: unknown
            ? "UNKNOWN"
            : j === 0 || (i === 1 && j === 1)
              ? "AVAILABLE"
              : "UNAVAILABLE",
          togetherSeating: unknown ? "UNKNOWN" : "YES",
          capacity: unknown
            ? null
            : i === 1 && j === 1
              ? 25
              : i === 3
                ? 20
                : 40,
          minGuests: unknown ? null : j === 1 ? 20 : 0,
          minSpend: j === 1 && i === 1 ? 600000 : null,
          separateFee: unknown ? null : 0,
          conditions:
            j === 0
              ? "다른 손님과 함께 사용하는 일반 홀입니다."
              : "단독 사용 여부와 날짜별 가능 여부는 별도 확인합니다.",
        })
        .orIgnore()
        .execute();
    }
    await manager
      .createQueryBuilder()
      .insert()
      .into(RestaurantMenu)
      .values({
        id: `c0230000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        restaurantId: id,
        name: "테스트용 식사",
        kind: "REGULAR",
        price: unknown ? null : 12000,
        unit: "1인분",
        available: true,
      })
      .orIgnore()
      .execute();
    const contactId = `c0240000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    if (!(await claimSeedContact(manager, contactId))) continue;
    await manager
      .createQueryBuilder()
      .insert()
      .into(RestaurantContact)
      .values({
        id: contactId,
        restaurantId: id,
        name: "가상 운영 담당자",
        phone: i === 0 && ownerPhone ? ownerPhone : "00000000000",
        active: true,
        requestConsentAt: unknown ? null : new Date("2026-11-18T00:00:00Z"),
        consentNote:
          "개발 테스트 대역. 실제 연락·수신 동의 아님. 절대 발송 금지.",
      })
      .orIgnore()
      .execute();
  }
}
