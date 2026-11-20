import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocation,
  calculate,
  MAX_MONEY,
} from "../src/modules/settlements/lib/calculate.js";
import {
  initialSettlement,
  type Expense,
} from "../src/modules/settlements/types/settlement.js";
const people = Array.from({ length: 31 }, (_, i) => ({
  id: String(i),
  name: "동명이인",
  label: String(i),
  phoneLast4: "0012",
  version: 1,
}));
const expense = (p: Partial<Expense> = {}): Expense => ({
  id: "e",
  roundId: "r",
  name: "식사",
  total: 500000,
  deposit: 100000,
  includeDeposit: true,
  support: 0,
  reservationId: null,
  memo: "",
  payers: people.slice(0, 3),
  remainder: people[0]!,
  fileIds: [],
  version: 1,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  ...p,
});
test("all integer allocation examples, drafts, outside remainder, order invariance and overflow", () => {
  for (const [e, amount] of [
    [expense(), 500000],
    [expense({ includeDeposit: false, support: 50000 }), 350000],
    [expense({ support: 150000 }), 350000],
    [expense({ total: 50000, deposit: 0, support: 50000, payers: [] }), 0],
  ] as const) {
    const a = allocation(e);
    assert.equal(a.amount, amount);
    assert.equal(a.draft, false);
    assert.equal(
      Object.values(a.values).reduce((x, y) => x + y, 0),
      amount,
    );
  }
  assert.throws(() =>
    allocation(
      expense({
        total: 50000,
        deposit: 30000,
        includeDeposit: false,
        support: 30000,
      }),
    ),
  );
  const e = expense({ total: 10000, deposit: 0 });
  assert.deepEqual(allocation(e).values, { "0": 3334, "1": 3333, "2": 3333 });
  assert.deepEqual(
    allocation({ ...e, payers: [...e.payers].reverse() }).values,
    allocation(e).values,
  );
  const thirty = allocation({ ...e, payers: people.slice(0, 30) });
  assert.equal(thirty.values["0"], 343);
  assert.equal(
    Object.values(thirty.values).reduce((a, b) => a + b, 0),
    10000,
  );
  assert.deepEqual(allocation({ ...e, remainder: people[3]! }).values, {
    "0": 3333,
    "1": 3333,
    "2": 3333,
    "3": 1,
  });
  assert.equal(allocation({ ...e, payers: [] }).draft, true);
  assert.equal(allocation({ ...e, remainder: null }).draft, true);
  for (const total of [NaN, Infinity, -1, 0, 1.5, MAX_MONEY + 1])
    assert.throws(() => allocation({ ...e, total }));
  assert.throws(() =>
    calculate({
      ...initialSettlement(),
      expenses: [expense({ total: MAX_MONEY }), expense({ id: "other" })],
    }),
  );
  assert.equal(calculate(initialSettlement()).status, "EMPTY");
  assert.equal(
    calculate({
      ...initialSettlement(),
      expenses: [expense({ total: 1, deposit: 0, support: 1, payers: [] })],
    }).status,
    "COMPLETE",
  );
});
