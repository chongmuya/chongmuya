import assert from "node:assert/strict";
import { test } from "node:test";
import { groupSchema } from "../features/groups/schemas/group.schema";
import {
  eventInput,
  eventSchema,
} from "../features/events/schemas/event.schema";
import { credentialsSchema } from "../features/auth/schemas/credentials.schema";
import { cn } from "../shared/lib/cn";

test("cn preserves custom font sizes alongside colors and resolves size overrides", () => {
  for (const size of ["text-control", "text-caption", "text-label"]) {
    for (const color of ["text-white", "text-foreground"]) {
      assert.equal(cn(size, color), `${size} ${color}`);
      assert.equal(cn(color, size), `${color} ${size}`);
    }
    assert.equal(
      cn("text-sm text-danger", size, "text-accent"),
      `${size} text-accent`,
    );
    assert.equal(
      cn(size, "text-foreground text-sm"),
      "text-foreground text-sm",
    );
  }
  assert.equal(cn("text-label text-control text-caption"), "text-caption");
});

test("cn resolves project radius, control height and shadow overrides", () => {
  assert.equal(cn("rounded-pill", "rounded-control"), "rounded-control");
  assert.equal(cn("rounded-panel", "rounded-none"), "rounded-none");
  assert.equal(cn("rounded-lg", "rounded-card"), "rounded-card");
  assert.equal(cn("min-h-control", "min-h-[69px]"), "min-h-[69px]");
  assert.equal(cn("h-10", "h-input"), "h-input");
  assert.equal(cn("shadow-control", "shadow-card"), "shadow-card");
});

test("form schemas preserve name, optional schedule and credential constraints", () => {
  assert.equal(groupSchema.safeParse({ name: "  " }).success, false);
  assert.equal(groupSchema.safeParse({ name: "x".repeat(101) }).success, false);
  assert.deepEqual(groupSchema.parse({ name: " 모임 " }), { name: "모임" });
  assert.deepEqual(
    eventInput(eventSchema.parse({ name: "행사", groupId: "", date: "" })),
    {
      name: "행사",
      groupId: undefined,
      scheduledAt: undefined,
    },
  );
  for (const date of ["2026-02-30T10:00", "2026-11-14T25:00", "not-a-date"])
    assert.equal(
      eventSchema.safeParse({ name: "행사", groupId: "", date }).success,
      false,
    );
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
      password: "!0123456789~",
    }).password,
    "!0123456789~",
  );
  assert.equal(
    cn("px-4 bg-primary", false && "hidden", "px-2"),
    "bg-primary px-2",
  );
});
