import { parseArgs } from "node:util";
import { operationId } from "./merchant-cli.mjs";
import { createOperationsApplication } from "./operations-application.mjs";

async function run() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { actor: { type: "string" } },
  });
  const [command, id, extra] = positionals;
  const actor = values.actor?.trim();
  const list = command === "list" && !id && !actor;
  const review =
    command === "review" &&
    id &&
    !extra &&
    actor &&
    actor.length <= 80 &&
    !/\p{Cc}/u.test(actor);
  if (!list && !review) throw new Error("INVALID_ARGUMENT");
  const requestId = review ? operationId(id) : null;
  const { AccountWithdrawalService } =
    await import("../dist/modules/account-withdrawal/account-withdrawal.service.js");
  const app = await createOperationsApplication();
  try {
    const service = app.get(AccountWithdrawalService);
    const result = requestId
      ? await service.review(requestId, actor)
      : await service.listPending();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

run().catch(() => {
  process.stderr.write(
    "탈퇴 요청을 조회하거나 검토 처리하지 못했습니다. 실행 인자와 DB 연결을 확인해 주세요.\n",
  );
  process.exitCode = 1;
});
