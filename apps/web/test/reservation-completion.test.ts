import "./support/dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../shared/http/api-error";
import { completionQuery } from "../features/reservation-completion/api/completion.api";
import { ProposalComparison } from "../features/reservation-completion/components/proposal-comparison";
import { act, createElement, useState } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { MenuForm } from "../features/reservation-completion/components/menu-form";
import { CommandForm } from "../features/reservation-completion/components/command-form";
import type {
  Completion,
  CompletionAccess,
} from "../features/reservation-completion/types/completion.types";
const fixture = () =>
  ({
    id: "reservation",
    eventId: "event",
    version: 1,
    status: "PREPARING",
    guidance: { kind: "NONE", revision: 1, amount: 0 },
    agreement: { minimumSpend: null, minimumQuantity: null, separateFee: null },
    catalog: {
      version: 1,
      menus: [
        {
          id: "menu",
          name: "테스트 메뉴",
          unit: "1개",
          price: 1000,
          available: true,
        },
      ],
    },
    draft: null,
    receivedAmount: 0,
    refundedAmount: 0,
  }) as Completion;
test("menu draft preserves quantities; stale catalog needs explicit review and unchecked submission explains cause", async () => {
  const writes: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "organizer",
    accountId: "a",
    request: async <T>(_p: string, o?: RequestInit) => {
      writes.push(JSON.parse(String(o?.body)));
      return { ...fixture(), version: 2 } as T;
    },
  };
  function Screen() {
    const [data, setData] = useState(fixture());
    return createElement(
      "div",
      null,
      createElement(
        "button",
        {
          onClick: () =>
            setData({
              ...data,
              version: 2,
              catalog: {
                ...data.catalog,
                version: 2,
                menus: [{ ...data.catalog.menus[0], price: 2000 }],
              },
            }),
        },
        "메뉴판 변경",
      ),
      createElement(MenuForm, { data, access }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "items.0.quantity", "3");
    await submit(view.container);
    await until(() =>
      assert.match(
        view.container.textContent!,
        /메뉴·예약금·변경 조건을 확인해 주세요/,
      ),
    );
    assert.equal(writes.length, 0);
    assert.equal(
      view.container
        .querySelector('[name="confirmed"]')
        ?.getAttribute("aria-invalid"),
      "true",
    );
    await click(view.container, "메뉴판 변경");
    await click(view.container, "메뉴 임시 저장");
    assert.equal(writes.length, 0);
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="items.0.quantity"]',
      )!.value,
      "3",
    );
    await click(view.container, "최신 메뉴판 확인 · 삭제된 메뉴 제외");
    await click(view.container, "메뉴 임시 저장");
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual((writes[0].command as Record<string, unknown>).items, [
      { id: "menu", quantity: 3 },
    ]);
    assert.equal(
      (writes[0].command as Record<string, unknown>).catalogVersion,
      2,
    );
  } finally {
    await view.unmount();
  }
});
test("definite conflict preserves input and requires explicit reapplication", async () => {
  const writes: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "o",
    request: async <T>(_p: string, o?: RequestInit) => {
      writes.push(JSON.parse(String(o?.body)));
      if (writes.length === 1)
        throw new ApiError("", 409, "RESERVATION_STATE_CONFLICT");
      return fixture() as T;
    },
  };
  function Screen() {
    const [data, setData] = useState(fixture());
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { onClick: () => setData({ ...data, version: 2 }) },
        "외부 변경",
      ),
      createElement(CommandForm, {
        data,
        access,
        action: "receipt",
        title: "기록",
        fields: [{ name: "amount", label: "금액", type: "number" }],
        build: (v) => ({ amount: Number(v.amount) }),
      }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "amount", "-1");
    await submit(view.container);
    await until(() => assert.match(view.container.textContent!, /0~20억/));
    assert(
      view.container
        .querySelector('[name="amount"]')!
        .getAttribute("aria-describedby"),
    );
    await fill(view.container, "amount", "5000");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    await click(view.container, "외부 변경");
    await submit(view.container);
    assert.equal(writes.length, 1);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="amount"]')!.value,
      "5000",
    );
    await click(view.container, "최신 내용 확인 후 입력 재적용");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 2));
    assert.equal(
      (writes[1].command as Record<string, unknown>).expectedVersion,
      2,
    );
    assert.notEqual(
      (writes[1].command as Record<string, unknown>).requestKey,
      (writes[0].command as Record<string, unknown>).requestKey,
    );
  } finally {
    await act(async () => view.unmount());
  }
});

