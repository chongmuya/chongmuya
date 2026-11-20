import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, useState } from "react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { OwnerScreen } from "../features/owner/components/owner-screen";
import { CalendarScreen } from "../features/calendar/components/calendar-screen";
import { MerchantSummary } from "../features/calendar/components/merchant-summary";
import { kstDate, moveMonth } from "../features/calendar/lib/dates";
import type { CalendarData } from "../features/calendar/types/calendar";
import type { SessionRequest } from "../features/auth/types";
import { useCompletionCommand } from "../features/reservation-completion/hooks/use-completion-command";
import { render, until, click, deferred, client } from "./support/form-dom";

const accountId = "10000000-0000-4000-8000-000000000001";
const restaurantId = "20000000-0000-4000-8000-000000000001";
const today = kstDate();
const reservation = (id = "reservation", date = today) => ({
  id,
  title: `가상 예약 ${id}`,
  startsAt: `${date}T18:00:00+09:00`,
  status: "PREPARING",
  progress: "MENU_REQUIRED",
  issueCodes: [],
  destination: `/owner/reservations?reservation=${id}`,
  expectedGuests: 24,
  region: "가상 지역",
  budgetBasis: "PER_PERSON" as const,
  budgetAmount: 30000,
  orderTotal: null,
  depositAmount: null,
});

for (const screen of [OwnerScreen, CalendarScreen]) {
  test(`${screen.name} polls visible reservations, pauses hidden/offline, recovers temporary errors and stops on access loss`, async (t) => {
    let reads = 0;
    let progress = "MENU_REQUIRED";
    let failure = 0;
    t.mock.method(globalThis, "fetch", async (input: unknown) => {
      const path = String(input);
      if (path.endsWith("/auth/session/restore"))
        return Response.json({
          authenticated: true,
          account: {
            id: accountId,
            email: "owner@example.test",
            accountType: "owner",
          },
        });
      if (path.endsWith("/owner/context"))
        return Response.json({
          restaurants: [
            { id: restaurantId, name: "가상 매장", published: true },
          ],
          drafts: [],
        });
      if (path.endsWith("/groups")) return Response.json([]);
      if (path.includes("/calendar?")) {
        reads++;
        if (failure)
          return Response.json(
            {
              error: {
                code: failure === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
                message: "",
                requestId: "test",
              },
            },
            { status: failure },
          );
        return Response.json({
          schedules: [],
          events: [],
          reservations: [{ ...reservation(), progress }],
        });
      }
      throw new Error(`Unexpected test route ${path}`);
    });
    t.mock.timers.enable({ apis: ["setInterval"] });
    focusManager.setFocused(false);
    onlineManager.setOnline(true);
    const view = await render(
      createElement(AuthProvider, null, createElement(screen)),
    );
    const tick = () =>
      act(async () => {
        t.mock.timers.tick(30_000);
      });
    try {
      await until(() => assert.match(view.container.textContent!, /가상 매장/));
      assert.equal(
        reads,
        0,
        "hidden screen must not fetch reservations on mount",
      );
      await act(async () => {
        focusManager.setFocused(true);
      });
      await until(() =>
        assert.match(
          view.container.textContent!,
          /메뉴를 선택해 전달해 주세요/,
        ),
      );
      assert.equal(reads, 1);
      progress = "PAYMENT_CHECKING";
      await tick();
      await until(() =>
        assert.match(
          view.container.textContent!,
          /매장 확인을 기다리고 있어요/,
        ),
      );
      assert.equal(reads, 2);
      await act(async () => {
        focusManager.setFocused(false);
      });
      await tick();
      assert.equal(reads, 2);
      await act(async () => {
        onlineManager.setOnline(false);
      });
      await act(async () => {
        onlineManager.setOnline(true);
      });
      await tick();
      assert.equal(reads, 2, "hidden screen must not refetch on reconnect");
      await act(async () => {
        focusManager.setFocused(true);
      });
      await until(() => assert.equal(reads, 3));
      await act(async () => {
        onlineManager.setOnline(false);
      });
      await tick();
      assert.equal(reads, 3);
      await act(async () => {
        onlineManager.setOnline(true);
      });
      await until(() => assert.equal(reads, 4));
      failure = 503;
      await tick();
      await until(() => assert(view.container.querySelector('[role="alert"]')));
      assert.match(view.container.textContent!, /매장 확인을 기다리고 있어요/);
      failure = 0;
      progress = "CONFIRMED";
      await tick();
      await until(() =>
        assert.match(view.container.textContent!, /예약이 확정됐어요/),
      );
      failure = 403;
      await tick();
      await until(() =>
        assert.doesNotMatch(view.container.textContent!, /가상 예약/),
      );
      const stopped = reads;
      await tick();
      await act(async () => {
        focusManager.setFocused(false);
        onlineManager.setOnline(false);
      });
      await act(async () => {
        focusManager.setFocused(true);
        onlineManager.setOnline(true);
      });
      await tick();
      assert.equal(reads, stopped);
    } finally {
      await view.unmount();
      const stopped = reads;
      await tick();
      assert.equal(reads, stopped);
      t.mock.timers.reset();
      focusManager.setFocused(undefined);
      onlineManager.setOnline(true);
    }
  });
}

