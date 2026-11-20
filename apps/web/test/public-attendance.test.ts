import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, click } from "./support/form-dom";
import { PublicAttendance } from "../features/attendance/components/public-attendance";
import type { AttendanceResponseDto } from "../features/attendance/types/attendance.types";

test("public attendance distinguishes manager tally from own saved answer and preserves edited choice after failure", async (t) => {
  let saves = 0;
  const commands: { answer: string; accessToken: string }[] = [];
  const response: AttendanceResponseDto = {
    selfAnswer: "ATTENDING",
    managerOverride: "ABSENT",
    finalState: "ABSENT",
    version: 2,
    selfRespondedAt: null,
    overriddenAt: null,
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, options?: RequestInit) => {
      const path = String(input);
      let body: unknown = {
        eventName: "안전한 참석 행사",
        roundTitle: "1차",
        scheduledAt: null,
        closed: false,
      };
      if (path.endsWith("/open"))
        body = {
          kind: "DIRECT",
          reason: null,
          accessToken: "private-token",
          response,
        };
      if (path.endsWith("/response")) {
        commands.push(JSON.parse(String(options?.body)));
        if (++saves === 1) throw new Error("lost response");
        body = {
          kind: "SAVED",
          accessToken: "rotated-token",
          response: { ...response, selfAnswer: "ABSENT", version: 3 },
        };
      }
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const v = await render(
    createElement(PublicAttendance, { shareId: crypto.randomUUID() }),
  );
  try {
    await until(() => assert(v.container.querySelector('input[name="name"]')));
    await fill(v.container, "name", "참여자");
    await fill(v.container, "phoneLast4", "0012");
    await click(v.container, "내 응답 열기");
    await until(() =>
      assert.match(v.container.textContent!, /현재 참석 상태불참/),
    );
    assert.match(v.container.textContent!, /내가 제출한 응답: 참석/);
    assert.equal(v.container.querySelectorAll('input[type="radio"]').length, 0);
    assert(!v.container.textContent!.includes("private-token"));
    await click(v.container, "응답 수정");
    const choices = v.container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    assert.equal(choices[0].checked, true);
    assert.equal(choices[1].checked, false);
    await act(async () => choices[1].click());
    await click(v.container, "응답 저장");
    await until(() =>
      assert.match(v.container.textContent!, /연결 상태를 확인/),
    );
    assert.equal(choices[1].checked, true);
    assert.match(v.container.textContent!, /현재 참석 상태불참/);
    await click(v.container, "응답 저장");
    await until(() =>
      assert.match(v.container.textContent!, /내 응답을 저장했어요/),
    );
    assert.equal(v.container.querySelectorAll('input[type="radio"]').length, 0);
    assert.match(v.container.textContent!, /내가 제출한 응답: 불참/);
    assert.match(v.container.textContent!, /총무가 정정한 상태로 집계/);
    assert.deepEqual(commands, [
      { answer: "ABSENT", accessToken: "private-token" },
      { answer: "ABSENT", accessToken: "private-token" },
    ]);
  } finally {
    await v.unmount();
  }
});

test("review responses start with neither choice selected and saving stays out of counted tally", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const path = String(input);
    const body = path.endsWith("/open")
      ? {
          kind: "REVIEW",
          reason: "DUPLICATE_IDENTITY",
          accessToken: "review-token",
          response: null,
        }
      : path.endsWith("/response")
        ? { kind: "REVIEW", accessToken: "review-token-2", response: null }
        : {
            eventName: "동명이인 확인",
            roundTitle: "1차",
            scheduledAt: null,
            closed: false,
          };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const v = await render(
    createElement(PublicAttendance, { shareId: crypto.randomUUID() }),
  );
  try {
    await until(() => assert(v.container.querySelector('input[name="name"]')));
    await fill(v.container, "name", "동명이인");
    await fill(v.container, "phoneLast4", "1234");
    await click(v.container, "내 응답 열기");
    await until(() =>
      assert.equal(
        v.container.querySelectorAll('input[type="radio"]').length,
        2,
      ),
    );
    assert.equal(
      v.container.querySelectorAll('input[type="radio"]:checked').length,
      0,
    );
    assert.match(
      v.container.textContent!,
      /확인 전에는 참석 인원에 포함되지 않아요/,
    );
    await act(async () =>
      v.container
        .querySelector<HTMLInputElement>('input[type="radio"]')!
        .click(),
    );
    await click(v.container, "응답 저장");
    await until(() =>
      assert.match(
        v.container.textContent!,
        /응답이 접수됐으며 총무 확인이 필요/,
      ),
    );
    assert(!v.container.querySelector('[aria-label="현재 집계 상태"]'));
    assert.equal(v.container.querySelectorAll('input[type="radio"]').length, 0);
    await click(v.container, "응답 수정");
    assert.equal(
      v.container.querySelector<HTMLInputElement>('input[type="radio"]')!
        .checked,
      true,
    );
  } finally {
    await v.unmount();
  }
});
