import "./support/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { previewTerms } from "./support/signup-terms";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { SignupFlow } from "../features/auth/components/signup/signup-flow";
import {
  RecoveryEmail,
  RecoveryPassword,
} from "../features/auth/components/recovery/password-recovery";
import { useContactVerification } from "../features/auth/hooks/use-contact-verification";
import type { VerificationResult } from "../features/auth/types/verification.types";
import {
  signupDefaults,
  signupSchema,
} from "../features/auth/schemas/signup.schema";
import {
  passwordSchema,
  resetPasswordSchema,
} from "../features/auth/schemas/password.schema";
import { credentialsSchema } from "../features/auth/schemas/credentials.schema";
import { ApiError } from "../shared/http/api-error";
import { GettingStartedFlow } from "../features/onboarding/components/getting-started-flow";

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient();
  const wrap = (child: ReactElement) =>
    createElement(QueryClientProvider, { client }, child);
  await act(async () => root.render(wrap(element)));
  return {
    container,
    update: async (next: ReactElement) => {
      await act(async () => root.render(wrap(next)));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    },
  };
}
async function fill(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  assert(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function click(container: HTMLElement, label: string) {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (item) =>
      item.textContent === label || item.getAttribute("aria-label") === label,
  );
  assert(button, label);
  await act(async () => button.click());
}
async function submit(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
async function agree(container: HTMLElement, name: string) {
  const checkbox = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  assert(checkbox);
  await act(async () => checkbox.click());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const noop = () => {};
const data = {
  ...signupDefaults,
  accountType: "organizer",
  serviceTerms: true,
  privacyCollection: true,
  privacyPolicy: true,
  email: "preview@example.test",
  name: "테스트",
  phone: "01000000000",
  password: "abcdefgh",
  passwordConfirm: "abcdefgh",
  nickname: "총무",
};
async function information(container: HTMLElement) {
  for (const name of ["serviceTerms", "privacyCollection", "privacyPolicy"])
    await agree(container, name);
  await submit(container);
  for (const name of [
    "email",
    "name",
    "phone",
    "password",
    "passwordConfirm",
  ] as const)
    await fill(container, name, data[name]);
  await click(container, "휴대폰 인증 요청");
  await click(container, "인증번호 보내기");
}

test("password policy is exact ASCII 8–16 across login, signup and recovery", () => {
  for (const value of [
    "abcdefgh",
    "12345678",
    "!\"#$%&'()",
    "`\\[]{}~:",
    "a".repeat(16),
  ]) {
    assert.equal(passwordSchema.parse(value), value);
    assert.equal(
      credentialsSchema.parse({ email: data.email, password: value }).password,
      value,
    );
  }
  for (const value of [
    "a".repeat(7),
    "a".repeat(17),
    " abcdefg",
    "abcdefg ",
    "abc\ndefgh",
    "가나다라마바사아",
    "abcdefg😀",
  ]) {
    assert.equal(passwordSchema.safeParse(value).success, false);
    assert.equal(
      credentialsSchema.safeParse({ email: data.email, password: value })
        .success,
      false,
    );
  }
  assert.equal(
    resetPasswordSchema.safeParse({
      password: "abcdefgh",
      passwordConfirm: "abcdefgi",
    }).success,
    false,
  );
  assert.equal(
    signupSchema.safeParse({ ...data, marketing: false }).success,
    true,
  );
  for (const field of ["name", "phone"])
    assert.equal(
      signupSchema.safeParse({ ...data, [field]: " " }).success,
      false,
    );
});

test("signup keeps values and consent across details/back, validates steps and submits once at the end", async () => {
  const done = deferred<void>();
  let calls = 0;
  const view = await render(
    createElement(SignupFlow, {
      terms: previewTerms,
      verification: {
        email: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000002",
            expiresAt: Date.now() + 600000,
          }),
        },
        phone: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000001",
            expiresAt: Date.now() + 300000,
          }),
        },
      },
      onExit: noop,
      onComplete: noop,
      onSubmit: async (values) => {
        calls++;
        assert.equal(
          values.consents.find((term) => term.id === "marketing")?.accepted,
          false,
        );
        assert(values.phoneVerificationId);
        assert(values.emailVerificationId);
        assert.equal("nickname" in values, false);
        assert.equal("accountType" in values, false);
        await done.promise;
      },
    }),
  );
  try {
    assert.equal(view.container.querySelectorAll("input:checked").length, 0);
    await submit(view.container);
    assert.match(view.container.textContent!, /필수 약관에 동의/);
    await information(view.container);
    await fill(view.container, "passwordConfirm", "different");
    await submit(view.container);
    assert.match(view.container.textContent!, /비밀번호가 일치하지/);
    await fill(view.container, "passwordConfirm", data.passwordConfirm);
    await click(view.container, "이전 단계로 돌아가기");
    await click(view.container, "이용약관 동의 상세 보기");
    assert.match(view.container.textContent!, /테스트 약관 본문/);
    await click(view.container, "이전 단계로 돌아가기");
    assert.equal(view.container.querySelectorAll("input:checked").length, 3);
    await submit(view.container);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="email"]')!
        .value,
      data.email,
    );
    assert.equal(calls, 0);
    await submit(view.container);
    await submit(view.container);
    assert.equal(calls, 1);
    assert.match(view.container.textContent!, /가입 처리 중/);
    await act(async () => done.resolve());
    assert.match(view.container.textContent!, /가입을 축하/);
    assert.equal(view.container.querySelectorAll("input").length, 0);
  } finally {
    await view.unmount();
  }
  const fresh = await render(
    createElement(SignupFlow, {
      terms: previewTerms,
      verification: {
        email: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000002",
            expiresAt: Date.now() + 600000,
          }),
        },
        phone: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000001",
            expiresAt: Date.now() + 300000,
          }),
        },
      },
      onSubmit: async () => {
        assert.fail("fresh form must not submit");
      },
      onExit: noop,
      onComplete: noop,
    }),
  );
  assert.match(fresh.container.textContent!, /전체 동의/);
  assert.equal(fresh.container.querySelectorAll("input:checked").length, 0);
  await fresh.unmount();
});

