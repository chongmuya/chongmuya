import type { Scope } from "../api/handovers.api";
export function TransferScope({ scope }: { scope: Scope }) {
  return (
    <div className="rounded-control border border-border p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">
        함께 넘어가는 것
      </h2>
      <ul className="space-y-3 text-sm">
        {[
          ["지난·진행 중 행사", `${scope.events}건`],
          ["모임 기본 명단", `${scope.roster}명`],
          [
            "정산·영수증 자료",
            `${scope.settlements}건 · 첨부 ${scope.files}개`,
          ],
          ["매장 즐겨찾기", `${scope.favorites}곳`],
          ["모임 관리 권한", ""],
        ].map(([name, value]) => (
          <li key={name}>
            <span aria-hidden className="mr-3 text-brand">
              ✓
            </span>
            {name} {value}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-muted">
        진행 중 문의 {scope.ongoingInquiries}건, 관리할 예약{" "}
        {scope.ongoingReservations}건과 미완료 정산{" "}
        {scope.incompleteSettlements}건도 포함돼요. 개인 행사·일정·즐겨찾기와
        개인 기본 계좌는 넘어가지 않아요.
      </p>
    </div>
  );
}
