import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ContactVerification } from "../features/auth/components/contact-verification";
import type { VerificationState } from "../features/auth/types/verification.types";
import { click } from "./support/form-dom";

const pending: VerificationState = {
  id: "first-request",
  value: "01000000000",
  status: "pending",
  receiver: "16663538",
  message: "test-only-message",
  qrCode: "data:image/png;base64,aGVsbG8=",
  checksRemaining: 12,
  expiresAt: 300000,
  retryAt: 60000,
};

async function setup(state: VerificationState) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let checks = 0;
  let requests = 0;
  const update = async (next: VerificationState, now = 0) => {
    await act(async () =>
      root.render(
        createElement(ContactVerification, {
          state: next,
          now,
          available: true,
          renderField: (requestButton) => requestButton,
          onRequest() {
            requests++;
          },
          onCheck() {
            checks++;
          },
        }),
      ),
    );
  };
  await update(state);
  return {
    container,
    update,
    checks: () => checks,
    requests: () => requests,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("phone QR opens after a request, reopens the same QR, and checks inside the dialog", async () => {
  const previousOverflow = document.body.style.overflow;
  const view = await setup({ value: pending.value, status: "idle" });
  try {
    const request = view.container.querySelector<HTMLButtonElement>("button")!;
    request.focus();
    await click(view.container, "휴대폰 인증 요청");
    assert.equal(view.requests(), 1);
    await view.update(pending);
    const dialog =
      view.container.querySelector<HTMLDialogElement>("dialog[open]")!;
    assert(dialog);
    assert.equal(
      view.container.querySelector("img")?.closest("dialog"),
      dialog,
    );
    const qr = dialog.querySelector("img")!.getAttribute("src");
    assert.equal(document.activeElement, dialog.querySelector("h2"));
    assert.equal(document.body.style.overflow, "hidden");
    assert(dialog.getAttribute("aria-labelledby"));
    assert(dialog.getAttribute("aria-describedby"));
    assert.match(dialog.textContent!, /남은 인증 시간 300초/);
    assert.doesNotMatch(
      view.container.textContent!,
      /인증 결과 확인|확인 가능 횟수|QR 코드 보기|번호·문구 직접 확인/,
    );

    await click(dialog, "닫기");
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(view.container.querySelector("img"), null);
    assert.equal(document.body.style.overflow, previousOverflow);
    assert.equal(document.activeElement, request);
    assert.equal(request.textContent, "인증 다시 열기");
    assert.equal(view.checks(), 0);
    await view.update(pending, 1000);
    assert.equal(view.container.querySelector("dialog"), null);
    assert.doesNotMatch(view.container.textContent!, /남은 인증 시간/);

    await click(view.container, "인증 다시 열기");
    assert.equal(
      view.container.querySelector("dialog img")!.getAttribute("src"),
      qr,
    );
    assert.equal(view.requests(), 1);
    await act(async () => {
      view.container
        .querySelector("dialog")!
        .dispatchEvent(new window.Event("cancel", { cancelable: true }));
    });
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(document.activeElement, request);
    await click(view.container, "인증 다시 열기");
    await click(view.container.querySelector("dialog")!, "문자 보냈어요");
    assert.equal(view.checks(), 1);
    assert.match(
      view.container.querySelector("dialog[open]")!.textContent!,
      /아직 문자가 확인되지/,
    );

    await view.update({ ...pending, status: "verified" });
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(document.body.style.overflow, previousOverflow);
    assert.match(view.container.textContent!, /휴대폰 인증이 완료/);
  } finally {
    await view.close();
  }
});

test("expiry, editing the phone, or exhausting checks returns to requesting verification", async () => {
  for (const state of [
    { ...pending, status: "expired" },
    { value: "01011111111", status: "idle" },
    { ...pending, checksRemaining: 0 },
  ] satisfies VerificationState[]) {
    const view = await setup(pending);
    try {
      assert(view.container.querySelector("dialog[open]"));
      await view.update(state, 61000);
      assert.equal(view.container.querySelector("dialog"), null);
      assert.equal(view.container.querySelector("img"), null);
      assert.doesNotMatch(view.container.textContent!, /test-only-message/);
      assert.notEqual(document.body.style.overflow, "hidden");
      await click(view.container, "인증 요청");
      assert.equal(view.requests(), 1);
      await view.update({ ...pending, id: "second-request" });
      assert(view.container.querySelector("dialog[open]"));
    } finally {
      await view.close();
    }
  }
});

test("the dialog keeps the mobile SMS link and waits for the server check interval", async () => {
  const state = { ...pending, nextCheckAt: 10000 };
  const view = await setup(state);
  try {
    const dialog = view.container.querySelector("dialog[open]")!;
    assert(dialog);
    assert.equal(
      dialog.querySelector('a[href^="sms:"]')?.getAttribute("href"),
      `sms:${pending.receiver}?body=${encodeURIComponent(pending.message!)}`,
    );
    assert.match(dialog.textContent!, /10초 후 확인할 수 있어요/);
    await click(dialog as HTMLElement, "문자 보냈어요");
    assert.equal(view.checks(), 0);
    await view.update(state, 10000);
    await click(dialog as HTMLElement, "문자 보냈어요");
    assert.equal(view.checks(), 1);
  } finally {
    await view.close();
  }
});