test("late reservation write after leaving the account screen cannot repopulate its cache", async () => {
  let finish!: (v: Completion) => void;
  const access: CompletionAccess = {
    kind: "organizer",
    accountId: "gone",
    request: async <T>() =>
      (await new Promise<Completion>((resolve) => {
        finish = resolve;
      })) as T,
  };
  const view = await render(
    createElement(CommandForm, {
      data: fixture(),
      access,
      action: "transfer",
      title: "신고",
      fields: [{ name: "amount", label: "금액", type: "number" }],
      build: (v) => ({ amount: Number(v.amount) }),
    }),
  );
  await fill(view.container, "amount", "1000");
  await submit(view.container);
  await until(() => assert(finish));
  await view.unmount();
  await act(async () => finish({ ...fixture(), version: 2 }));
  assert.equal(
    view.cache.getQueryData([
      "user",
      "gone",
      "reservation-completion",
      "organizer",
      "reservation",
    ]),
    undefined,
  );
});

test("lost refund response plus newer refetch freezes original command; retry records once and next refund has a new identity", async () => {
  let current = { ...fixture(), receivedAmount: 10000, refundedAmount: 0 };
  const applied = new Set<string>(),
    writes: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "refund-owner",
    request: async <T>(_path: string, options?: RequestInit) => {
      if (options?.method !== "POST") return structuredClone(current) as T;
      const command = JSON.parse(String(options.body)).command;
      writes.push(command);
      if (!applied.has(command.requestKey)) {
        assert.equal(command.expectedVersion, current.version);
        applied.add(command.requestKey);
        current = {
          ...current,
          version: current.version + 1,
          refundedAmount: current.refundedAmount + command.amount,
        };
        if (writes.length === 1)
          throw new TypeError("response lost after commit");
      }
      return structuredClone(current) as T;
    },
  };
  function Screen() {
    const query = useQuery(completionQuery("reservation", access));
    return query.data
      ? createElement(
          "div",
          null,
          createElement("p", null, `조회 버전 ${query.data.version}`),
          createElement(CommandForm, {
            data: query.data,
            access,
            action: "refund",
            title: "반환 기록",
            fields: [{ name: "amount", label: "반환액", type: "number" }],
            build: (v) => ({ amount: Number(v.amount) }),
          }),
        )
      : null;
  }
  const view = await render(createElement(Screen));
  try {
    await until(() => assert(view.container.querySelector("form")));
    await fill(view.container, "amount", "4000");
    await submit(view.container);
    await until(() => assert.match(view.container.textContent!, /조회 버전 2/));
    assert.equal(current.refundedAmount, 4000);
    assert.match(view.container.textContent!, /원래 요청 결과 다시 확인/);
    assert.doesNotMatch(
      view.container.textContent!,
      /최신 내용 확인 후 입력 재적용/,
    );
    assert(view.container.querySelector("fieldset[disabled]"));
    await submit(view.container);
    assert.equal(writes.length, 1);
    await click(view.container, "원래 요청 결과 다시 확인");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(current.refundedAmount, 4000);
    await until(() =>
      assert(!view.container.querySelector("fieldset[disabled]")),
    );
    await fill(view.container, "amount", "4000");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 3));
    assert.equal(current.refundedAmount, 8000);
    assert.equal(applied.size, 2);
    assert.equal(writes[2].expectedVersion, 2);
    assert.notEqual(writes[2].requestKey, writes[0].requestKey);
  } finally {
    await view.unmount();
  }
});

test("lost menu draft response survives newer query version without rebasing its original retry", async () => {
  let current = fixture();
  const writes: Record<string, unknown>[] = [],
    saved = new Set<string>();
  const access: CompletionAccess = {
    kind: "organizer",
    accountId: "menu-owner",
    request: async <T>(_path: string, options?: RequestInit) => {
      if (options?.method !== "POST") return structuredClone(current) as T;
      const command = JSON.parse(String(options.body)).command;
      writes.push(command);
      if (!saved.has(command.requestKey)) {
        saved.add(command.requestKey);
        current = {
          ...current,
          version: current.version + 1,
          draft: {
            catalogVersion: command.catalogVersion,
            items: command.items,
          },
        };
        if (writes.length === 1) throw new TypeError("lost response");
      }
      return structuredClone(current) as T;
    },
  };
  function Screen() {
    const q = useQuery(completionQuery("reservation", access));
    return q.data ? createElement(MenuForm, { data: q.data, access }) : null;
  }
  const view = await render(createElement(Screen));
  try {
    await until(() => assert(view.container.querySelector("form")));
    await fill(view.container, "items.0.quantity", "1");
    await click(view.container, "메뉴 임시 저장");
    await until(() =>
      assert.match(view.container.textContent!, /원래 요청 결과 다시 확인/),
    );
    await until(() =>
      assert.equal(
        view.cache.getQueryData<Completion>([
          "user",
          "menu-owner",
          "reservation-completion",
          "organizer",
          "reservation",
        ])?.version,
        2,
      ),
    );
    assert.doesNotMatch(
      view.container.textContent!,
      /최신 메뉴판 확인 · 삭제된 메뉴 제외/,
    );
    await click(view.container, "원래 요청 결과 다시 확인");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(saved.size, 1);
    await until(() =>
      assert(!view.container.querySelector("fieldset[disabled]")),
    );
    await fill(view.container, "items.0.quantity", "2");
    await click(view.container, "메뉴 임시 저장");
    await until(() => assert.equal(writes.length, 3));
    assert.equal(saved.size, 2);
    assert.equal(current.draft!.items[0].quantity, 2);
  } finally {
    await view.unmount();
  }
});

