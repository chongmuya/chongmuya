import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliveryTable,
  deliveryNextStep,
} from "../apps/api/scripts/merchant-cli.mjs";

test("operator table masks contacts and excludes private snapshots; uncertain delivery recommends reconciliation", () => {
  const row = {
    id: "delivery-id",
    restaurant_name: "가상 매장\u001b[31m",
    status: "UNKNOWN",
    attempts: 1,
    current: true,
    recipient_phone: "01012345678",
    original_recipient_phone: "01099998888",
    organizer_phone: "01087654321",
    conditions: { secret: "snapshot-sentinel" },
    encryptedToken: "encrypted-sentinel",
    holdReasons: [],
  };
  const visible = JSON.stringify(deliveryTable([row]));
  assert.match(visible, /\*\*\*-\*\*\*\*-5678/);
  assert.doesNotMatch(
    visible,
    /01012345678|01099998888|01087654321|snapshot-sentinel|encrypted-sentinel|\\u001b/,
  );
  assert.match(deliveryNextStep(row), /reconcile.*재발송 금지/);
  assert.match(deliveryNextStep({ ...row, current: false }), /reconcile/);
  assert.match(
    deliveryNextStep({ ...row, status: "PROCESSING", leaseExpired: true }),
    /reconcile/,
  );
  assert.doesNotMatch(
    deliveryNextStep({ ...row, status: "PROCESSING" }),
    /retry/,
  );
  assert.doesNotMatch(
    deliveryNextStep({
      ...row,
      status: "PENDING",
      holdReasons: ["CONSENT_WITHDRAWN"],
    }),
    /retry/,
  );
  assert.match(
    deliveryNextStep({ ...row, status: "ACCEPTED", provider: "fake" }),
    /실제 문자 없음/,
  );
});
