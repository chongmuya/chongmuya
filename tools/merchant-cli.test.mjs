import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deliveryTable,
  deliveryNextStep,
  privateInput,
} from "../apps/api/scripts/merchant-cli.mjs";
import {
  copyRestaurantInput,
  privateRestaurantInput,
  restaurantInputLimit,
} from "../apps/api/scripts/restaurant-data-input.mjs";

test("restaurant input permits bounded private files over 32KB without widening recovery inputs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "restaurant-input-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "source.json"),
    copy = join(directory, "copy.json");
  const contents = JSON.stringify({ synthetic: "x".repeat(44000) });
  await writeFile(source, contents, { mode: 0o600 });
  await assert.rejects(privateInput(source), /PRIVATE_INPUT_REQUIRED/);
  assert.equal((await privateRestaurantInput(source)).synthetic.length, 44000);
  await copyRestaurantInput(source, copy);
  assert.equal(await readFile(source, "utf8"), contents);
  assert.equal(await readFile(copy, "utf8"), contents);
  assert.equal((await stat(copy)).mode & 0o777, 0o600);
  await assert.rejects(copyRestaurantInput(source, copy), { code: "EEXIST" });
  await chmod(source, 0o644);
  await assert.rejects(
    privateRestaurantInput(source),
    /PRIVATE_INPUT_REQUIRED/,
  );
  await chmod(source, 0o600);
  await writeFile(source, "x".repeat(restaurantInputLimit + 1));
  await assert.rejects(
    privateRestaurantInput(source),
    /PRIVATE_INPUT_REQUIRED/,
  );
  await assert.rejects(
    privateRestaurantInput(directory),
    /PRIVATE_INPUT_REQUIRED/,
  );
});

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