test("final field failure returns to the input, focuses it and permits retry without exposing server text", async () => {
  let calls = 0;
  const view = await render(
    createElement(SignupFlow, {
      terms: previewTerms,
      verification: {
        email: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000002",
            expiresAt: Date.now() + 600000,
          }),
        },
        phone: {
          request: async (value) => ({
            value,
            status: "verified",
            id: "00000000-0000-4000-8000-000000000001",
            expiresAt: Date.now() + 300000,
          }),
        },
      },
      onExit: noop,
      onComplete: noop,
      onSubmit: async () => {
        if (++calls === 1)
          throw new ApiError(
            "SECRET SERVER MESSAGE",
            400,
            "VALIDATION_FAILED",
            undefined,
            [{ field: "email", code: "INVALID_EMAIL" }],
          );
      },
    }),
  );
  try {
    await information(view.container);

    await submit(view.container);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(document.activeElement?.getAttribute("name"), "email");
    assert.match(view.container.textContent!, /이메일을 확인/);
    assert.doesNotMatch(view.container.textContent!, /SECRET/);
    await fill(view.container, "email", "retry@example.test");
    await click(view.container, "인증번호 보내기");
    await submit(view.container);
    assert.equal(calls, 2);
    assert.match(view.container.textContent!, /가입을 축하/);
  } finally {
    await view.unmount();
  }
});

test("contact edits invalidate certification, ignore late responses including A→B→A and prevent duplicate requests", async () => {
  for (const identity of ["01000000000", "preview@example.test"]) {
    let value = identity;
    let calls = 0;
    const first = deferred<VerificationResult>();
    let current!: ReturnType<typeof useContactVerification>;
    const actions = {
      request: async () => {
        calls++;
        return first.promise;
      },
    };
    function Probe({ input }: { input: string }) {
      current = useContactVerification(input, () => value, actions);
      return createElement("p", null, current.state.status);
    }
    const view = await render(createElement(Probe, { input: value }));
    try {
      await act(async () => {
        void current.request();
        void current.request();
      });
      assert.equal(calls, 1);
      value = "changed";
      await view.update(createElement(Probe, { input: value }));
      value = identity;
      await view.update(createElement(Probe, { input: value }));
      await act(async () =>
        first.resolve({ value: identity, status: "verified" }),
      );
      assert.equal(current.state.status, "idle");
      await act(async () => {
        await current.request();
      });
      assert.equal(current.state.status, "verified");
      value = "another";
      await view.update(createElement(Probe, { input: value }));
      assert.equal(current.state.status, "idle");
    } finally {
      await view.unmount();
    }
  }
});

