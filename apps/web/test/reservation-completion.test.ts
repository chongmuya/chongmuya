import { chooseDate, chooseTime } from "./support/date-controls";
import "./support/dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../shared/http/api-error";
import { completionQuery } from "../features/reservation-completion/api/completion.api";
import { ChangeForms } from "../features/reservation-completion/components/change-forms";
import { ProposalComparison } from "../features/reservation-completion/components/proposal-comparison";
import { AgreementTerms } from "../features/reservation-completion/components/agreement-terms";
import {
  CompletionFacts,
  GuidanceSummary,
} from "../features/reservation-completion/components/completion-summary";
import { ChangeResult } from "../features/reservation-completion/components/change-result";
import { ReservationContactButton } from "../features/reservation-completion/components/reservation-contact";
import { act, createElement, useState } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { MenuForm } from "../features/reservation-completion/components/menu-form";
import { CommandForm } from "../features/reservation-completion/components/command-form";
import { PaymentForms } from "../features/reservation-completion/components/payment-forms";
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

test("a new change request shows the current date without repeating the previous applied change", async () => {
  const data = {
    ...fixture(),
    agreement: { ...fixture().agreement, startsAt: "2099-01-01T10:00:00Z" },
    changes: [{ kind: "CHANGE", status: "REQUESTED" }],
    history: [
      {
        action: "CHANGE_APPLIED",
        agreement: { startsAt: "2099-01-01T10:00:00Z" },
      },
      {
        action: "CHANGE_REQUESTED",
        agreement: { startsAt: "2099-01-01T09:00:00Z" },
      },
    ],
  } as Completion;
  const pending = await render(createElement(CompletionFacts, { data }));
  try {
    assert.equal(pending.container.querySelector("del"), null);
    assert.match(pending.container.textContent!, /19:00/);
    assert.doesNotMatch(pending.container.textContent!, /18:00/);
  } finally {
    await pending.unmount();
  }
  const applied = await render(
    createElement(CompletionFacts, {
      data: { ...data, changes: [{ ...data.changes[0], status: "APPLIED" }] },
    }),
  );
  try {
    assert.match(applied.container.querySelector("del")!.textContent!, /18:00/);
    assert.match(applied.container.textContent!, /→.*19:00/);
  } finally {
    await applied.unmount();
  }
});

