import "reflect-metadata";
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { readFile, writeFile, stat } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { RestaurantManagementService } from "../dist/modules/restaurants/restaurant-management.service.js";
import { MessageDeliveryService } from "../dist/modules/reservations/message-delivery.service.js";
import { MerchantRepliesService } from "../dist/modules/reservations/merchant-replies.service.js";
config({ quiet: true });
let app;
try {
  const { values: v } = parseArgs({
    options: Object.fromEntries(
      [
        "action",
        "restaurant",
        "account",
        "delivery",
        "target",
        "contact",
        "actor",
        "reason",
        "output",
        "input",
        "query",
        "base-address",
        "detail-address",
        "version",
      ]
        .map((key) => [key, { type: "string" }])
        .concat([
          ["execute", { type: "boolean", default: false }],
          ["unpublish", { type: "boolean", default: false }],
        ]),
    ),
  });
  const actions = [
    "owner-link",
    "publish",
    "normalize-address",
    "deliveries",
    "retry",
    "reconcile",
    "expire-lease",
    "regenerate-link",
    "change-recipient",
    "record-reply",
    "record-contact",
  ];
  if (!actions.includes(v.action)) throw new Error();
  const uuid = (value) => {
    if (
      !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
        value ?? "",
      )
    )
      throw new Error();
    return value;
  };
  if (
    v.action !== "deliveries" &&
    (!v.actor?.trim() ||
      !v.reason?.trim() ||
      v.actor.length > 100 ||
      v.reason.length > 500)
  )
    throw new Error();
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  const privateInput = async () => {
    if (!v.input) throw new Error();
    const info = await stat(v.input);
    if (!info.isFile() || info.size > 32768 || info.mode & 0o077)
      throw new Error();
    return JSON.parse(await readFile(v.input, "utf8"));
  };
  let result;
  if (["owner-link", "publish"].includes(v.action))
    result = await app.get(RestaurantManagementService).operate({
      restaurantId: uuid(v.restaurant),
      actor: v.actor,
      reason: v.reason,
      ...(v.action === "owner-link"
        ? { accountId: uuid(v.account) }
        : { published: !v.unpublish }),
      dryRun: !v.execute,
    });
  else if (v.action === "normalize-address")
    result = await app.get(RestaurantManagementService).normalizeAddress({
      restaurantId: uuid(v.restaurant),
      actor: v.actor,
      reason: v.reason,
      query: v.query,
      baseAddress: v["base-address"],
      detailAddress: v["detail-address"] ?? "",
      version: Number(v.version),
      dryRun: !v.execute,
    });
  else if (v.action === "record-contact")
    result = await app
      .get(RestaurantManagementService)
      .recordContact(
        uuid(v.restaurant),
        await privateInput(),
        v.actor,
        v.reason,
        !v.execute,
      );
  else if (v.action === "deliveries")
    result = await app.get(MessageDeliveryService).listForOperations();
  else if (v.action === "retry") {
    const id = uuid(v.delivery);
    if (v.execute)
      await app
        .get(MessageDeliveryService)
        .dispatch(id, { actor: v.actor, reason: v.reason });
    result = {
      deliveryId: id,
      dryRun: !v.execute,
      dispatchAttempted: !!v.execute,
      ...(v.execute
        ? (await app.get(MessageDeliveryService).listForOperations()).find(
            (row) => row.id === id,
          )
        : {}),
    };
  } else if (v.action === "expire-lease") {
    result = await app
      .get(MessageDeliveryService)
      .expireLease(uuid(v.delivery), v.actor, v.reason, !v.execute);
  } else if (v.action === "reconcile") {
    const id = uuid(v.delivery);
    result = v.execute
      ? await app.get(MessageDeliveryService).reconcile(id, v.actor, v.reason)
      : { deliveryId: id, dryRun: true };
  } else if (v.action === "regenerate-link")
    result = await app
      .get(MessageDeliveryService)
      .regenerateLink(uuid(v.target), v.actor, v.reason, !v.execute);
  else if (v.action === "change-recipient")
    result = await app
      .get(MessageDeliveryService)
      .changeRecipient(
        uuid(v.target),
        uuid(v.contact),
        v.actor,
        v.reason,
        !v.execute,
      );
  else {
    const id = uuid(v.target);
    const input = await privateInput();
    if (!input.method || !input.confirmedAt || !input.reply) throw new Error();
    result = v.execute
      ? await app.get(MerchantRepliesService).save(
          id,
          {
            kind: "operator",
            actor: v.actor,
            reason: v.reason,
            method: input.method,
            confirmedAt: input.confirmedAt,
          },
          input.reply,
          `operator:${v.actor}`,
        )
      : { targetId: id, dryRun: true };
  }
  // Export only to a new private file. Never print contact numbers, message text or reply tokens.
  if (v.output)
    await writeFile(v.output, JSON.stringify(result, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  if (result && !Array.isArray(result) && "status" in result)
    console.log(
      `발송 상태: ${result.status}; 시도 여부: ${(result.dispatchAttempted ?? (v.action === "regenerate-link" && v.execute)) ? "시도" : "미시도"}`,
    );
  console.log(
    `${v.action}: ${v.execute ? "명시적으로 실행했습니다" : "조회·dry-run 완료"}${v.output ? ". 새 0600 파일에 결과를 저장했습니다" : ""}.`,
  );
} catch (error) {
  const allowed = [
    "RESTAURANT_DUPLICATE",
    "RESTAURANT_VERSION_CONFLICT",
    "DELIVERY_RETRY_BLOCKED",
    "MERCHANT_REPLY_CONFLICT",
    "MERCHANT_LINK_INVALID",
    "ADDRESS_SELECTION_REQUIRED",
    "GEOCODING_UNAVAILABLE",
    "GEOCODING_CONFIGURATION",
  ];
  console.error(
    `실행하지 못했습니다. 입력 ID·실행자·사유·설정을 확인하세요.${allowed.includes(error?.code) ? ` (${error.code})` : ""}`,
  );
  process.exitCode = 1;
} finally {
  await app?.close();
}
