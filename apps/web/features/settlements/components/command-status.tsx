import { Button } from "@/shared/ui/button";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type { useSettlementCommand } from "../hooks/use-settlement-command";
export function CommandStatus({
  command: c,
}: {
  command: ReturnType<typeof useSettlementCommand>;
}) {
  return (
    <>
      {c.error && (
        <p role="alert" className="text-danger">
          {safeErrorMessage(c.error)}
        </p>
      )}
      {c.uncertain && (
        <div role="status">
          <p>
            처리 결과를 아직 확인하지 못했습니다. 입력과 요청을 보존했습니다.
            같은 요청으로 다시 확인해 주세요.
          </p>
          <Button
            disabled={c.isPending}
            onClick={() => void c.retryUncertain().catch(() => {})}
          >
            같은 요청 재시도
          </Button>
        </div>
      )}
    </>
  );
}