test("merchant can edit space, seating, usage and notes while a lost response retries the same proposal", async () => {
  const data = {
    ...fixture(),
    changes: [
      {
        id: "change",
        kind: "CHANGE",
        subject: "OTHER",
        status: "REQUESTED",
        reason: "공간을 바꿔 주세요",
        createdAt: "2098-01-01T00:00:00Z",
        resolvedAt: null,
        proposal: null,
      },
    ],
    agreement: {
      ...fixture().agreement,
      startsAt: "2099-01-01T09:00:00Z",
      expectedGuests: 20,
      space: "HALL",
      seating: "ANY",
      usageTime: { kind: "UNLIMITED", minutes: null },
      note: "기존 안내",
      menuDeadlineAt: null,
      changeCancellationPolicy: "사전 협의",
      deposit: { kind: "NONE", amount: 0 },
    },
  } as Completion;
  const writes: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "proposal-owner",
    request: async <T>(_path: string, options?: RequestInit) => {
      writes.push(JSON.parse(String(options?.body)).command);
      if (writes.length === 1) throw new TypeError("response lost");
      return { ...data, version: 2 } as T;
    },
  };
  const view = await render(createElement(ChangeForms, { data, access }));
  const set = async (name: string, value: string) => {
    const input = view.container.querySelector<
      HTMLSelectElement | HTMLTextAreaElement
    >(`[name="${name}"]`)!;
    await act(async () => {
      const proto =
        input.tagName === "SELECT"
          ? window.HTMLSelectElement.prototype
          : window.HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
      input.dispatchEvent(
        new window.Event(input.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  try {
    assert.equal(
      view.container.querySelector<HTMLSelectElement>('[name="space"]')!.value,
      "HALL",
    );
    await set("space", "ROOM");
    await set("seating", "CLOSE");
    await set("usageKind", "MINUTES");
    await set("note", "룸에서 함께 착석");
    await set("changeCancellationPolicy", "하루 전 협의");
    await set("reason", "변경 조건을 제안합니다");
    await submit(view.container);
    assert.equal(writes.length, 0);
    assert.match(view.container.textContent!, /이용시간을 1~1440분/);
    await fill(view.container, "usageMinutes", "90");
    assert.match(view.container.textContent!, /일반 홀→ 룸/);
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    await click(view.container, "원래 요청 결과 다시 확인");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
    assert.deepEqual(writes[0].agreement, {
      ...data.agreement,
      startsAt: "2099-01-01T09:00:00.000Z",
      space: "ROOM",
      seating: "CLOSE",
      usageTime: { kind: "MINUTES", minutes: 90 },
      note: "룸에서 함께 착석",
      changeCancellationPolicy: "하루 전 협의",
      minimumQuantity: null,
    });
  } finally {
    await view.unmount();
  }
});

test("latest rejection is visible outside history and does not claim that the reservation changed", async () => {
  const data = {
    ...fixture(),
    changes: [
      {
        id: "new",
        kind: "CHANGE",
        subject: "SCHEDULE",
        status: "REJECTED",
        reason: "30분 늦춰 주세요",
        resolutionReason: "다른 예약이 있어요",
      },
    ],
  } as Completion;
  let openedCurrent = false;
  const view = await render(
    createElement(ChangeResult, {
      data,
      latest: data.changes[0],
      organizer: true,
      onReview() {},
      onDetails() {
        openedCurrent = true;
      },
    }),
  );
  try {
    assert.match(view.container.textContent!, /예약 변경이 어려워요/);
    assert.match(view.container.textContent!, /다른 예약이 있어요/);
    assert.match(view.container.textContent!, /기존 예약으로 진행할지 확인/);
    assert.equal(view.container.querySelector("details"), null);
    await click(view.container, "기존 예약으로 진행하기");
    assert.equal(openedCurrent, true);
  } finally {
    await view.unmount();
  }
});

test("current agreement shows missing, zero and unlimited independently after a changed agreement", async () => {
  const data = {
    ...fixture(),
    restaurantName: "가상 매장",
    restaurantAddress: "서울 테스트로 1",
    agreementRevision: 3,
    guidance: {
      kind: "REQUIRED",
      revision: 2,
      amount: 10000,
      channel: "SMS",
      policy: "합의 후 처리",
    },
    agreement: {
      ...fixture().agreement,
      startsAt: "2099-01-01T09:00:00Z",
      expectedGuests: 12,
      space: "ROOM",
      seating: "CLOSE",
      separateFee: 0,
      usageTime: { kind: "UNLIMITED", minutes: null },
      note: "변경 후 안내",
      deposit: { kind: "UNKNOWN", amount: null },
      menuDeadlineAt: null,
    },
  } as Completion;
  const view = await render(
    createElement(
      "div",
      null,
      createElement(AgreementTerms, { data }),
      createElement(GuidanceSummary, { data }),
    ),
  );
  try {
    assert.match(view.container.textContent!, /3차 합의/);
    for (const [label, expected] of [
      ["최소 주문", "미확인"],
      ["별도 이용료", "0원"],
      ["이용 시간", "제한 없음"],
      ["제안 기준 예약금", "미확인"],
      ["추가 안내", "변경 후 안내"],
    ]) {
      const term = [...view.container.querySelectorAll("dt")].find(
        (n) => n.textContent === label,
      )!;
      assert.equal(term.nextElementSibling!.textContent, expected);
    }
    assert.match(
      view.container.textContent!,
      /예약금 안내 · 2차예약금 10,000원/,
    );
    assert.match(view.container.textContent!, /계좌는 문자로만 안내/);
  } finally {
    await view.unmount();
  }
});

test("contact sheet queries only its scoped reservation and hides the number on lost permission", async () => {
  const paths: string[] = [];
  let denied = false;
  let lost = false;
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "contact-owner",
    request: async <T>(path: string) => {
      paths.push(path);
      if (denied) throw new ApiError("", 403, "RESERVATION_ACCESS_INVALID");
      return {
        kind: "organizer",
        name: "현재 총무",
        phone: "01012345678",
        changedAt: null,
      } as T;
    },
  };
  const view = await render(
    createElement(ReservationContactButton, {
      id: "selected",
      access,
      onAccessLost: (value: boolean) => {
        lost = value;
      },
    }),
  );
  try {
    assert.equal(paths.length, 0);
    await click(view.container, "총무에게 문의하기");
    await until(() =>
      assert.equal(
        view.container.querySelector('a[href="tel:01012345678"]')?.textContent,
        "010-1234-5678",
      ),
    );
    assert.deepEqual(paths, ["/api/v1/owner/reservations/selected/contact"]);
    denied = true;
    await act(async () => {
      await view.cache.invalidateQueries({
        queryKey: [
          "user",
          "contact-owner",
          "reservation-completion",
          "owner",
          "selected",
          "contact",
        ],
      });
    });
    await until(() => assert.equal(lost, true));
    assert.doesNotMatch(view.container.textContent!, /01012345678/);
    assert.equal(view.container.querySelector('a[href^="tel:"]'), null);
  } finally {
    await view.unmount();
  }
});

test("confirmed and cancelled reservations never render an empty guidance disclosure", async () => {
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "owner",
    request: async <T>() => ({}) as T,
  };
  for (const state of ["confirmation", "cancellation"] as const) {
    const data = { ...fixture(), issues: [], [state]: {} } as Completion;
    const view = await render(createElement(PaymentForms, { data, access }));
    try {
      assert.equal(view.container.querySelector("details"), null);
      assert.doesNotMatch(
        view.container.textContent!,
        /예약금·계좌·변경 조건 안내/,
      );
    } finally {
      await view.unmount();
    }
  }
});

test("guidance draft and its disclosure survive a background confirmation with submission disabled", async () => {
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "owner",
    request: async <T>() => ({}) as T,
  };
  function Screen() {
    const [data, setData] = useState<Completion>({ ...fixture(), issues: [] });
    return createElement(
      "div",
      null,
      createElement(PaymentForms, { data, access }),
      createElement(
        "button",
        {
          onClick: () =>
            setData({
              ...data,
              version: 2,
              confirmation: {} as NonNullable<Completion["confirmation"]>,
            }),
        },
        "다른 화면에서 확정",
      ),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await act(async () => {
      view.container.querySelector("summary")!.click();
    });
    const form = view.container.querySelector("form")!;
    const field = form.querySelector<HTMLInputElement>('input[type="number"]');
    assert(field);
    await fill(view.container, field.name, "12345");
    await click(view.container, "다른 화면에서 확정");
    assert(view.container.querySelector("details")?.open);
    assert.equal(field.value, "12345");
    assert(form.querySelector("fieldset")?.disabled);
    assert.match(form.textContent!, /최신|바뀌|진행할 수/);
  } finally {
    await view.unmount();
  }
});
for (const lostResponse of [false, true]) {
  test(`receipt correction keeps the saved amount and time for the next correction (lost response: ${lostResponse})`, async () => {
    let current: Completion = {
      ...fixture(),
      guidance: { ...fixture().guidance, kind: "REQUIRED", amount: 100000 },
      confirmation: {} as NonNullable<Completion["confirmation"]>,
      issues: [],
      receivedAmount: 100000,
      receipt: {
        id: "old-receipt",
        amount: 100000,
        receivedAt: "2026-11-18T01:00:00.000Z",
        recordedAt: "2026-11-18T01:00:00.000Z",
        guidanceRevision: 1,
        corrects: null,
        audit: {} as NonNullable<Completion["receipt"]>["audit"],
      },
    };
    const writes: Record<string, unknown>[] = [];
    const applied = new Set<string>();
    const access: CompletionAccess = {
      kind: "owner",
      accountId: `receipt-${lostResponse}`,
      request: async <T>(_path: string, options?: RequestInit) => {
        if (options?.method !== "POST") return structuredClone(current) as T;
        const command = JSON.parse(String(options.body)).command;
        writes.push(command);
        if (!applied.has(command.requestKey)) {
          applied.add(command.requestKey);
          current = {
            ...current,
            version: current.version + 1,
            receivedAmount: command.amount,
            receipt: {
              ...current.receipt!,
              id: `receipt-${applied.size}`,
              amount: command.amount,
              receivedAt: command.receivedAt,
              corrects: command.corrects,
            },
          };
        }
        if (lostResponse && writes.length === 1)
          throw new TypeError("response lost");
        return structuredClone(current) as T;
      },
    };
    function Screen() {
      const query = useQuery(completionQuery(current.id, access));
      return query.data
        ? createElement(PaymentForms, { data: query.data, access })
        : null;
    }
    const view = await render(createElement(Screen));
    const confirm = async () => {
      await act(async () => {
        const reason =
          view.container.querySelector<HTMLTextAreaElement>('[name="reason"]')!;
        Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(reason, "은행 내역 대조");
        reason.dispatchEvent(new window.Event("input", { bubbles: true }));
        view.container
          .querySelector<HTMLInputElement>('input[type="checkbox"]')!
          .click();
      });
    };
    try {
      await until(() =>
        assert(view.container.querySelector('[name="amount"]')),
      );
      await fill(view.container, "amount", "150000");
      await chooseDate(view.container, "receivedAt", "2026-11-19");
      await chooseTime(view.container, "receivedAt", "12:30");
      await confirm();
      await submit(view.container);
      await until(() => assert.equal(writes.length, 1));
      if (lostResponse) {
        await until(() =>
          assert.match(view.container.textContent!, /원래 요청 결과 다시 확인/),
        );
        await click(view.container, "원래 요청 결과 다시 확인");
        await until(() => assert.equal(writes.length, 2));
        assert.deepEqual(writes[1], writes[0]);
      }
      await until(() =>
        assert.equal(
          view.container.querySelector<HTMLInputElement>('[name="amount"]')!
            .value,
          "150000",
        ),
      );
      assert.equal(
        view.container
          .querySelector<HTMLButtonElement>('button[name="receivedAt"]')!
          .textContent?.includes("2026-11-19"),
        true,
      );
      assert.equal(
        view.container.querySelector<HTMLTextAreaElement>('[name="reason"]')!
          .value,
        "",
      );
      assert.equal(
        view.container.querySelector<HTMLInputElement>(
          'input[type="checkbox"]',
        )!.checked,
        false,
      );
      await confirm();
      await submit(view.container);
      await until(() => assert.equal(applied.size, 2));
      const next = writes.at(-1)!;
      assert.equal(next.amount, 150000);
      assert.equal(next.receivedAt, "2026-11-19T03:30:00.000Z");
      assert.equal(next.expectedVersion, 2);
      assert.equal(next.corrects, "receipt-1");
      assert.notEqual(next.requestKey, writes[0].requestKey);
    } finally {
      await view.unmount();
    }
  });
}
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
    createElement(ProposalComparison, { data: q, proposal, kind: "CHANGE" }),
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
      assert(row.querySelector("del")?.textContent?.includes(before));
      assert.match(row.textContent!, /→/);
    }
  } finally {
    await view.unmount();
  }
});

