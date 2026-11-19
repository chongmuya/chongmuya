import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { ReplyWorkspace } from "../features/merchant-replies/components/reply-workspace";
import {
  koreanDateInput,
  fromKoreanDateInput,
} from "../shared/lib/korean-date";
import { replySchema } from "../features/merchant-replies/schemas/reply.schema";
import type { MerchantInquiry } from "../features/merchant-replies/types/reply.types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
import { merchantAccount } from "./support/owner-account";

test("merchant reply keeps unsaved input through failed refetch and recovery", async () => {
  const inquiry = merchantInquiryFixture();
  let offline = false,
    submitted = "";
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      submitted = JSON.parse(String(options.body)).reply.reason;
      return { version: ++inquiry.version, response: null } as T;
    }
    if (offline) throw new ApiError("", 503, "NETWORK_ERROR");
    return structuredClone(inquiry) as T;
  };
  const view = await render(
    createElement(ReplyWorkspace, {
      targetId: inquiry.targetId,
      access: { kind: "owner", accountId: merchantAccount.id, request },
    }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /요청 조건으로 가능/),
    );
    assert.equal(view.container.querySelector("form"), null);
    await click(view.container, "요청 조건으로 가능");
    const choose = async (select: HTMLSelectElement, value: string) => {
      await act(async () => {
        select.value = value;
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
    };
    const chooseKind = async (label: string) => {
      await click(view.container, "답변 종류 다시 선택");
      await click(view.container, label);
    };
    await choose(
      view.container.querySelector('option[value="FIXED"]')!
        .parentElement as HTMLSelectElement,
      "FIXED",
    );
    await fill(view.container, "proposal.deposit.amount", "15000");
    await chooseKind("조건 변경 제안");
    await fill(view.container, "proposal.expectedGuests", "18");
    await chooseKind("이 문의는 어려워요");
    await chooseKind("요청 조건으로 가능");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="proposal.deposit.amount"]',
      )!.value,
      "15000",
    );
    await chooseKind("조건 변경 제안");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="proposal.expectedGuests"]',
      )!.value,
      "18",
    );

    await chooseKind("이 문의는 어려워요");
    const textarea = view.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="reason"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "작성 중인 거절 사유");
      textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    offline = true;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /작성 중인 답변은 유지/),
    );
    assert.equal(
      view.container.querySelector('textarea[name="reason"]'),
      textarea,
    );
    assert.equal(textarea.value, "작성 중인 거절 사유");
    offline = false;
    await click(view.container, "다시 확인");
    await until(() =>
      assert.doesNotMatch(
        view.container.textContent!,
        /최신 문의를 불러오지 못했어요/,
      ),
    );
    await submit(view.container);
    await until(() => assert.equal(submitted, "작성 중인 거절 사유"));
  } finally {
    await view.unmount();
  }
});

function merchantInquiryFixture(): MerchantInquiry {
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const inquiry: MerchantInquiry = {
    targetId: crypto.randomUUID(),
    restaurantName: "테스트 매장",
    organizerName: "테스트 총무",
    version: 0,
    response: null,
    linkExpiresAt: startsAt,
    snapshot: {
      eventName: "테스트 행사",
      groupName: null,
      startsAt,
      expectedGuests: 20,
      region: "건대입구",
      space: "ANY",
      seating: "ANY",
      seatingImportance: null,
      spaceImportance: null,
      budgetBasis: null,
      budgetAmount: null,
      alcohol: null,
      additionalRequests: null,
    },
    defaults: {
      proposal: {
        startsAt,
        expectedGuests: 20,
        space: "ANY",
        seating: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
      },
      expiresAt: startsAt,
      depositDescription: null,
      bookingDescription: null,
      menuDescription: null,
    },
  };
  return inquiry;
}

test("merchant proposal deadlines use Korean wall time and respect the original event even after postponement", () => {
  const original = {
    ...merchantInquiryFixture().defaults.proposal,
    startsAt: "2099-06-02T09:00:00.000Z",
  };
  assert.equal(koreanDateInput(original.startsAt), "2099-06-02T18:00");
  assert.equal(fromKoreanDateInput("2099-06-02T18:00"), original.startsAt);
  const input = {
    kind: "CHANGE",
    expectedVersion: 0,
    requestKey: crypto.randomUUID(),
    reason: "",
    holdConfirmed: true,
    proposal: { ...original, startsAt: "2099-06-04T09:00:00.000Z" },
    expiresAt: "2099-06-03T09:00:00.000Z",
  };
  const schema = replySchema(original);
  assert.equal(schema.safeParse(input).error?.issues[0]?.path[0], "expiresAt");
  assert.equal(
    schema.safeParse({ ...input, expiresAt: "2099-06-01T09:00:00.000Z" })
      .success,
    true,
  );
});

test("merchant access expiration hides private inquiry and stops writes and focus retries", async (t) => {
  const inquiry = merchantInquiryFixture();
  let denied = false,
    requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return denied
      ? Response.json(
          {
            statusCode: 403,
            code: "MERCHANT_ACCESS_EXPIRED",
            message: "ignored",
            requestId: crypto.randomUUID(),
          },
          { status: 403 },
        )
      : Response.json(inquiry);
  });
  const view = await render(
    createElement(ReplyWorkspace, {
      targetId: inquiry.targetId,
      access: {
        kind: "link",
        access: "test-capability",
        scope: "test-scope",
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        linkExpiresAt: inquiry.linkExpiresAt!,
      },
    }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /이 문의는 어려워요/),
    );
    await click(view.container, "이 문의는 어려워요");
    const field = view.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="reason"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(field, "만료되어도 보존할 입력");
      field.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    denied = true;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /문자에 있는 원래 링크/),
    );
    const count = requests;
    assert.equal(view.container.querySelector("form"), null);
    assert.doesNotMatch(view.container.textContent!, /만료되어도 보존할 입력/);
    await act(async () => {
      await view.cache.refetchQueries();
    });
    assert.equal(requests, count);
  } finally {
    await view.unmount();
  }
});
