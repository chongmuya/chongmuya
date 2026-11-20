import { Button } from "@/shared/ui/button";
export function UncertainCommand({
  loading,
  onRetry,
}: {
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-control bg-choice p-4 text-sm"
    >
      <p>
        요청의 저장 여부를 아직 확인하지 못했어요. 최신 내역이 바뀌어도 이
        입력을 새 요청으로 보내지 않아요. 원래 요청 그대로 결과를 다시 확인해
        주세요.
      </p>
      <Button loading={loading} onClick={onRetry}>
        원래 요청 결과 다시 확인
      </Button>
    </div>
  );
}
