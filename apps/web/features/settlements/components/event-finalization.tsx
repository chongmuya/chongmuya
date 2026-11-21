import { useId, useState } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
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
  const dialogTitle = useId();
  const [open, setOpen] = useState(false);
  const command = useSettlementCommand(access, () => setOpen(false));
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null);
  const noExpenses = !data.state.expenses.some((expense) => !expense.deletedAt);
  const confirmed = confirmedVersion === data.state.version;
  const blocked =
    data.summary.status === "IN_PROGRESS" || !!data.depositConflicts?.length;

  if (data.state.finalizedAt && !command.uncertain)
    return (
      <p role="status" className="text-sm font-semibold text-brand-ink">
        마무리 완료
      </p>
    );

  return (
    <>
      <Button
        className="shrink-0 text-sm"
        aria-haspopup="dialog"
        onClick={() => {
          setConfirmedVersion(null);
          setOpen(true);
        }}
      >
        행사 마무리
      </Button>
      {open && (
        <Dialog
          labelledBy={dialogTitle}
          showCloseButton
          busy={command.isPending || command.uncertain}
          onClose={() => setOpen(false)}
          className="space-y-4"
        >
          <h3 id={dialogTitle} className="text-lg font-semibold">
            행사 마무리
          </h3>
          {blocked && !command.uncertain ? (
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
                마무리 확인
              </Button>
            </>
          )}
          <CommandStatus command={command} />
        </Dialog>
      )}
    </>
  );
}
