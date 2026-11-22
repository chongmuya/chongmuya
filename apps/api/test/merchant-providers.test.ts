import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import { ConfigService } from "../src/config/config.service.js";
import { parseEnvironment } from "../src/config/environment.js";
import { SolapiMessageGateway } from "../src/modules/reservations/providers/solapi-message.gateway.js";
import { NaverGeocoder } from "../src/modules/restaurants/providers/naver.geocoder.js";
import { validSolapiSignature } from "../src/modules/reservations/providers/solapi-webhook.js";
import { textMessageFormat } from "../src/modules/reservations/lib/reservation-sms.js";
import { FakeMessageGateway } from "../src/modules/reservations/providers/fake-message.gateway.js";
import { safeReturnPath } from "../src/modules/auth/utils/return-path.js";
const id = "752fb868-6dc0-4ef8-8f4a-0ed7049ff010";
const config = (overrides: NodeJS.ProcessEnv = {}) =>
  ({
    environment: parseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test@localhost/test",
      AUTH_SECRET: "test-secret-longer-than-32-characters",
      WEB_ORIGIN: "http://localhost:3000",
      MESSAGE_PROVIDER: "solapi",
      SOLAPI_API_KEY: "fake-api-key",
      SOLAPI_API_SECRET: "fake-api-secret",
      SOLAPI_WEBHOOK_SECRET: "test-webhook-secret-123456",
      SOLAPI_SENDER_NUMBER: "0299999999",
      GEOCODING_PROVIDER: "naver",
      NAVER_MAP_CLIENT_ID: "fake-naver-id",
      NAVER_MAP_CLIENT_SECRET: "fake-naver-secret",
      ...overrides,
    }),
  }) as ConfigService;
