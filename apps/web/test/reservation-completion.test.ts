import "./support/dom";
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
test("command response loss retries the same identity; conflicts preserve input and require explicit reapplication", async () => {
  const writes: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "o",
    request: async <T>(_p: string, o?: RequestInit) => {
      writes.push(JSON.parse(String(o?.body)));
      if (writes.length === 1) throw new TypeError("network");
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
    await submit(view.container);
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
    await click(view.container, "외부 변경");
    await submit(view.container);
    assert.equal(writes.length, 2);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="amount"]')!.value,
      "5000",
    );
    await click(view.container, "최신 내용 확인 후 입력 재적용");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 3));
    assert.equal(
      (writes[2].command as Record<string, unknown>).expectedVersion,
      2,
    );
    assert.notEqual(
      (writes[2].command as Record<string, unknown>).requestKey,
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
