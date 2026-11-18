import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Restaurant,
  RestaurantConditions,
} from "../features/restaurants/types/restaurant.types";
import { conditionsMatch } from "../features/restaurants/lib/conditions-match";
import { spaceCost } from "../features/restaurants/lib/space-cost";
import {
  conditionsSchema,
  inquiryConditions,
} from "../features/reservations/schemas/conditions.schema";
const space: Restaurant["spaces"][number] = {
  id: "floor",
  kind: "FLOOR",
  label: "한 층",
  availability: "AVAILABLE",
  capacity: 25,
  minGuests: 0,
  togetherSeating: "YES",
  minSpend: null,
  separateFee: null,
  conditions: null,
};
const condition: RestaurantConditions = {
  expectedGuests: 30,
  seating: "CLOSE",
  space: "FLOOR",
};
test("capacity, availability and seating must match in one space; money is independent", () => {
  for (const [spaces, expected] of [
    [[], "인원·공간 확인 필요"],
    [[space], "인원·공간 조건 불일치"],
    [[{ ...space, capacity: null }], "인원·공간 확인 필요"],
    [
      [{ ...space, capacity: null, availability: "UNAVAILABLE" }],
      "인원·공간 조건 불일치",
    ],
    [[{ ...space, capacity: 40, minGuests: 35 }], "인원·공간 조건 불일치"],
    [
      [{ ...space, capacity: 40, togetherSeating: "NO" }],
      "인원·공간 조건 불일치",
    ],
    [
      [{ ...space, capacity: 40, togetherSeating: "UNKNOWN" }],
      "인원·공간 확인 필요",
    ],
    [[{ ...space, capacity: 40 }], "인원·공간 일치"],
    [
      [{ ...space, capacity: 40, minSpend: 900000, separateFee: 500000 }],
      "인원·공간 일치",
    ],
    [
      [{ ...space, kind: "HALL", capacity: 60 }, space],
      "인원·공간 조건 불일치",
    ],
    [
      [
        { ...space, capacity: 40, togetherSeating: "NO" },
        { ...space, capacity: 25 },
      ],
      "인원·공간 조건 불일치",
    ],
    [
      [
        { ...space, capacity: 40, availability: "UNKNOWN" },
        { ...space, capacity: 40 },
      ],
      "인원·공간 일치",
    ],
  ] as const) {
    assert.equal(
      conditionsMatch(
        { maxCapacity: 60, spaces: [...spaces] } as Restaurant,
        condition,
      ),
      expected,
    );
  }
  for (const label of ["최소 이용금액", "별도 대관료"]) {
    assert.equal(spaceCost(label, null), `${label} 확인 필요`);
    assert.equal(spaceCost(label, 0), `${label} 없음`);
    assert.equal(spaceCost(label, 600000), `${label} 600,000원`);
  }
});

test("ROOM uses its own capacity while unknown costs remain explicitly separate", () => {
  const restaurant = {
    maxCapacity: 190,
    spaces: [
      { ...space, kind: "HALL", capacity: 40 },
      { ...space, kind: "ROOM", label: "별도 룸", capacity: 20 },
    ],
  } as Restaurant;
  assert.equal(
    conditionsMatch(restaurant, {
      ...condition,
      space: "ROOM",
      expectedGuests: 21,
    }),
    "인원·공간 조건 불일치",
  );
  assert.equal(
    conditionsMatch(restaurant, {
      ...condition,
      space: "ROOM",
      expectedGuests: 20,
    }),
    "인원·공간 일치",
  );
  assert.equal(spaceCost("최소 이용금액", null), "최소 이용금액 확인 필요");
  assert.equal(spaceCost("별도 대관료", null), "별도 대관료 확인 필요");
});

test("room choice and importance survive form validation and inquiry conversion", () => {
  const values = conditionsSchema.parse({
    date: "2099-01-01",
    time: "18:00",
    expectedGuests: "20",
    region: "건대입구",
    seating: "CLOSE",
    space: "ROOM",
    seatingImportance: "PREFERRED",
    spaceImportance: "REQUIRED",
    budgetBasis: "PER_PERSON",
    budgetAmount: "",
    alcohol: "UNKNOWN",
    additionalRequests: "",
    contactName: "총무",
    contactPhone: "01000000000",
  });
  const inquiry = inquiryConditions(values);
  assert.equal(inquiry.space, "ROOM");
  assert.equal(inquiry.spaceImportance, "REQUIRED");
  assert.equal(inquiry.expectedGuests, 20);
});