test("pausing SMS blocks the send endpoint and keeps provider lookup available", async (t) => {
  const provider = new SolapiMessageGateway(
    config({ SMS_SEND_ENABLED: "false" }),
  );
  const fetch = t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.pathname, "/messages/v4/list");
    return Response.json({ messageList: {} });
  });
  await assert.rejects(provider.send(id, "01012345678", "안내"), {
    code: "SMS_DISABLED",
  });
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(
    await provider.lookup({
      deliveryId: id,
      messageId: "message",
      to: "01012345678",
      startedAt: new Date(),
    }),
    [],
  );
  assert.equal(fetch.mock.callCount(), 1);
});
test("direct SOLAPI automatic SMS/LMS contract, scoped endpoint, no automatic retry and filtered lookup", async (t) => {
  const provider = new SolapiMessageGateway(config());
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      calls++;
      assert.equal(
        String(url),
        "https://api.solapi.com/messages/v4/send-many/detail",
      );
      const headers = options.headers as Record<string, string>;
      assert.match(
        headers.Authorization,
        /^HMAC-SHA256 apiKey=fake-api-key, date=.+, salt=[a-f0-9]{32}, signature=[a-f0-9]{64}$/,
      );
      const body = JSON.parse(String(options.body));
      assert.equal(body.messages.length, 1);
      assert.equal(Object.hasOwn(body.messages[0], "type"), false);
      assert.equal(Object.hasOwn(body.messages[0], "subject"), false);
      assert.equal(body.messages[0].text, "가짜 문의 #token=test");
      assert.equal(body.messages[0].customFields.deliveryId, id);
      assert.equal(body.showMessageList, true);
      return Response.json({
        failedMessageList: [],
        groupInfo: { groupId: "G1" },
        messageList: [
          {
            messageId: "M1",
            type: "SMS",
            groupId: "G1",
            statusCode: "2000",
            customFields: { deliveryId: id },
          },
        ],
      });
    },
  );
  assert.deepEqual(
    await provider.send(id, "01099990000", "가짜 문의 #token=test"),
    {
      status: "ACCEPTED",
      provider: "solapi",
      groupId: "G1",
      messageId: "M1",
      channel: "SMS",
    },
  );
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new DOMException("timeout", "TimeoutError");
  });
  assert.equal(
    (await provider.send(id, "01099990000", "test")).status,
    "UNKNOWN",
  );
  assert.equal(calls, 2);
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 403 });
  });
  assert.equal(
    (await provider.send(id, "01099990000", "test")).errorCode,
    "CONFIGURATION",
  );
  assert.equal(calls, 3);
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.pathname, "/messages/v4/list");
    assert.equal(url.searchParams.get("to"), "01099990000");
    assert(!url.search.includes("customFields"));
    return Response.json({
      nextKey: null,
      messageList: {
        a: {
          messageId: "M1",
          statusCode: "4000",
          customFields: { deliveryId: id },
        },
        b: {
          messageId: "M2",
          statusCode: "4000",
          customFields: { deliveryId: "f75efca9-172c-4a1d-a325-e428337b2a18" },
        },
      },
    });
  });
  assert.equal(
    (
      await provider.lookup({
        deliveryId: id,
        to: "01099990000",
        startedAt: new Date(),
      })
    ).length,
    1,
  );
});
test("NAVER adapter uses server headers, validated x/y and preserves multiple/empty results", async (t) => {
  const provider = new NaverGeocoder(config());
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(
      url.origin + url.pathname,
      "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
    );
    assert.equal(url.searchParams.get("query"), "가짜 도로 1");
    assert.equal(
      (options.headers as Record<string, string>)["x-ncp-apigw-api-key"],
      "fake-naver-secret",
    );
    return Response.json({
      status: "OK",
      addresses: [
        {
          roadAddress: "가짜 도로 1",
          jibunAddress: "가짜 동 1",
          x: "127.1",
          y: "37.5",
          addressElements: [],
        },
        { roadAddress: "가짜 도로 2", jibunAddress: "", x: "128.1", y: "36.5" },
      ],
    });
  });
  const result = await provider.search("가짜 도로 1");
  assert.equal(result.length, 2);
  assert.equal(result[0].longitude, 127.1);
  assert.equal(result[0].latitude, 37.5);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: "OK", addresses: [] }),
  );
  assert.deepEqual(await provider.search("없음"), []);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "OK",
      addresses: [{ roadAddress: "주소", jibunAddress: "", x: "", y: "91" }],
    }),
  );
  await assert.rejects(provider.search("주소"));
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 429 }),
  );
  await assert.rejects(provider.search("주소"), { code: "GEOCODING_LIMIT" });
});
test("webhook signature binds original bytes and ±5 minute window; legacy/static header is insufficient", () => {
  const secret = "not-a-real-webhook-secret",
    now = Date.now(),
    t = Math.floor(now / 1000),
    raw = Buffer.from('[ { "statusCode": "4000", "messageId": "한글" } ]');
  const v = createHmac(
    "sha256",
    createHash("sha1").update(secret).digest("hex"),
  )
    .update(`${t}.`)
    .update(raw)
    .digest("hex");
  assert(validSolapiSignature(`t=${t},v1=${v}`, raw, secret, now));
  assert(
    !validSolapiSignature(
      `t=${t},v1=${v}`,
      Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
      secret,
      now,
    ),
  );
  assert(!validSolapiSignature(`t=${t},v1=${v}`, raw, secret, now + 301000));
  assert(!validSolapiSignature(`t=${t},v1=${v}`, raw, secret, now - 301000));
  assert(
    !validSolapiSignature(
      createHash("sha1").update(secret).digest("hex"),
      raw,
      secret,
    ),
  );
});
test("server return path retains attendance tab/round and bounded owner routes", () => {
  for (const view of ["attendance", "roster", "reservation"])
    assert.equal(
      safeReturnPath(`/events?event=${id}&view=${view}&round=${id}`),
      `/events?event=${id}&round=${id}&view=${view}`,
    );
  assert.equal(
    safeReturnPath(`/owner/inquiries?target=${id}&ownerId=evil`),
    `/owner/inquiries?target=${id}`,
  );
  assert.equal(safeReturnPath("/events?view=evil&round=bad"), "/events");
  assert.equal(
    safeReturnPath(`/events?event=${id}&request=${id}`),
    `/events?event=${id}&request=${id}`,
  );
  assert.equal(safeReturnPath("//evil.test/owner"), "/events");
});

