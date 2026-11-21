import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { AccountWithdrawalService } from "../../src/modules/account-withdrawal/account-withdrawal.service.js";
import { KakaoWithdrawal } from "../../src/modules/account-withdrawal/entities/kakao-withdrawal.entity.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { ExternalIdentity } from "../../src/modules/auth/entities/external-identity.entity.js";
import { KakaoAttempt } from "../../src/modules/auth/entities/kakao-attempt.entity.js";
import { KAKAO_ISSUER } from "../../src/modules/auth/kakao-oidc.service.js";
import { kakaoCookieName } from "../../src/modules/auth/utils/auth-cookies.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import {
  demoRestaurantIds,
  seedDemoRestaurants,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { signupFixture } from "../support/signup-fixture.js";
import { startResourceApplication } from "../support/resource-application.js";

const prefix = "account/withdrawal";
const pending = { completed: false, pending: true };
const admin = "fake-kakao-admin-key";
const newKey = () => ({ requestKey: randomUUID() });
const newSubject = () =>
  "1" +
  BigInt("0x" + randomBytes(7).toString("hex"))
    .toString()
    .padStart(18, "0");
const matched = (id: string) => new Response(`{"id":${id}}`, { status: 200 });
const absence = () => Response.json({ code: -101 }, { status: 400 });
const env = (clientId: string, key?: string) => ({
  KAKAO_CLIENT_ID: clientId,
  KAKAO_CLIENT_SECRET: "fake-oidc-secret",
  KAKAO_REDIRECT_URI: "http://localhost:3001/api/v1/auth/kakao/callback",
  ...(key ? { KAKAO_ADMIN_KEY: key } : {}),
  PROVIDER_TIMEOUT_MS: "250",
});

type App = Awaited<ReturnType<typeof startResourceApplication>>;
async function linkFixture({ db, call, signup }: App) {
  const jar = await signup();
  const { id, email } = (await (await call("auth/me", jar)).json()) as {
    id: string;
    email: string;
  };
  const sub = newSubject();
  await db.manager.insert(ExternalIdentity, {
    issuer: KAKAO_ISSUER,
    sub,
    accountId: id,
    createdAt: new Date(),
  });
  return { jar, id, email, sub };
}

async function oauthFixture({ db }: App, sub: string, email: string) {
  const browser = randomBytes(32).toString("base64url");
  await db.manager.insert(KakaoAttempt, {
    browserHash: tokenHash(`kakao-browser:${browser}`),
    id: randomUUID(),
    verifier: "",
    nonce: "",
    stateHash: "test",
    purpose: "login",
    status: "verified",
    issuer: KAKAO_ISSUER,
    sub,
    email,
    emailVerifiedAt: new Date(),
    next: "/",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
  });
  return `${kakaoCookieName(false)}=${browser}`;
}

type ProviderCall = { path: string; id: string; signal?: AbortSignal | null };
function fakeProvider(
  t: TestContext,
  handler: (call: ProviderCall) => Promise<Response> | Response,
) {
  const local = globalThis.fetch;
  const requests: ProviderCall[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (["127.0.0.1", "localhost"].includes(url.hostname))
        return local(input, options);
      assert.equal(url.origin, "https://kapi.kakao.com");
      assert.equal(url.search, "");
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "error");
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        `KakaoAK ${admin}`,
      );
      const fields = options?.body;
      assert(fields instanceof URLSearchParams);
      assert.equal(fields.get("target_id_type"), "user_id");
      const id = fields.get("target_id");
      assert(id);
      if (url.pathname === "/v2/user/me")
        assert.equal(fields.get("property_keys"), "[]");
      else assert.equal(url.pathname, "/v1/user/unlink");
      const call = { path: url.pathname, id, signal: options?.signal };
      requests.push(call);
      return handler(call);
    },
  );
  return requests;
}

