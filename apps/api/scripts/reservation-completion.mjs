import "reflect-metadata";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { ReservationCommands } from "../dist/modules/reservations/reservation-completion.controller.js";
import { ReservationCompletionService } from "../dist/modules/reservations/reservation-completion.service.js";
import { ReservationChangesService } from "../dist/modules/reservations/reservation-changes.service.js";
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
      reservation: { type: "string" },
      input: { type: "string" },
      actor: { type: "string" },
      confirmer: { type: "string" },
      method: { type: "string" },
      "confirmed-at": { type: "string" },
      reason: { type: "string" },
      execute: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
  if (v.help)
    console.log(
      "reservation:completion --action inspect|guidance|receipt|resolve|change-propose|change-reject|apply-agreement|refund-plan|refund|link --reservation UUID --actor 기록자 --confirmer 실제확인자 --method PHONE|SMS --confirmed-at ISO --reason 확인근거 [--input 로컬JSON파일] [--execute]\n기본 dry-run. 쓰기 JSON에 requestKey와 expectedVersion 필수. apply-agreement는 organizerConfirmer, merchantConfirmer, agreementEvidence도 필수. 실제 송금·환불은 실행하지 않습니다. 링크/계좌/원문 입력은 출력하지 않습니다.",
    );
  else {
    requireOperator(v);
    operationId(v.reservation);
    if (
      ![
        "inspect",
        "guidance",
        "receipt",
        "resolve",
        "change-propose",
        "change-reject",
        "apply-agreement",
        "refund-plan",
        "refund",
        "link",
      ].includes(v.action)
    )
      throw new Error("INVALID_ACTION");
    const principal = {
      kind: "operator",
      actor: v.actor,
      confirmer: v.confirmer ?? "",
      method: v.method,
      confirmedAt: v["confirmed-at"] ?? "",
      reason: v.reason,
    };
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const completion = app.get(ReservationCompletionService);
    completion.audit(principal);
    const current = await completion.get(v.reservation, principal);
    let result = current;
    if (v.action !== "inspect") {
      if (!v.input) throw new Error("INPUT_REQUIRED");
      const input = JSON.parse(await readFile(v.input, "utf8"));
      operationId(input.requestKey);
      if (!v.execute && input.expectedVersion !== current.version)
        throw new Error("VERSION_CONFLICT");
      if (v.execute)
        result =
          v.action === "link"
            ? await completion.manageLink(v.reservation, principal, input)
            : v.action === "apply-agreement"
              ? await app
                  .get(ReservationChangesService)
                  .acceptOperator(v.reservation, principal, input)
              : await app
                  .get(ReservationCommands)
                  .run(v.action, v.reservation, principal, input);
    }
    console.log(
      JSON.stringify({
        action: v.action,
        dryRun: !v.execute,
        reservation: result.id,
        version: result.version,
        progress: result.progress,
        issues: result.issues,
        receivedAmount: result.receivedAmount,
        refundedAmount: result.refundedAmount,
        refundExpected: result.refundExpected,
        changes: result.changes.map((c) => ({
          id: c.id,
          kind: c.kind,
          status: c.status,
        })),
      }),
    );
  }
} catch (error) {
  printOperationError(error);
  process.exitCode = 1;
} finally {
  await app?.close();
}
