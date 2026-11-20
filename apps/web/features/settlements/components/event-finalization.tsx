import { useState } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import type { Access, Detail } from "../types/settlement.types";
import { CommandStatus } from "./command-status";

export function EventFinalization({
  access,
  data,
}: {
  access: Access;
  data: Detail;
}) {
  const command = useSettlementCommand(access);
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null);
  const noExpenses = !data.state.expenses.some((expense) => !expense.deletedAt);
  const confirmed = confirmedVersion === data.state.version;
  const blocked =
    data.summary.status === "IN_PROGRESS" || !!data.depositConflicts?.length;

  return (
    <section
      className="space-y-3 rounded-control bg-surface p-5 shadow-card"
      aria-labelledby="event-finalization"
    >
      <h3 id="event-finalization" className="text-lg font-semibold">
        행사 마무리
      </h3>
      {blocked ? (
        <>
          <p className="text-sm text-secondary">
            정산에서 확인이 필요한 내용을 먼저 처리해 주세요.
          </p>
          <Link
            href={`/events?event=${access.eventId}&view=settlement`}
            className={buttonStyles({ className: "w-full" })}
          >
            정산 확인하기
          </Link>
        </>
      ) : data.state.finalizedAt ? (
        <p role="status" className="text-sm text-secondary">
          행사 마무리를 완료했어요.
        </p>
      ) : (
        <>
          {noExpenses && (
            <label className="flex min-h-control items-center gap-3 text-sm">
              <Checkbox
                checked={confirmed}
                disabled={command.isPending || command.uncertain}
                onChange={(e) =>
                  setConfirmedVersion(
                    e.target.checked ? data.state.version : null,
                  )
                }
              />
              정산할 비용이 없어요
            </label>
          )}
          <Button
            className="w-full"
            loading={command.isPending}
            disabled={command.uncertain || (noExpenses && !confirmed)}
            onClick={() =>
              command.mutate({
                action: "FINALIZE_EVENT",
                expectedVersion: data.state.version,
                noExpenses: noExpenses && confirmed,
              })
            }
          >
            행사 마무리
          </Button>
        </>
      )}
      <CommandStatus command={command} />
    </section>
  );
}
