import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  render,
  until,
  fill,
  click,
  submit,
  deferred,
} from "./support/form-dom";
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

test("round creation freezes an uncertain request and retries the identical title and key", async () => {
  const writes: unknown[] = [];
  const roundId = crypto.randomUUID();
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
      return { id: roundId, participants: [] } as T;
    }
    return { rounds: [], nextTitle: "1차" } as T;
  };
  const view = await render(
    createElement(AttendanceWorkspace, {
      accountId: "owner",
      eventId: crypto.randomUUID(),
      roundId: null,
      request,
    }),
  );
  try {
    await until(() =>
      assert(view.container.querySelector('[aria-label="차수 만들기"]')),
    );
    await click(view.container, "차수 만들기");
    await fill(view.container, "title", "1차 테스트");
    await click(view.container, "만들기");
    await until(() => assert.equal(writes.length, 1));
    await until(() =>
      assert.match(view.container.textContent!, /같은 요청 다시 확인/),
    );
    assert(
      view.container.querySelector<HTMLInputElement>('[name="title"]')!
        .disabled,
    );
    assert(
      view.container.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!
        .disabled,
    );
    await act(async () =>
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert(view.container.querySelector("dialog"));
    await click(view.container, "같은 요청 다시 확인");
    await until(() => assert.equal(view.navigations.length, 1));
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
    assert.match(view.navigations[0], new RegExp(roundId));
  } finally {
    await view.unmount();
  }
});

test("round creation blocks duplicate submits and permits corrected input after a definite rejection", async () => {
  const writes: { title: string; requestKey: string }[] = [];
  const response = deferred<void>();
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1) {
        await response.promise;
        throw new ApiError("", 400, "VALIDATION_ERROR");
      }
      return { id: crypto.randomUUID(), participants: [] } as T;
    }
    return { rounds: [], nextTitle: "1차" } as T;
  };
  const view = await render(
    createElement(AttendanceWorkspace, {
      accountId: "owner",
      eventId: crypto.randomUUID(),
      roundId: null,
      request,
    }),
  );
  try {
    await until(() =>
      assert(view.container.querySelector('[aria-label="차수 만들기"]')),
    );
    await click(view.container, "차수 만들기");
    await fill(view.container, "title", "처음 제목");
    await submit(view.container);
    await submit(view.container);
    assert.equal(writes.length, 1);
    assert(
      view.container.querySelector<HTMLInputElement>('[name="title"]')!
        .disabled,
    );
    await act(async () => response.resolve());
    await until(() =>
      assert(
        !view.container.querySelector<HTMLInputElement>('[name="title"]')!
          .disabled,
      ),
    );
    await fill(view.container, "title", "수정한 제목");
    await click(view.container, "만들기");
    await until(() => assert.equal(view.navigations.length, 1));
    assert.equal(writes[1].title, "수정한 제목");
    assert.notEqual(writes[0].requestKey, writes[1].requestKey);
  } finally {
    await view.unmount();
  }
});

test("a roster detail with lost access retains the route back to the event roster", async () => {
  const eventId = crypto.randomUUID();
  const request: SessionRequest = async <T>(path: string) => {
    if (path.endsWith("/participants"))
      throw new ApiError("", 403, "FORBIDDEN");
    return { id: eventId, ownerId: "a", version: 1 } as T;
  };
  for (const params of ["action=add", `participant=${crypto.randomUUID()}`]) {
    const view = await render(
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(params) },
        createElement(EventRoster, { accountId: "a", eventId, request }),
      ),
    );
    try {
      await until(() =>
        assert.match(view.container.textContent!, /명단에 접근할 수 없어요/),
      );
      assert.equal(view.container.querySelector("form"), null);
      await click(view.container, "이전 단계로 돌아가기");
      assert.deepEqual(view.navigations, [
        `/events?event=${eventId}&view=roster`,
      ]);
    } finally {
      await view.unmount();
    }
  }
});

test("an already processed review offers a return to the round without a write action", async () => {
  const eventId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const reviewId = crypto.randomUUID();
  const request: SessionRequest = async <T>() =>
    ({ reviews: [{ id: reviewId, status: "LINKED" }], participants: [] }) as T;
  const view = await render(
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams({ review: reviewId }) },
      createElement(AttendanceWorkspace, {
        accountId: "a",
        eventId,
        roundId,
        request,
      }),
    ),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /이미 처리한 응답이에요/),
    );
    assert.doesNotMatch(view.container.textContent!, /처리 확정/);
    await click(view.container, "이전 단계로 돌아가기");
    assert.deepEqual(view.navigations, [
      `/events?event=${eventId}&view=attendance&round=${roundId}`,
    ]);
  } finally {
    await view.unmount();
  }
});
