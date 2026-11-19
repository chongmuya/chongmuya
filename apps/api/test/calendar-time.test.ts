import { test } from "node:test";
import assert from "node:assert/strict";
import {
  koreanDate,
  reminderAt,
  calendarRange,
  validDate,
} from "../src/modules/calendar/lib/calendar-time.js";
test("calendar KST boundaries, leap days, bounded ranges and previous-day 09:00", () => {
  assert.equal(koreanDate(new Date("2028-02-28T15:00:00Z")), "2028-02-29");
  assert.equal(
    reminderAt("2028-03-01").toISOString(),
    "2028-02-29T00:00:00.000Z",
  );
  assert.equal(
    reminderAt("2029-01-01").toISOString(),
    "2028-12-31T00:00:00.000Z",
  );
  assert(validDate("2028-02-29"));
  assert(!validDate("2027-02-29"));
  assert.equal(
    calendarRange("2028-02-01", "2028-03-01")?.from.toISOString(),
    "2028-01-31T15:00:00.000Z",
  );
  assert.equal(calendarRange("2028-01-01", "2028-04-01"), null);
});