test("owner home calendar selects days, shows more than five bookings and isolates month/store data", async () => {
  const calls: string[] = [];
  const late = deferred<CalendarData>();
  let signal: AbortSignal | undefined;
  const next = moveMonth(today.slice(0, 7), 1);
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    calls.push(path);
    if (path.includes(`from=${next}`) && path.includes("restaurantId=first")) {
      signal = options?.signal ?? undefined;
      return late.promise as Promise<T>;
    }
    return {
      schedules: [],
      events: [],
      reservations: Array.from({ length: 6 }, (_, i) =>
        reservation(
          `${path.includes("restaurantId=first") ? "first" : "second"}-${i}`,
        ),
      ),
    } as T;
  };
  function Screen() {
    const [store, setStore] = useState("first");
    return createElement(
      "div",
      null,
      createElement(MerchantSummary, {
        key: store,
        accountId,
        restaurantId: store,
        request,
      }),
      createElement(
        "button",
        { onClick: () => setStore("second") },
        "매장 변경",
      ),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await until(() =>
      assert.equal(
        view.container.querySelectorAll('a[href^="/owner/reservations?"]')
          .length,
        6,
      ),
    );
    const emptyDay = [
      ...view.container.querySelectorAll<HTMLButtonElement>(
        "td[data-day] button",
      ),
    ].find(
      (b) =>
        b.closest<HTMLTableCellElement>("td")?.dataset.day !== today &&
        b
          .closest<HTMLTableCellElement>("td")
          ?.dataset.day?.startsWith(today.slice(0, 7)),
    );
    assert(emptyDay);
    await act(async () => emptyDay.click());
    assert.match(
      view.container.textContent!,
      /선택한 날짜에 문의·예약이 없어요/,
    );
    assert.equal(calls.length, 1);
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="다음 달"]')!
        .click(),
    );
    await until(() => assert(signal));
    assert.doesNotMatch(view.container.textContent!, /가상 예약 first/);
    await click(view.container, "매장 변경");
    await until(() =>
      assert.match(view.container.textContent!, /가상 예약 second/),
    );
    assert(signal?.aborted);
    await act(async () =>
      late.resolve({
        schedules: [],
        events: [],
        reservations: [reservation("stale")],
      }),
    );
    assert.doesNotMatch(
      view.container.textContent!,
      /가상 예약 stale|가상 예약 first/,
    );
  } finally {
    await view.unmount();
  }
});

for (const leave of [false, true]) {
  test(`completion success invalidates only the active account calendar (left screen: ${leave})`, async () => {
    const response = deferred<unknown>();
    const cache = client();
    const current = [
      "user",
      accountId,
      "calendar",
      "personal",
      restaurantId,
      today.slice(0, 7),
    ];
    const other = ["user", "other", "calendar"];
    cache.setQueryData(current, { sentinel: "current" });
    cache.setQueryData(other, { sentinel: "other" });
    const request: SessionRequest = async <T>() =>
      response.promise as Promise<T>;
    function Command() {
      const command = useCompletionCommand("reservation", {
        kind: "owner",
        accountId,
        request,
      });
      return createElement(
        "button",
        {
          onClick: () =>
            command.mutate({
              action: "receipt",
              input: { expectedVersion: 1 },
            }),
        },
        "저장",
      );
    }
    function Screen() {
      const [mounted, setMounted] = useState(true);
      return createElement(
        "div",
        null,
        mounted ? createElement(Command) : null,
        createElement(
          "button",
          { onClick: () => setMounted(false) },
          "화면 이탈",
        ),
      );
    }
    const view = await render(createElement(Screen), cache);
    try {
      await click(view.container, "저장");
      if (leave) await click(view.container, "화면 이탈");
      await act(async () =>
        response.resolve({ id: "reservation", version: 2 }),
      );
      await until(() =>
        assert.equal(cache.getQueryState(current)?.isInvalidated, !leave),
      );
      assert.equal(cache.getQueryState(other)?.isInvalidated, false);
    } finally {
      await view.unmount();
    }
  });
}