test("SOLAPI status codes classify progress, completion and failures in the direct send response", async (t) => {
  const provider = new SolapiMessageGateway(config());
  for (const [code, status, stage] of [
    ["2000", "ACCEPTED", undefined],
    ["3000", "ACCEPTED", undefined],
    ["4000", "DELIVERED", undefined],
    ["1030", "FAILED", "SUBMISSION"],
    ["2230", "FAILED", "SUBMISSION"],
    ["3032", "FAILED", "DELIVERY"],
    ["3047", "FAILED", "DELIVERY"],
    ["5000", "FAILED", "DELIVERY"],
  ] as const) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        failedMessageList: [],
        groupInfo: { groupId: "status-group" },
        messageList: [{ messageId: "status-message", statusCode: code }],
      }),
    );
    const result = await provider.send(id, "01099990000", "fake test");
    assert.equal(result.status, status, code);
    assert.equal(result.failureStage, stage, code);
    if (stage) assert.equal(result.errorCode, `PROVIDER_${code}`);
  }
});

test("restaurant page and roster continuation queries are bounded and preserved", () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  const path = safeReturnPath(
    `/restaurants?selected=${id}&event=${id}&inquiry=1&view=map&region=서울&page=2&redirect=https://evil.test`,
  );
  const parsed = new URL(path, "https://local.test");
  assert.equal(parsed.searchParams.get("view"), "map");
  assert.equal(parsed.searchParams.get("region"), "서울");
  assert.equal(parsed.searchParams.get("selected"), id);
  assert.equal(parsed.searchParams.has("redirect"), false);
  assert.equal(
    safeReturnPath(`/events?event=${id}&view=roster&action=add`),
    `/events?event=${id}&action=add&view=roster`,
  );
});

test("SOLAPI EUC-KR boundaries use the full body and the fake gateway shares validation", async (t) => {
  const fake = new FakeMessageGateway();
  const real = new SolapiMessageGateway(config());
  const link = "\nhttps://example.test/notifications";
  for (const limit of [90, 91, 2000]) {
    const body = "가".repeat(20) + "a".repeat(limit - link.length - 40) + link;
    const channel = limit <= 90 ? "SMS" : "LMS";
    const fetch = t.mock.method(
      globalThis,
      "fetch",
      async (_url: string, options: RequestInit) => {
        const {
          messages: [message],
        } = JSON.parse(String(options.body));
        assert.equal(message.text, body);
        assert.equal(Object.hasOwn(message, "type"), false);
        assert.equal(Object.hasOwn(message, "subject"), false);
        return Response.json({
          failedMessageList: [],
          groupInfo: { groupId: "G" },
          messageList: [{ messageId: "M", statusCode: "2000", type: channel }],
        });
      },
    );
    assert.deepEqual(textMessageFormat(body), { bytes: limit, channel });
    assert(Buffer.byteLength(body) > limit);
    assert.equal((await fake.send(id, "01099990000", body)).channel, channel);
    assert.equal((await real.send(id, "01099990000", body)).channel, channel);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }

  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected send");
  });
  for (const body of ["a".repeat(2001), "가나다🙂", "가\u0000", "뷁"]) {
    assert.equal(textMessageFormat(body), null);
    for (const gateway of [fake, real]) {
      const rejected = await gateway.send(id, "01099990000", body);
      assert.equal(rejected.failureStage, "SUBMISSION");
      assert.equal(rejected.errorCode, "MESSAGE_BODY_INVALID");
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
});