test("missing key and active reservation never reach Kakao or suspend the account", async (t) => {
  const requests = fakeProvider(t, ({ id }) => matched(id));
  const app = await startResourceApplication(t, env(randomUUID()));
  const missing = await linkFixture(app);
  const refused = await app.call(
    `${prefix}/complete`,
    missing.jar,
    "POST",
    newKey(),
  );
  assert.equal(refused.status, 503);
  assert.equal((await refused.json()).code, "KAKAO_CONFIGURATION");
  assert.equal((await app.call("auth/me", missing.jar)).status, 200);
  assert.equal(
    await app.db.manager.countBy(KakaoWithdrawal, { accountId: missing.id }),
    0,
  );
  const withKey = await startResourceApplication(t, env(randomUUID(), admin));
  t.mock.method(
    withKey.app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(withKey.db);
  const blocked = await linkFixture(withKey);
  const event = await withKey.call("events", blocked.jar, "POST", {
    name: "합성 행사",
  });
  assert.equal(event.status, 201);
  const { id } = await event.json();
  const inquiry = await withKey.call(
    `events/${id}/reservation-requests`,
    blocked.jar,
    "POST",
    {
      ...newKey(),
      mode: "DIRECT",
      expectedEventVersion: 1,
      restaurantIds: [demoRestaurantIds[0]],
      conditions: {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        expectedGuests: 24,
        region: "건대입구",
        seating: "ANY",
        space: "ANY",
      },
      contact: { name: "합성 담당", phone: "01000001234" },
    },
  );
  assert.equal(inquiry.status, 201);
  const state = await (
    await withKey.call(`${prefix}/complete`, blocked.jar, "POST", newKey())
  ).json();
  assert.equal(state.completed, false);
  assert.deepEqual(state.blockers, ["OPEN_INQUIRY"]);
  assert.equal((await withKey.call("auth/me", blocked.jar)).status, 200);
  assert.equal(requests.length, 0);
});

test("exact Kakao success precedes cleanup; verified same-app absence and explicit new signup work", async (t) => {
  let remaining = true;
  let operation: "match" | "wrong" | "absent" = "wrong";
  const app = await startResourceApplication(t, env(randomUUID(), admin));
  const account = await linkFixture(app);
  const oldAttempt = await oauthFixture(app, account.sub, account.email);
  const requests = fakeProvider(t, async ({ path, id }) => {
    assert(
      await app.db.manager.existsBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: id,
      }),
    );
    if (operation === "absent") return absence();
    if (operation === "wrong") return matched((BigInt(id) + 1n).toString());
    if (path.endsWith("/unlink")) remaining = false;
    return matched(id);
  });
  const key = newKey();
  assert.deepEqual(
    await (
      await app.call(`${prefix}/complete`, account.jar, "POST", key)
    ).json(),
    pending,
  );
  assert.equal(remaining, true);
  assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 0);
  operation = "match";
  assert.deepEqual(
    await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
    { completed: true },
  );
  assert.equal(remaining, false);
  assert.equal(
    await app.db.manager.countBy(KakaoWithdrawal, { accountId: account.id }),
    0,
  );
  assert.equal(
    await app.db.manager.countBy(ExternalIdentity, { accountId: account.id }),
    0,
  );
  assert.equal(
    await app.db.manager.countBy(KakaoAttempt, { sub: account.sub }),
    0,
  );
  assert.equal(
    (await app.call("auth/kakao/login", oldAttempt, "POST", {})).status,
    400,
  );
  assert.deepEqual(
    await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
    { completed: true },
  );
  assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 1);
  const freshAttempt = await oauthFixture(app, account.sub, account.email);
  assert.equal(
    (await app.call("auth/kakao/login", freshAttempt, "POST", {})).status,
    400,
  );
  const signup = await signupFixture(app.db, account.email);
  const completedSignup = await app.call(
    "auth/kakao/signup",
    `${freshAttempt}; ${signup.jar}`,
    "POST",
    signup.body,
  );
  assert.equal(completedSignup.status, 201);
  assert.notEqual((await completedSignup.json()).account.id, account.id);

  const already = await linkFixture(app);
  operation = "absent";
  assert.deepEqual(
    await (
      await app.call(`${prefix}/complete`, already.jar, "POST", newKey())
    ).json(),
    { completed: true },
  );
  assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 1);
});

