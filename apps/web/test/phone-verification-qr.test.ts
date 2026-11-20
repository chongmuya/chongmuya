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
};

async function setup(state: VerificationState) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let checks = 0;
  const update = async (next: VerificationState) => {
    await act(async () =>
      root.render(
        createElement(ContactVerification, {
          state: next,
          now: 0,
          available: true,
          renderField: (requestButton) => requestButton,
          onRequest() {},
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
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("desktop phone QR opens as a modal, can close and reopen, and resets only for a new request", async () => {
  const previousOverflow = document.body.style.overflow;
  const view = await setup({ value: pending.value, status: "idle" });
  try {
    const request = view.container.querySelector<HTMLButtonElement>("button")!;
    request.focus();
    await view.update(pending);
    const dialog =
      view.container.querySelector<HTMLDialogElement>("dialog[open]")!;
    assert(dialog);
    assert.equal(
      view.container.querySelector("img")?.closest("dialog"),
      dialog,
    );
    assert.equal(document.activeElement, dialog.querySelector("button"));
    assert.equal(document.body.style.overflow, "hidden");
    assert(dialog.getAttribute("aria-labelledby"));
    assert(dialog.getAttribute("aria-describedby"));

    await click(dialog, "확인");
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(view.container.querySelector("img"), null);
    assert.equal(document.body.style.overflow, previousOverflow);
    assert.equal(document.activeElement?.textContent, "QR 코드 보기");
    assert.equal(view.checks(), 0);
    await view.update({ ...pending, checksRemaining: 11 });
    assert.equal(view.container.querySelector("dialog"), null);

    const reopen = view.container.querySelector<HTMLButtonElement>(
      '[aria-haspopup="dialog"]',
    )!;
    reopen.focus();
    await click(view.container, "QR 코드 보기");
    await act(async () => {
      view.container
        .querySelector("dialog")!
        .dispatchEvent(new window.Event("cancel", { cancelable: true }));
    });
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(document.activeElement, reopen);
    await click(view.container, "인증 결과 확인");
    assert.equal(view.checks(), 1);

    await view.update({ ...pending, id: "second-request" });
    assert(view.container.querySelector("dialog[open]"));
    await view.update({ ...pending, id: "second-request", status: "verified" });
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(document.body.style.overflow, previousOverflow);
    assert.match(view.container.textContent!, /휴대폰 인증이 완료/);
  } finally {
    await view.close();
  }
});

test("expiry or editing the phone removes the QR modal and its challenge", async () => {
  for (const state of [
    { ...pending, status: "expired" },
    { value: "01011111111", status: "idle" },
  ] satisfies VerificationState[]) {
    const view = await setup(pending);
    try {
      assert(view.container.querySelector("dialog[open]"));
      await view.update(state);
      assert.equal(view.container.querySelector("dialog"), null);
      assert.equal(view.container.querySelector("img"), null);
      assert.doesNotMatch(view.container.textContent!, /test-only-message/);
      assert.notEqual(document.body.style.overflow, "hidden");
    } finally {
      await view.close();
    }
  }
});

test("touch devices keep the SMS link without automatically opening a QR modal", async (t) => {
  const media = window.matchMedia("(hover: none) and (pointer: coarse)");
  t.mock.method(window, "matchMedia", () => ({ ...media, matches: true }));
  const view = await setup(pending);
  try {
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(view.container.querySelector("img"), null);
    assert.equal(
      view.container.querySelector('a[href^="sms:"]')?.getAttribute("href"),
      `sms:${pending.receiver}?body=${encodeURIComponent(pending.message!)}`,
    );
    assert.notEqual(document.body.style.overflow, "hidden");
    await click(view.container, "인증 결과 확인");
    assert.equal(view.checks(), 1);
  } finally {
    await view.close();
  }
});
