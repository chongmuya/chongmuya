import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, click } from "./support/form-dom";
import { AttendanceWorkspace } from "../features/attendance/components/attendance-workspace";
import { InviteParticipants } from "../features/attendance/components/invite-participants";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
import { EventRoster } from "../features/attendance/components/event-roster";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ParticipantDto } from "../features/attendance/types/attendance.types";

test("lost roster-add response retries the reviewed identities even after a fresh roster arrives", async () => {
  const eventId = crypto.randomUUID();
  let people: ParticipantDto[] = [];
  const writes: unknown[] = [];
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      if (writes.length === 1) {
        people = [
          {
            id: crypto.randomUUID(),
            eventId,
            name: "새 참여자",
            phoneLast4: null,
            label: null,
            groupMemberId: null,
            version: 1,
            identityVersion: 1,
            position: 0,
          } as ParticipantDto,
        ];
        throw new ApiError("lost", 0, "NETWORK_ERROR");
      }
      return { addedCount: 1 } as T;
    }
    return (
      path.endsWith("/participants")
        ? structuredClone(people)
        : {
            id: eventId,
            ownerId: "a",
            groupId: null,
            name: "행사",
            scheduledAt: null,
            version: 1,
          }
    ) as T;
  };
  const view = await render(
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams("action=add") },
      createElement(EventRoster, { accountId: "a", eventId, request }),
    ),
  );
  try {
    await until(() =>
      assert(view.container.querySelector("textarea[name=source]")),
    );
    const source = view.container.querySelector<HTMLTextAreaElement>(
      "textarea[name=source]",
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(source, "새 참여자");
      source.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await click(view.container, "명단 확인하기");
    await click(view.container, "등록 완료");
    await until(() => assert.equal(writes.length, 1));
    await until(() =>
      assert.match(view.container.textContent!, /검토 후 명단이 바뀌었어요/),
    );
    await click(view.container, "등록 완료");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[1], writes[0]);
    await until(() => assert.equal(view.navigations.length, 1));
  } finally {
    await view.unmount();
  }
});

test("participant invitation keeps the same round link when clipboard is unavailable and copying is retried", async () => {
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  const shareId = crypto.randomUUID();
  const url = `${window.location.origin}/attendance/${shareId}`;
  let copied = "";
  const view = await render(
    createElement(InviteParticipants, {
      shareId,
      roundTitle: "2차",
      onClose() {},
    }),
  );
  try {
    await click(view.container, "링크 복사");
    assert.equal(view.container.querySelector("a")?.href, url);
    assert(view.container.querySelector('[role="status"]'));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value: string) {
          copied = value;
        },
      },
    });
    await click(view.container, "링크 복사");
    assert.equal(copied, url);
    assert.equal(view.container.querySelector("a"), null);
    assert(view.container.textContent.includes("복사 완료"));
  } finally {
    await view.unmount();
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("attendance background errors preserve the open editor and revoke writes after access loss", async () => {
  let failure = 0;
  const request: SessionRequest = async <T>() => {
    if (failure)
      throw new ApiError(
        "",
        failure,
        failure === 403 ? "FORBIDDEN" : "NETWORK_ERROR",
      );
    return { rounds: [], nextTitle: "1차" } as T;
  };
  const view = await render(
    createElement(AttendanceWorkspace, {
      accountId: "attendance-owner",
      eventId: crypto.randomUUID(),
      roundId: null,
      request,
    }),
  );
  try {
    await until(() =>
      assert(view.container.querySelector('[aria-label="차수 만들기"]')),
    );
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>('[aria-label="차수 만들기"]')!
        .click(),
    );
    await fill(view.container, "title", "작성 중인 차수");
    const input = view.container.querySelector<HTMLInputElement>(
      'input[name="title"]',
    )!;
    failure = 503;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    assert(view.container.querySelector('input[name="title"]') === input);
    assert.equal(input.value, "작성 중인 차수");
    failure = 0;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    assert.equal(input.value, "작성 중인 차수");
    failure = 403;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert(!view.container.querySelector('input[name="title"]')),
    );
    assert.doesNotMatch(view.container.textContent!, /작성 중인 차수/);
  } finally {
    await view.unmount();
  }
});