test("unverified absence is incomplete; valid rejection permits a retry; arbitrary client errors remain uncertain", async (t) => {
  let outcome: "absent" | "permission" | "arbitrary" = "absent";
  const requests = fakeProvider(t, ({ path, id }) => {
    if (outcome === "absent") return absence();
    if (path.endsWith("/me")) return matched(id);
    if (outcome === "permission")
      return Response.json({ code: -5 }, { status: 403 });
    return Response.json({ code: -333 }, { status: 400 });
  });
  const app = await startResourceApplication(t, env(randomUUID(), admin));
  const account = await linkFixture(app);
  const key = newKey();
  assert.deepEqual(
    await (
      await app.call(`${prefix}/complete`, account.jar, "POST", key)
    ).json(),
    pending,
  );
  assert.equal(requests.length, 1);
  outcome = "permission";
  assert.deepEqual(
    await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
    pending,
  );
  assert.equal(
    (
      await app.db.manager.findOneByOrFail(KakaoWithdrawal, {
        accountId: account.id,
      })
    ).unlinkStarted,
    false,
  );
  outcome = "arbitrary";
  assert.deepEqual(
    await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
    pending,
  );
  assert.equal(
    (
      await app.db.manager.findOneByOrFail(KakaoWithdrawal, {
        accountId: account.id,
      })
    ).unlinkStarted,
    true,
  );
  assert.deepEqual(
    await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
    pending,
  );
  assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 2);
  assert.equal(
    await app.db.manager.countBy(ExternalIdentity, { accountId: account.id }),
    1,
  );
  assert.equal(
    (await app.db.manager.findOneByOrFail(Account, { id: account.id }))
      .withdrawnAt,
    null,
  );
});

test(
  "timeout and duplicate retry preserve ownership, revoke access, and reconcile without replaying unlink after restart",
  { timeout: 12000 },
  async (t) => {
    const appId = randomUUID();
    const app = await startResourceApplication(t, env(appId, admin));
    const account = await linkFixture(app);
    const oldAttempt = await oauthFixture(app, account.sub, account.email);
    const signup = await signupFixture(app.db, account.email);
    let remoteLinked = true;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const requests = fakeProvider(t, ({ path, id, signal }) => {
      if (path.endsWith("/me")) return remoteLinked ? matched(id) : absence();
      signalStarted();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const key = newKey();
    const original = app.call(`${prefix}/complete`, account.jar, "POST", key);
    await started;
    assert.deepEqual(
      await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
      pending,
    );
    assert.equal(
      (await app.call("events", account.jar, "POST", { name: "불가 행사" }))
        .status,
      401,
    );
    assert.equal((await app.call("auth/me", account.jar)).status, 401);
    assert.equal(
      (
        await app.call("auth/login", "", "POST", {
          email: account.email,
          password: "group-events-123",
        })
      ).status,
      401,
    );
    assert.equal(
      (await app.call("auth/kakao/login", oldAttempt, "POST", {})).status,
      400,
    );
    assert.equal(
      (
        await app.call(
          "auth/kakao/signup",
          `${oldAttempt}; ${signup.jar}`,
          "POST",
          signup.body,
        )
      ).status,
      409,
    );
    await assert.rejects(
      app.db.transaction((m) =>
        app.app.get(AuthService).lockActiveAccount(account.id, m),
      ),
      { code: "SESSION_INVALID" },
    );
    assert.equal(
      await app.db.manager.countBy(ExternalIdentity, { accountId: account.id }),
      1,
    );
    assert.deepEqual(await (await original).json(), pending);
    assert.deepEqual(
      await (await app.call(`${prefix}/receipt`, "", "POST", key)).json(),
      pending,
    );
    assert.deepEqual(
      await (await app.call(`${prefix}/retry`, "", "POST", newKey())).json(),
      { completed: false },
    );
    assert.deepEqual(
      await (await app.call(`${prefix}/retry`, "", "POST", key)).json(),
      pending,
    );
    assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 1);

    // Simulate a provider that committed unlink but whose mutation response was lost.
    remoteLinked = false;
    const restarted = await startResourceApplication(t, env(appId, admin));
    const ops = restarted.app.get(AccountWithdrawalService);
    assert(
      (await ops.listKakaoPending()).some(
        (job) => job.accountId === account.id && job.unlinkStarted,
      ),
    );
    assert.deepEqual(await ops.retryKakaoPending(account.id), {
      completed: true,
    });
    assert.deepEqual(
      await (await restarted.call(`${prefix}/receipt`, "", "POST", key)).json(),
      { completed: true },
    );
    assert.equal(requests.filter((r) => r.path.endsWith("/unlink")).length, 1);
    assert.equal(
      await app.db.manager.countBy(ExternalIdentity, { accountId: account.id }),
      0,
    );
  },
);