test("change and cancellation proposals keep refund amounts out of the form and route cancellation to phone", async () => {
  const proposals: Record<string, unknown>[] = [];
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "owner",
    request: async <T>(path: string, options?: RequestInit) => {
      if (path.endsWith("/change-propose"))
        proposals.push(JSON.parse(String(options?.body)).command);
      return fixture() as T;
    },
  };
  for (const kind of ["CHANGE", "CANCEL"] as const) {
    const data = {
      ...fixture(),
      agreement: {
        ...fixture().agreement,
        startsAt: "2099-01-01T09:00:00Z",
        expectedGuests: 20,
        menuDeadlineAt: null,
      },
      changes: [
        {
          id: "change",
          kind,
          status: "REQUESTED" as const,
          subject: "OTHER",
          reason: "문의",
          createdAt: "2098-01-01T00:00:00Z",
          resolvedAt: null,
          proposal: null,
        },
      ],
    };
    const view = await render(createElement(ChangeForms, { data, access }));
    try {
      assert.equal(
        view.container.querySelectorAll('[name="refundExpected"]').length,
        0,
      );
      assert.equal(
        view.container.textContent?.includes("전화로"),
        kind === "CANCEL",
      );
      if (kind === "CANCEL") {
        const reason = view.container.querySelector<HTMLTextAreaElement>(
          'textarea[name="reason"]',
        )!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value",
          )!.set!.call(reason, "취소 처리 가능");
          reason.dispatchEvent(new window.Event("input", { bubbles: true }));
        });
        await submit(view.container);
        await until(() => assert.equal(proposals.length, 1));
        assert.equal(proposals[0].refundExpected, null);
      }
    } finally {
      await view.unmount();
    }
  }
});

