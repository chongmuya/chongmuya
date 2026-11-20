import assert from "node:assert/strict";
import { test } from "node:test";
import { spaceCost } from "../features/restaurants/lib/space-cost";
import {
  conditionsSchema,
  inquiryConditions,
  savedInquirySchedule,
} from "../features/reservations/schemas/conditions.schema";
test("unknown, zero and positive costs remain distinct", () => {
  for (const label of ["최소 이용금액", "별도 대관료"]) {
    assert.equal(spaceCost(label, null), `${label} 확인 필요`);
    assert.equal(spaceCost(label, 0), `${label} 없음`);
    assert.equal(spaceCost(label, 600000), `${label} 600,000원`);
  }
});

test("room choice and importance survive form validation and inquiry conversion", () => {
  const values = conditionsSchema.parse({
    date: "2099-01-01",
    time: "18:00",
    expectedGuests: "20",
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
  assert.equal(inquiry.region, "건대입구 · 세종대");
  assert.equal(inquiry.space, "ROOM");
  assert.equal(inquiry.spaceImportance, "REQUIRED");
  assert.equal(inquiry.expectedGuests, 20);

  const startsAt = "2099-01-01T09:00:45.000Z";
  const saved = savedInquirySchedule(startsAt);
  assert.deepEqual(saved, { date: values.date, time: values.time, startsAt });
  assert.equal(inquiryConditions(values, saved?.startsAt).startsAt, startsAt);
  assert.equal(savedInquirySchedule(null), null);
  assert.equal(savedInquirySchedule("2000-01-01T09:00:00.000Z"), null);
});
