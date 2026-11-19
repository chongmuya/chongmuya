import type { BrowseNavigation } from "@/features/restaurants/types";
import type { useSelectedRestaurants } from "@/features/restaurants/client";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import {
  inquiryConditions,
  type ConditionsValues,
} from "../schemas/conditions.schema";
import { InquiryDetails } from "./reservation-progress";

export function InquiryReview({
  values,
  browse,
  targets,
  targetState,
  unavailable,
  sending,
  onSubmit,
  error,
}: {
  values: ConditionsValues;
  browse: Pick<BrowseNavigation, "selected" | "onNavigate">;
  targets: ReturnType<typeof useSelectedRestaurants>;
  targetState: "ready" | "loading" | "error" | "unavailable";
  unavailable: boolean;
  sending: boolean;
  onSubmit: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm">
        {values.date} {values.time} · {values.expectedGuests}명
      </p>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">보낼 매장</h2>
          <Button
            variant="outline"
            disabled={sending}
            onClick={() =>
              browse.onNavigate({ view: "list", restaurant: null })
            }
          >
            매장 수정
          </Button>
        </div>
        <ul className="space-y-3">
          {browse.selected.map((id, index) => (
            <li key={id} className="rounded-control bg-surface p-4">
              <strong className="text-sm">
                {targets[index]?.data?.name ?? "매장 확인 중…"}
              </strong>
              <p className="mt-1 text-xs text-secondary">
                {targets[index]?.data?.address}
              </p>
            </li>
          ))}
        </ul>
        {targets.some((t) => t.data?.isDemo) && (
          <p className="mt-2 text-xs text-secondary">
            체험 매장에는 실제 문자가 발송되지 않아요.
          </p>
        )}
      </section>
      {targetState === "loading" && <LoadingState>매장 확인 중…</LoadingState>}
      {targetState === "error" && (
        <ErrorState
          retry={() =>
            targets.forEach((target) => {
              if (target.isError) void target.refetch();
            })
          }
        >
          매장 정보를 다시 확인해 주세요.
        </ErrorState>
      )}
      {targetState === "unavailable" && (
        <p role="alert" className="text-sm text-danger">
          인원이나 문의 수신 조건이 맞지 않는 매장이 있어요. 매장 선택을 수정해
          주세요.
        </p>
      )}
      <InquiryDetails
        conditions={inquiryConditions(values)}
        contact={{ name: values.contactName, phone: values.contactPhone }}
      />
      <Button
        variant="outline"
        className="w-full"
        disabled={sending}
        onClick={() =>
          browse.onNavigate({ view: "conditions", restaurant: null })
        }
      >
        문의 조건 수정
      </Button>
      <p className="rounded-control bg-choice p-4 text-sm">
        보낸 뒤에는 조건이나 매장을 바꿀 수 없고, 이 행사에서 다시 문의할 수
        없어요.
      </p>
      <FormError message={error} />
      <Button
        className="w-full"
        loading={sending}
        disabled={
          unavailable || targetState !== "ready" || !browse.selected.length
        }
        onClick={onSubmit}
      >
        문의 보내기
      </Button>
    </div>
  );
}