test("external menu submission preserves dirty quantities and blocks a second save", async () => {
  const access: CompletionAccess = {
    kind: "organizer",
    accountId: "retain-menu",
    request: async () => {
      throw new Error("unexpected write");
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
              order: {
                total: 2000,
                lines: [],
                revision: 1,
                catalogVersion: 1,
                currency: "KRW",
                submittedAt: "2026-11-20T00:00:00Z",
              },
            }),
        },
        "다른 기기 전달",
      ),
      createElement(MenuForm, { data, access }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "items.0.quantity", "3");
    await click(view.container, "다른 기기 전달");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="items.0.quantity"]',
      )?.value,
      "3",
    );
    assert.match(view.container.textContent!, /작성 내용은 보존/);
    assert(view.container.querySelector("fieldset")?.disabled);
  } finally {
    await view.unmount();
  }
});

test("external change resolution retains the merchant proposal draft without accepting the new version", async () => {
  const access: CompletionAccess = {
    kind: "owner",
    accountId: "retain-proposal",
    request: async () => {
      throw new Error("unexpected write");
    },
  };
  const initial = {
    ...fixture(),
    changes: [
      {
        id: "change",
        kind: "CHANGE",
        status: "REQUESTED",
        reason: "일정 변경",
      },
    ],
  } as Completion;
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
              changes: data.changes.map((c) => ({ ...c, status: "REJECTED" })),
            }),
        },
        "다른 기기 처리",
      ),
      createElement(ChangeForms, { data, access }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "expectedGuests", "17");
    await click(view.container, "다른 기기 처리");
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="expectedGuests"]')
        ?.value,
      "17",
    );
    assert.match(view.container.textContent!, /작성 내용은 보존/);
    assert(view.container.querySelector("fieldset")?.disabled);
  } finally {
    await view.unmount();
  }
});
