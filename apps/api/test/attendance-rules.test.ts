import assert from "node:assert/strict";
import { test } from "node:test";
import { identifyAttendance } from "../src/modules/events/lib/attendance-rules.js";
import type { EventParticipant } from "../src/modules/events/entities/event-participant.entity.js";
const person = (
  id: string,
  phoneLast4: string | null,
  groupMemberId: string | null = null,
  name = "김민수",
) => ({ id, name, phoneLast4, groupMemberId }) as EventParticipant;
test("identity precedence uses exact NFC names, does not collapse internal spaces or count source group member twice", () => {
  for (const [people, group, name, phone, kind] of [
    [
      [person("one", null, "source")],
      [{ id: "source", name: "김민수" }],
      "김민수",
      "0012",
      "FIRST",
    ],
    [
      [person("one", null, "source")],
      [
        { id: "source", name: "김민수" },
        { id: "another", name: "김민수" },
      ],
      "김민수",
      "0012",
      "REVIEW",
    ],
    [
      [person("one", "0012", "source")],
      [
        { id: "source", name: "김민수" },
        { id: "another", name: "김민수" },
      ],
      "김민수",
      "0012",
      "DIRECT",
    ],
    [
      [person("one", "3456", "source")],
      [
        { id: "source", name: "김민수" },
        { id: "another", name: "김민수" },
      ],
      "김민수",
      "0012",
      "REVIEW",
    ],
    [[person("one", "3456")], [], "김민수", "0012", "MISMATCH"],
    [
      [person("one", "0012"), person("two", "0012")],
      [],
      "김민수",
      "0012",
      "REVIEW",
    ],
    [[person("one", "0012", null, "김 민수")], [], "김민수", "0012", "REVIEW"],
    [
      [person("one", "0012", null, "김민수".normalize("NFD"))],
      [],
      "김민수",
      "0012",
      "DIRECT",
    ],
  ] as const)
    assert.equal(
      identifyAttendance([...people], [...group], name, phone).kind,
      kind,
    );
});
