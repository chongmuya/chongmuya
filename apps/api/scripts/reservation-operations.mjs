import "reflect-metadata";
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { createOperationsApplication } from "./operations-application.mjs";
import { ReservationSelectionService } from "../dist/modules/reservations/reservation-selection.service.js";
import { ReservationNotificationsService } from "../dist/modules/reservations/reservation-notifications.service.js";
import { NotificationsService } from "../dist/modules/notifications/notifications.service.js";
import {
  operationId,
  requireOperator,
  printOperationError,
} from "./merchant-cli.mjs";
config({ quiet: true });
let app;
try {
  const { values: v } = parseArgs({
    options: {
      action: { type: "string" },
      target: { type: "string" },
      delivery: { type: "string" },
      actor: { type: "string" },
      reason: { type: "string" },
      execute: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
  if (v.help) {
    console.log(`reservation:operations --action <작업> [옵션]
조회: notifications (추가 옵션 불필요)
문자 장애 확인·복구: reconcile-notification --delivery UUID, retry-notification --delivery UUID, dispatch
예약 예외 처리: expire, close-unanswered --target UUID
조회 외 작업은 --actor 실행자 --reason 확인근거가 필수이며 기본은 미리보기입니다. --execute로 적용합니다.
close-unanswered는 미리보기 검증을 수행합니다. 나머지는 미리보기에서 인자만 확인하며, 공급자 결과 조회·업무 처리는 --execute가 필요합니다.
expire는 선택 기한만 처리하며 무응답을 불가로 바꾸지 않습니다. UNKNOWN/PROCESSING은 재발송하지 않습니다.`);
  } else {
    if (
      ![
        "expire",
        "dispatch",
        "notifications",
        "close-unanswered",
        "retry-notification",
        "reconcile-notification",
      ].includes(v.action)
    )
      throw new Error("INVALID_ACTION");
    if (v.action !== "notifications") requireOperator(v);
    if (v.action === "close-unanswered") operationId(v.target);
    if (v.action.endsWith("notification")) operationId(v.delivery);
    app = await createOperationsApplication();
    const selections = app.get(ReservationSelectionService),
      sender = app.get(ReservationNotificationsService),
      notices = app.get(NotificationsService);
    let result = { action: v.action, dryRun: !v.execute };
    if (v.action === "notifications") result = await notices.operations();
    else if (v.action === "close-unanswered")
      result = await selections.closeUnanswered(
        v.target,
        v.actor,
        v.reason,
        !v.execute,
      );
    else if (v.execute) {
      if (v.action === "expire") result = await selections.expirePending();
      if (v.action === "dispatch") await sender.dispatchPending();
      if (v.action === "retry-notification")
        await sender.dispatch(v.delivery, { actor: v.actor, reason: v.reason });
      if (v.action === "reconcile-notification")
        result = await sender.reconcile(v.delivery, v.actor, v.reason);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  printOperationError(error);
  process.exitCode = 1;
} finally {
  await app?.close();
}
