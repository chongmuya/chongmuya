import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill } from "./support/form-dom";
import { AttendanceWorkspace } from "../features/attendance/components/attendance-workspace";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";

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
    assert.equal(view.container.querySelector('input[name="title"]'), input);
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
    await until(() => assert(input.closest("fieldset[disabled]")));
  } finally {
    await view.unmount();
  }
});
