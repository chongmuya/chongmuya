import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { ClosedInquiry } from "../features/merchant-replies/components/closed-inquiry";
import { ReplyWorkspace } from "../features/merchant-replies/components/reply-workspace";
import {
  koreanDateInput,
  fromKoreanDateInput,
} from "../shared/lib/korean-date";
import {
  replyMenuDeadline,
  replySchema,
} from "../features/merchant-replies/schemas/reply.schema";
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
    menuDeadlineAt: "2099-06-01T09:00:00.000Z",
  };
  assert.equal(koreanDateInput(original.startsAt), "2099-06-02T18:00");
  assert.equal(fromKoreanDateInput("2099-06-02T18:00"), original.startsAt);
  const { menuDeadlineAt, ...proposed } = original;
  assert.equal(
    replyMenuDeadline(original, original.startsAt),
    Date.parse(menuDeadlineAt),
  );
  const input = {
    kind: "CHANGE",
    expectedVersion: 0,
    requestKey: crypto.randomUUID(),
    reason: "",
    holdConfirmed: true,
    proposal: { ...proposed, startsAt: "2099-06-04T09:00:00.000Z" },
    expiresAt: "2099-06-03T09:00:00.000Z",
  };
  const schema = replySchema(original);
  assert.equal(
    schema.safeParse({
      ...input,
      proposal: { ...proposed, startsAt: "2099-06-01T09:00:00.000Z" },
      expiresAt: "2099-05-31T10:00:00.000Z",
    }).error?.issues[0]?.path[0],
    "expiresAt",
  );
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

test("usage minutes and minimum quantity explain blocked submission accessibly and recover", async () => {
  const inquiry = merchantInquiryFixture();
  inquiry.defaults.proposal.usageTime = { kind: "MINUTES", minutes: 120 };
  let saves = 0;
  const request: SessionRequest = async <T>(
    _p: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      saves++;
      return { version: 1, response: null } as T;
    }
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
    await click(view.container, "요청 조건으로 가능");
    await fill(view.container, "proposal.usageTime.minutes", "0");
    await fill(view.container, "proposal.minimumQuantity", "-1");
    await submit(view.container);
    for (const name of [
      "proposal.usageTime.minutes",
      "proposal.minimumQuantity",
    ]) {
      const input = view.container.querySelector<HTMLInputElement>(
        `[name="${name}"]`,
      )!;
      await until(() =>
        assert.equal(input.getAttribute("aria-invalid"), "true"),
      );
      assert.match(
        document.getElementById(input.getAttribute("aria-describedby")!)!
          .textContent!,
        /입력해 주세요/,
      );
    }
    assert.equal(saves, 0);
    await fill(view.container, "proposal.usageTime.minutes", "120");
    await fill(view.container, "proposal.minimumQuantity", "10");
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('[name="holdConfirmed"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(saves, 1));
  } finally {
    await view.unmount();
  }
});

test("expired inquiry renders notice instead of editable reply", async () => {
  const inquiry = { ...merchantInquiryFixture(), closedState: "EXPIRED" };
  const request: SessionRequest = async <T>() => inquiry as T;
  const view = await render(
    createElement(ReplyWorkspace, {
      targetId: inquiry.targetId,
      access: { kind: "owner", accountId: merchantAccount.id, request },
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /기한/));
    assert.equal(view.container.querySelector("form"), null);
  } finally {
    await view.unmount();
  }
});

test("closed inquiry links show why the seat hold ended", async () => {
  for (const [state, reason] of [
    ["OTHER_SELECTED", "총무가 다른 매장을 선택했어요."],
    ["ORGANIZER_DECLINED", "총무가 이 매장의 제안을 거절했어요."],
  ]) {
    const result = await render(createElement(ClosedInquiry, { state }));
    try {
      assert(result.container.textContent?.includes(reason));
    } finally {
      await result.unmount();
    }
  }
});

