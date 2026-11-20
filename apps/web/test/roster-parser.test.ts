import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRoster,
  phoneSuffix,
  rosterTable,
} from "../features/roster/lib/parse-roster";
import { rosterRowSchema } from "../features/roster/schemas/roster.schema";
const simple = (source: string) =>
  parseRoster(source).map((row) => ({
    name: row.name,
    phoneLast4: row.phoneLast4,
  }));
test("mixed roster cases normalize full mobile numbers only and preserve cell boundaries", () => {
  for (const [source, expected] of [
    [
      "김민수, 이서연 010-1234-0012, 박지훈, 최유진 01098763456",
      [
        { name: "김민수", phoneLast4: "" },
        { name: "이서연", phoneLast4: "0012" },
        { name: "박지훈", phoneLast4: "" },
        { name: "최유진", phoneLast4: "3456" },
      ],
    ],
    ["김민수,010-1234-0012", [{ name: "김민수", phoneLast4: "0012" }]],
    ["김민수 010 1234 0012", [{ name: "김민수", phoneLast4: "0012" }]],
    ["김민수01012340012", [{ name: "김민수", phoneLast4: "0012" }]],
    ["김민수,0012", [{ name: "김민수", phoneLast4: "0012" }]],
    [
      "학번\t연락처\t성명\n20230001\t010-1234-0012\t김민수\n20230002\t\t이서연",
      [
        { name: "김민수", phoneLast4: "0012" },
        { name: "이서연", phoneLast4: "" },
      ],
    ],
    [
      "Alex Kim\n남궁 민수",
      [
        { name: "Alex Kim", phoneLast4: "" },
        { name: "남궁 민수", phoneLast4: "" },
      ],
    ],
  ] as const) {
    assert.deepEqual(simple(source), expected, source);
    for (const row of parseRoster(source))
      assert.equal(rosterRowSchema.safeParse(row).success, true, source);
  }
  for (const source of [
    "김민수 이서연",
    "010-1234-0012",
    "0012",
    "김민수 01012340012 01098763456",
    "김민수 20230101",
    "김민수 2023-01-01",
    "김민수0101234001234",
  ]) {
    assert.equal(
      rosterRowSchema.safeParse(parseRoster(source)[0]).success,
      false,
      source,
    );
  }
  const table = "20230001\t김민수\t01012340012\n20230002\t이서연\t";
  assert.equal(rosterTable(table)?.inferred, null);
  for (const ambiguous of [
    "김민수\t운영팀\n이서연\t홍보팀",
    "김민수\t20230001\n이서연\t20230002",
    "김민수\t이서연",
  ]) {
    assert.equal(rosterTable(ambiguous)?.inferred, null, ambiguous);
  }
  const mapped = parseRoster(table, { name: 1, phone: 2, header: false });
  assert.deepEqual(
    mapped.map((row) => [row.name, row.phoneLast4]),
    [
      ["김민수", "0012"],
      ["이서연", ""],
    ],
  );
  assert(
    parseRoster(table, { name: 1, phone: null, header: false }).every(
      (row) => row.phoneLast4 === "",
    ),
  );
  assert.throws(() => parseRoster("가".repeat(128 * 1024)));
  for (const name of ["01012340012", "김민수01012340012", "0012"]) {
    assert.equal(
      rosterRowSchema.safeParse({
        name,
        phoneLast4: "",
        label: "",
        match: "",
        parseError: "",
      }).success,
      false,
    );
  }
  const manual = rosterRowSchema.parse({
    name: " 김민수 ",
    phoneLast4: "010 1234 0012",
    label: "",
    match: "",
    parseError: "",
  });
  assert.equal(manual.phoneLast4, "0012");
  assert(!JSON.stringify(manual).includes("010"));
});

test("spreadsheet mobile numbers without the leading zero preserve their last four digits", () => {
  for (const source of [
    "김민수\t1029762915\n이서연\t1012340012",
    "이름\t전화번호\r\n김민수\t1029762915\r\n이서연\t1012340012",
    "김민수,1029762915\n이서연,1012340012",
    "김민수 1029762915\n이서연1012340012",
  ]) {
    assert.deepEqual(
      simple(source),
      [
        { name: "김민수", phoneLast4: "2915" },
        { name: "이서연", phoneLast4: "0012" },
      ],
      source,
    );
    for (const row of parseRoster(source))
      assert.equal(rosterRowSchema.safeParse(row).success, true, source);
    if (source.includes("\t")) assert(rosterTable(source)?.inferred);
  }

  const mapped = parseRoster("20230001\t1029762915\t김민수", {
    name: 2,
    phone: 1,
    header: false,
  });
  assert.equal(mapped[0].name, "김민수");
  assert.equal(mapped[0].phoneLast4, "2915");
  assert.equal(
    rosterRowSchema.parse({ ...mapped[0], phoneLast4: "1012340012" })
      .phoneLast4,
    "0012",
  );
});

test("missing-zero support does not turn ambiguous numbers into phone suffixes", () => {
  for (const value of [
    "20230001",
    "2023-01-01",
    "102976291",
    "10297629150",
    "21029762915",
    "1.029762915E+9",
    "12",
  ]) {
    assert.equal(phoneSuffix(value), value);
    assert.equal(rosterTable(`김민수\t${value}`)?.inferred, null, value);
    assert.equal(
      rosterRowSchema.safeParse(parseRoster(`김민수\t${value}`)[0]).success,
      false,
      value,
    );
  }
  for (const source of ["김민수10297629150", "김민수 1029762915 01012340012"]) {
    assert.equal(
      rosterRowSchema.safeParse(parseRoster(source)[0]).success,
      false,
    );
  }
});