test("catalog review preserves unavailable quantities until explicit removal and another menu can submit", async () => {
  const writes: Record<string, unknown>[] = [];
  const initial = fixture();
  initial.draft = { catalogVersion: 1, items: [{ id: "menu", quantity: 1 }] };
  initial.catalog.menus.push({
    id: "other",
    name: "B 메뉴",
    unit: "1개",
    price: 2000,
    available: true,
  });
  const access: CompletionAccess = {
    kind: "organizer",
    accountId: "catalog",
    request: async <T>(_p: string, o?: RequestInit) => {
      writes.push(JSON.parse(String(o?.body)).command);
      return { ...initial, version: 3 } as T;
    },
  };
  function Screen() {
    const [data, setData] = useState(initial);
    return createElement(
      "div",
      null,
      createElement(
        "button",
        {
          onClick: () =>
            setData({
              ...data,
              version: 2,
              catalog: {
                ...data.catalog,
                version: 2,
                menus: data.catalog.menus.map((m) =>
                  m.id === "menu" ? { ...m, available: false, price: null } : m,
                ),
              },
            }),
        },
        "A 품절",
      ),
      createElement(MenuForm, { data, access }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await click(view.container, "A 품절");
    await click(view.container, "최신 메뉴판 확인 · 삭제된 메뉴 제외");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="items.0.quantity"]',
      )!.value,
      "1",
    );
    await click(view.container, "테스트 메뉴 선택 해제");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="items.0.quantity"]',
      )!.value,
      "0",
    );
    await fill(view.container, "items.1.quantity", "2");
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('[name="confirmed"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual(writes[0].items, [
      { id: "menu", quantity: 0 },
      { id: "other", quantity: 2 },
    ]);
  } finally {
    await view.unmount();
  }
});

test("organizer proposal preview shows all applied limits, fees and deadlines before accepting", async () => {
  const q = fixture();
  q.agreement = {
    ...q.agreement,
    startsAt: "2099-01-01T09:00:00Z",
    expectedGuests: 20,
    space: "HALL",
    seating: "CLOSE",
    minimumSpend: 10000,
    minimumQuantity: 2,
    separateFee: 3000,
    menuDeadlineAt: "2098-12-30T09:00:00Z",
    note: "기존",
    deposit: { kind: "NONE", amount: 0 },
  };
  q.guidance = {
    ...q.guidance,
    deadline: "2098-12-31T09:00:00Z",
    channel: "SMS",
    policy: "기존 조건",
  };
  q.order = null;
  q.refundExpected = null;
  const proposal = {
    agreement: {
      ...q.agreement,
      minimumSpend: 25000,
      minimumQuantity: 5,
      separateFee: 7000,
      menuDeadlineAt: "2098-12-29T08:00:00Z",
    },
    guidance: {
      ...q.guidance,
      deadline: "2098-12-30T07:00:00Z",
      policy: "새 조건",
    },
    order: null,
    refundExpected: 0,
    reason: "전체 조건 변경",
    audit: {
      kind: "OWNER",
      recorder: "owner",
      confirmer: "사장",
      method: "WEB",
      confirmedAt: "2098-01-01T00:00:00Z",
      recordedAt: "2098-01-01T00:00:00Z",
      reason: "제안",
    },
  };
  const view = await render(
    createElement(ProposalComparison, { data: q, proposal }),
  );
  try {
    for (const [label, before, after] of [
      ["최소 주문 금액", "10,000원", "25,000원"],
      ["최소 주문 수량", "2개", "5개"],
      ["별도 이용료", "3,000원", "7,000원"],
      ["메뉴 제출 기한", "2098. 12. 30.", "2098. 12. 29."],
      ["입금 기한", "2098. 12. 31.", "2098. 12. 30."],
    ]) {
      const row = [...view.container.querySelectorAll("dt")].find(
        (n) => n.textContent === label,
      )!.parentElement!;
      assert(row.textContent!.includes(before));
      assert(row.textContent!.includes(after));
      assert.match(row.textContent!, /기존:/);
      assert.match(row.textContent!, /제안:/);
    }
  } finally {
    await view.unmount();
  }
});