test("owner and link show the saved first reply and keep the submission key across a network retry", async (t) => {
  for (const accessKind of ["owner", "link"] as const) {
    await t.test(accessKind, async (t) => {
      const inquiry = merchantInquiryFixture();
      const writes: Record<string, unknown>[] = [];
      const request: SessionRequest = async <T>(
        _path: string,
        options?: RequestInit,
      ) => {
        if (options?.method !== "POST") return structuredClone(inquiry) as T;
        const reply = JSON.parse(String(options.body)).reply;
        writes.push(reply);
        if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
        inquiry.version = 1;
        inquiry.response = {
          kind: "CHANGE",
          revision: 1,
          snapshot: {
            ...inquiry.snapshot,
            requested: inquiry.snapshot,
            offered: { ...reply.proposal, menuDeadlineAt: null },
          },
          reason: "",
          createdAt: new Date().toISOString(),
          expiresAt: reply.expiresAt,
          state: "PROPOSED",
        };
        return { version: inquiry.version, response: inquiry.response } as T;
      };
      t.mock.method(
        globalThis,
        "fetch",
        async (_url: unknown, options?: RequestInit) =>
          Response.json(
            await request("/api/v1/merchant-replies/test", options),
          ),
      );
      const access =
        accessKind === "owner"
          ? { kind: accessKind, accountId: merchantAccount.id, request }
          : {
              kind: accessKind,
              access: "test-capability",
              scope: "test-first-reply",
              accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
              linkExpiresAt: inquiry.linkExpiresAt!,
            };
      const screen = () =>
        createElement(ReplyWorkspace, { targetId: inquiry.targetId, access });
      const view = await render(screen());
      try {
        await until(() =>
          assert.match(view.container.textContent!, /조건 변경 제안/),
        );
        await click(view.container, "조건 변경 제안");
        assert.match(
          view.container.textContent!,
          /답변을 보내면 수정할 수 없어요. 예약 조건을 확인해 주세요./,
        );
        assert.equal(
          view.container.querySelector('[name="proposal.menuDeadlineAt"]'),
          null,
        );
        await fill(view.container, "proposal.expectedGuests", "18");
        await fill(view.container, "proposal.usageTime.minutes", "90");
        await fill(view.container, "proposal.separateFee", "30000");
        await act(async () =>
          view.container
            .querySelector<HTMLInputElement>('[name="holdConfirmed"]')!
            .click(),
        );
        await submit(view.container);
        await until(() => {
          assert.equal(writes.length, 1);
          assert.equal(
            view.container.querySelector<HTMLButtonElement>(
              'button[type="submit"]',
            )?.disabled,
            false,
          );
        });
        await submit(view.container);
        await until(() =>
          assert.match(view.container.textContent!, /이미 답변을 보냈어요/),
        );
        assert.equal(writes.length, 2);
        assert.deepEqual(writes[1], writes[0]);
        const sent = writes[0].proposal as Record<string, unknown>;
        assert(!Object.hasOwn(sent, "menuDeadlineAt"));
        assert.equal(sent.separateFee, 30000);
        assert.deepEqual(sent.usageTime, { kind: "MINUTES", minutes: 90 });
        assert.equal(view.container.querySelector("form"), null);
        assert.doesNotMatch(view.container.textContent!, /답변 수정하기/);
      } finally {
        await view.unmount();
      }
      const reopened = await render(screen());
      try {
        await until(() =>
          assert.match(reopened.container.textContent!, /이미 답변을 보냈어요/),
        );
        assert.match(reopened.container.textContent!, /30,000원/);
        assert.match(reopened.container.textContent!, /90분/);
        assert.match(reopened.container.textContent!, /전화해 주세요/);
        assert.equal(reopened.container.querySelector("form"), null);
      } finally {
        await reopened.unmount();
      }
      Object.assign(inquiry, { closedState: "EXPIRED" });
      const expired = await render(screen());
      try {
        await until(() =>
          assert.match(expired.container.textContent!, /이미 답변을 보냈어요/),
        );
        assert.match(
          expired.container.textContent!,
          /총무의 선택 기한이 지났어요/,
        );
        assert.match(expired.container.textContent!, /30,000원/);
        assert.equal(expired.container.querySelector("form"), null);
      } finally {
        await expired.unmount();
      }
    });
  }
});