test("recovery request/reset handles loading, retry, matching passwords and unavailable links", async () => {
  const sent = deferred<void>();
  let requests = 0;
  const email = await render(
    createElement(RecoveryEmail, {
      onBack: noop,
      onRequest: async () => {
        requests++;
        await sent.promise;
      },
    }),
  );
  try {
    await fill(email.container, "email", data.email);
    await submit(email.container);
    await submit(email.container);
    assert.equal(requests, 1);
    await act(async () => sent.resolve());
    assert.match(email.container.textContent!, /이메일을 확인/);
    await click(email.container, "이메일 다시 입력");
    assert.equal(
      email.container.querySelector<HTMLInputElement>("input")!.value,
      "",
    );
  } finally {
    await email.unmount();
  }
  let changes = 0;
  const password = await render(
    createElement(RecoveryPassword, {
      linkState: "valid",
      onBack: noop,
      onRetry: noop,
      onSubmit: async () => {
        if (++changes === 1) throw new TypeError("private details");
      },
    }),
  );
  try {
    await fill(password.container, "password", "abcdefgh");
    await fill(password.container, "passwordConfirm", "abcd1234");
    await submit(password.container);
    assert.equal(changes, 0);
    await fill(password.container, "passwordConfirm", "abcdefgh");
    await submit(password.container);
    assert.match(password.container.textContent!, /저장하지 못했습니다/);
    assert.doesNotMatch(password.container.textContent!, /private details/);
    await submit(password.container);
    assert.match(password.container.textContent!, /비밀번호를 변경했어요/);
    assert.equal(password.container.querySelectorAll("input").length, 0);
  } finally {
    await password.unmount();
  }
  const late = deferred<void>();
  const linkProps = {
    onBack: noop,
    onRetry: noop,
    onSubmit: async () => late.promise,
  };
  const changingLink = await render(
    createElement(RecoveryPassword, { ...linkProps, linkState: "valid" }),
  );
  try {
    await fill(changingLink.container, "password", "abcdefgh");
    await fill(changingLink.container, "passwordConfirm", "abcdefgh");
    await submit(changingLink.container);
    await changingLink.update(
      createElement(RecoveryPassword, { ...linkProps, linkState: "expired" }),
    );
    await act(async () => late.resolve());
    assert.match(changingLink.container.textContent!, /링크가 만료/);
    assert.doesNotMatch(
      changingLink.container.textContent!,
      /비밀번호를 변경했어요/,
    );
  } finally {
    await changingLink.unmount();
  }
  for (const linkState of ["expired", "error", "checking"] as const) {
    const view = await render(
      createElement(RecoveryPassword, {
        linkState,
        onSubmit: async () => {
          assert.fail("invalid links must not submit");
        },
        onBack: noop,
        onRetry: noop,
      }),
    );
    assert.equal(view.container.querySelector("form"), null);
    await view.unmount();
  }
});

test("post-signup choices preserve selection on back, allow skipping and route group/event setup independently", async () => {
  for (const usage of ["group", "event"] as const) {
    const paths: string[] = [];
    const view = await render(
      createElement(GettingStartedFlow, {
        accountType: "organizer",
        returnTo: "/mypage",
        onNavigate: (path) => paths.push(path),
      }),
    );
    try {
      await act(async () =>
        view.container
          .querySelector<HTMLInputElement>(`input[value="${usage}"]`)!
          .click(),
      );
      assert.deepEqual(paths, []);
      await click(view.container, "계속하기");
      assert.match(view.container.textContent!, /환영해요/);
      assert.equal(document.activeElement?.tagName, "H1");
      await click(view.container, "이전 단계로 돌아가기");
      assert.equal(
        view.container.querySelector<HTMLInputElement>(
          `input[value="${usage}"]`,
        )!.checked,
        true,
      );
      await click(view.container, "계속하기");
      await click(
        view.container,
        usage === "group" ? "모임 등록하기" : "행사 등록하기",
      );
      assert.deepEqual(paths, [usage === "group" ? "/groups/new" : "/events"]);
      await click(view.container, "나중에 시작하기");
      assert.equal(paths.at(-1), "/mypage");
    } finally {
      await view.unmount();
    }
  }
  const paths: string[] = [];
  const owner = await render(
    createElement(GettingStartedFlow, {
      accountType: "owner",
      returnTo: "/events",
      onNavigate: (path) => paths.push(path),
    }),
  );
  try {
    assert.match(
      owner.container.textContent!,
      /매장을 등록해 총무들의 단체 예약 문의/,
    );
    assert.equal(
      owner.container.querySelectorAll('input[name="usage"]').length,
      0,
    );
    await click(owner.container, "나중에 시작하기");
    assert.deepEqual(paths, ["/events"]);
  } finally {
    await owner.unmount();
  }
});
