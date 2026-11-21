import type { Expense, SettlementState, Person } from "../types/settlement.js";
export const MAX_MONEY = 2_000_000_000;
export function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY)
    throw new Error("MONEY_RANGE");
  return value;
}
export function allocation(
  e: Pick<
    Expense,
    | "total"
    | "deposit"
    | "includeDeposit"
    | "support"
    | "payers"
    | "remainder"
    | "remainderOrganizerId"
  >,
) {
  money(e.total);
  money(e.deposit);
  money(e.support);
  if (
    e.total === 0 ||
    e.deposit > e.total ||
    new Set(e.payers.map((p) => p.id)).size !== e.payers.length
  )
    throw new Error("EXPENSE_INVALID");
  const amount = money(
    e.total - (e.includeDeposit ? 0 : e.deposit) - e.support,
  );
  const values: Record<string, number> = {};
  if (!amount) return { amount, draft: false, values, organizerRemainder: 0 };
  if (!e.payers.length)
    return { amount, draft: true, values, organizerRemainder: 0 };
  const q = Math.floor(amount / e.payers.length),
    r = amount % e.payers.length;
  if (r && !e.remainder && !e.remainderOrganizerId)
    return { amount, draft: true, values, organizerRemainder: 0 };
  for (const p of e.payers) values[p.id] = q;
  if (r && e.remainder)
    values[e.remainder.id] = (values[e.remainder.id] ?? 0) + r;
  return {
    amount,
    draft: false,
    values,
    organizerRemainder: e.remainder ? 0 : r,
  };
}
export function calculate(s: SettlementState) {
  const people = new Map<
    string,
    {
      person: Person;
      amount: number;
      net: number;
      remaining: number;
      excess: number;
      rounds: Record<string, number>;
    }
  >();
  const person = (p: Person) => {
    let row = people.get(p.id);
    if (!row) {
      row = {
        person: p,
        amount: 0,
        net: 0,
        remaining: 0,
        excess: 0,
        rounds: {},
      };
      people.set(p.id, row);
    }
    return row;
  };
  let total = 0,
    target = 0,
    organizerRemainder = 0,
    drafts = 0;
  const expenses = s.expenses.filter((e) => !e.deletedAt);
  for (const e of expenses) {
    total = money(total + e.total);
    const a = allocation(e);
    if (a.draft) {
      drafts++;
      continue;
    }
    target = money(target + a.amount - a.organizerRemainder);
    organizerRemainder = money(organizerRemainder + a.organizerRemainder);
    for (const [id, value] of Object.entries(a.values)) {
      const p = e.payers.find((p) => p.id === id) ?? e.remainder!;
      const row = person(p);
      row.amount = money(row.amount + value);
      row.rounds[e.roundId] = money((row.rounds[e.roundId] ?? 0) + value);
    }
  }
  const corrected = new Set(
    s.payments.filter((p) => p.kind === "CORRECTION").map((p) => p.corrects),
  );
  for (const p of s.payments) {
    if (p.kind === "CORRECTION" || corrected.has(p.id)) continue;
    const row = person(p.participant);
    row.net += p.kind === "RECEIPT" ? p.amount : -p.amount;
  }
  let received = 0,
    confirmed = 0,
    unconfirmed = 0,
    differences = 0;
  for (const row of people.values()) {
    money(row.net);
    received = money(received + row.net);
    row.remaining = Math.max(0, row.amount - row.net);
    row.excess = Math.max(0, row.net - row.amount);
    if (row.amount > 0 && !row.remaining && !row.excess) confirmed++;
    if (row.remaining) unconfirmed++;
    if (row.excess) differences++;
  }
  return {
    total,
    target,
    organizerRemainder,
    drafts,
    received,
    confirmed,
    unconfirmed,
    differences,
    people: [...people.values()],
    status: (!expenses.length && !s.payments.length
      ? "EMPTY"
      : drafts || unconfirmed || differences
        ? "IN_PROGRESS"
        : "COMPLETE") as "EMPTY" | "IN_PROGRESS" | "COMPLETE",
  };
}
