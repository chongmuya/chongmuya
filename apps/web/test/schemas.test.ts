import assert from "node:assert/strict";
import { test } from "node:test";
import { groupSchema } from "../features/groups/schemas/group.schema";
import {
  eventInput,
  eventSchema,
} from "../features/events/schemas/event.schema";
import { credentialsSchema } from "../features/auth/schemas/credentials.schema";
import { cn } from "../shared/lib/cn";

test("form schemas preserve name, optional schedule and credential constraints", () => {
  assert.equal(groupSchema.safeParse({ name: "  " }).success, false);
  assert.equal(groupSchema.safeParse({ name: "x".repeat(101) }).success, false);
  assert.deepEqual(groupSchema.parse({ name: " 모임 " }), { name: "모임" });
  assert.deepEqual(eventInput(eventSchema.parse({ name: "행사", date: "" })), {
    name: "행사",
    scheduledAt: undefined,
  });
  for (const date of ["2026-02-30T10:00", "2026-11-14T25:00", "not-a-date"])
    assert.equal(eventSchema.safeParse({ name: "행사", date }).success, false);
  assert.equal(
    credentialsSchema.safeParse({
      email: "not-email",
      password: "123456789012",
    }).success,
    false,
  );
  assert.equal(
    credentialsSchema.safeParse({ email: "a@example.com", password: "short" })
      .success,
    false,
  );
  assert.equal(
    credentialsSchema.parse({
      email: " A@example.com ",
      password: " 0123456789 ",
    }).password,
    " 0123456789 ",
  );
  assert.equal(
    cn("px-4 bg-primary", false && "hidden", "px-2"),
    "bg-primary px-2",
  );
});
