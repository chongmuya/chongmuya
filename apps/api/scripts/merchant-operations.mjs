import "reflect-metadata";
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { open } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { RestaurantOperationsService } from "../dist/modules/restaurants/restaurant-operations.service.js";
import { MessageDeliveryService } from "../dist/modules/reservations/message-delivery.service.js";
import { MerchantRepliesService } from "../dist/modules/reservations/merchant-replies.service.js";
import { deliveryStates } from "../dist/modules/reservations/types/merchant-reply.js";
import {
  operationId as uuid,
  requireOperator,
  privateInput,
  printDeliveries,
  printOperation,
  printOperationError,
} from "./merchant-cli.mjs";

config({ quiet: true });
let app, output;
async function run() {
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
        "status",
        "page",
      ]
        .map((key) => [key, { type: "string" }])
        .concat([
          ["execute", { type: "boolean", default: false }],
          ["unpublish", { type: "boolean", default: false }],
          ["help", { type: "boolean", default: false }],
        ]),
    ),
  });
  if (v.help) {
    console.log(`merchant:operations --action <작업> [옵션]
조회: deliveries [--status ${deliveryStates.join("|")}] [--page N | --delivery UUID] (최신순, 50건씩)
매장 관리: publish --restaurant UUID [--unpublish], owner-link --restaurant UUID --account UUID,
           record-contact --restaurant UUID --input 비공개JSON
발송 복구: retry --delivery UUID, reconcile --delivery UUID
예외 처리: regenerate-link --target UUID, change-recipient --target UUID --contact UUID,
           record-reply --target UUID --input 비공개JSON
변경 작업은 --actor 실행자 --reason 사유가 필수이며 기본은 dry-run입니다. --execute로 적용합니다.
조회는 마스킹된 표로 출력합니다. 이력 파일은 --page N 또는 --delivery UUID와 함께 --output 새파일을 지정하세요(0600, 덮어쓰기 금지).
정상 문의 문자는 서버가 자동 발송합니다. 이 도구는 매장 관리와 장애 확인용입니다.`);
    return;
  }
  const actions = [
    "owner-link",
    "publish",
    "deliveries",
    "retry",
    "reconcile",
    "regenerate-link",
    "change-recipient",
    "record-reply",
    "record-contact",
  ];
  if (!actions.includes(v.action)) throw new Error("INVALID_ACTION");
  if (
    v.status &&
    (v.action !== "deliveries" || !deliveryStates.includes(v.status))
  )
    throw new Error("INVALID_STATUS");
  const page = Number(v.page ?? "1");
  if (
    v.page !== undefined &&
    (v.action !== "deliveries" ||
      v.delivery ||
      !/^[1-9]\d*$/.test(v.page) ||
      !Number.isSafeInteger(page * 50))
  )
    throw new Error("INVALID_PAGE");
  if (v.action === "deliveries" && v.output && !v.page && !v.delivery)
    throw new Error("EXPORT_SCOPE_REQUIRED");
  if (v.action !== "deliveries") requireOperator(v);
  if (["owner-link", "publish", "record-contact"].includes(v.action))
    uuid(v.restaurant);
  if (v.action === "owner-link") uuid(v.account);
  if (["retry", "reconcile"].includes(v.action) || v.delivery) uuid(v.delivery);
  if (
    ["regenerate-link", "change-recipient", "record-reply"].includes(v.action)
  )
    uuid(v.target);
  if (v.action === "change-recipient") uuid(v.contact);
  // Reserve the export before a mutation, so an existing file cannot hide a completed action.
  if (v.output) output = await open(v.output, "wx", 0o600);
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  const deliveries = app.get(MessageDeliveryService);
  let result;
  if (["owner-link", "publish"].includes(v.action))
    result = await app.get(RestaurantOperationsService).operate({
      restaurantId: v.restaurant,
      actor: v.actor,
      reason: v.reason,
      ...(v.action === "owner-link"
        ? { accountId: v.account }
        : { published: !v.unpublish }),
      dryRun: !v.execute,
    });
  else if (v.action === "record-contact")
    result = await app
      .get(RestaurantOperationsService)
      .recordContact(
        v.restaurant,
        await privateInput(v.input),
        v.actor,
        v.reason,
        !v.execute,
      );
  else if (v.action === "deliveries")
    result = await deliveries.listForOperations({
      status: v.status,
      page,
      deliveryId: v.delivery,
    });
  else if (v.action === "retry")
    result = {
      deliveryId: v.delivery,
      dryRun: !v.execute,
      ...(v.execute
        ? await deliveries.dispatch(v.delivery, {
            actor: v.actor,
            reason: v.reason,
          })
        : { dispatchAttempted: false }),
    };
  else if (v.action === "reconcile")
    result = await deliveries.reconcile(
      v.delivery,
      v.actor,
      v.reason,
      !v.execute,
    );
  else if (v.action === "regenerate-link")
    result = await deliveries.regenerateLink(
      v.target,
      v.actor,
      v.reason,
      !v.execute,
    );
  else if (v.action === "change-recipient")
    result = await deliveries.changeRecipient(
      v.target,
      v.contact,
      v.actor,
      v.reason,
      !v.execute,
    );
  else {
    const input = await privateInput(v.input);
    if (!input.method || !input.confirmedAt || !input.reply)
      throw new Error("INVALID_REPLY");
    result = v.execute
      ? await app.get(MerchantRepliesService).save(
          v.target,
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
      : { targetId: v.target, dryRun: true };
  }
  if (result.deliveryId)
    result.delivery = (
      await deliveries.listForOperations({ deliveryId: result.deliveryId })
    )[0];
  if (output) {
    await output.writeFile(JSON.stringify(result, null, 2) + "\n");
    console.log("원본 결과를 새 비공개 파일(0600)에 저장했습니다.");
  }
  if (v.action === "deliveries") {
    printDeliveries(result, Boolean(v.delivery));
    if (!v.delivery && result.length === 50)
      console.log(`다음 페이지 조회: --page ${page + 1}`);
  } else printOperation(v.action, result, v);
}
try {
  await run();
} catch (error) {
  printOperationError(error);
  console.error("사용법: merchant:operations --help");
  process.exitCode = 1;
} finally {
  await output?.close();
  await app?.close();
}
