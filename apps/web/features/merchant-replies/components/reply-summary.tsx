import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { Reply, RequestSnapshot } from "../types/reply.types";
export const spaceLabel = {
  ANY: "상관없음",
  HALL: "일반 홀",
  ROOM: "룸",
  FLOOR: "한 층 대관",
  WHOLE: "전체 대관",
};
export const seatingLabel = {
  ANY: "상관없음",
  CLOSE: "함께 착석",
  SEPARATED: "분리 착석",
};
export const money = (n: number | null) =>
  n === null
    ? "확인 필요"
    : n === 0
      ? "없음"
      : `${n.toLocaleString("ko-KR")}원`;
export function RequestSummary({ snapshot: s }: { snapshot: RequestSnapshot }) {
  return (
    <dl className="space-y-2 text-sm">
      <div>
        <dt className="text-muted">행사</dt>
        <dd>
          {s.eventName} · {s.groupName ?? "개인 행사"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">일시·인원</dt>
        <dd>
          {koreanDateLabel(s.startsAt)} · {s.expectedGuests}명
        </dd>
      </div>
      <div>
        <dt className="text-muted">지역·공간</dt>
        <dd>
          {s.region} · {spaceLabel[s.space]}
          {s.spaceImportance
            ? ` (${s.spaceImportance === "REQUIRED" ? "꼭 필요" : "희망"})`
            : ""}
        </dd>
      </div>
      <div>
        <dt className="text-muted">좌석</dt>
        <dd>
          {seatingLabel[s.seating]}
          {s.seatingImportance
            ? ` (${s.seatingImportance === "REQUIRED" ? "꼭 필요" : "희망"})`
            : ""}
        </dd>
      </div>
      <div>
        <dt className="text-muted">예산·주류</dt>
        <dd>
          {s.budgetAmount === null
            ? "미입력"
            : `${s.budgetBasis === "PER_PERSON" ? "1인당" : "전체"} ${money(s.budgetAmount)}`}{" "}
          · 주류{" "}
          {s.alcohol === "INCLUDED"
            ? "포함"
            : s.alcohol === "EXCLUDED"
              ? "별도"
              : "미정"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">추가 요청</dt>
        <dd className="whitespace-pre-wrap break-words">
          {s.additionalRequests || "미입력"}
        </dd>
      </div>
    </dl>
  );
}
export function ReplySummary({ response: r }: { response: Reply }) {
  const p = r.snapshot.offered,
    original = r.snapshot.requested;
  return (
    <section className="mt-4 space-y-3 rounded-control border border-brand/20 p-4 text-sm">
      <h3 className="font-bold">
        {
          { AVAILABLE: "가능 제안", CHANGE: "조건 변경 제안", DECLINE: "불가" }[
            r.kind
          ]
        }{" "}
        · {r.revision}차 답변
      </h3>
      <p className="text-xs text-muted">{koreanDateLabel(r.createdAt)}</p>
      {r.kind === "DECLINE" ? (
        <p className="whitespace-pre-wrap break-words">{r.reason}</p>
      ) : (
        p && (
          <>
            <dl className="space-y-2">
              <div>
                <dt>일시</dt>
                <dd>
                  {r.kind === "CHANGE" &&
                    Date.parse(p.startsAt) !==
                      Date.parse(original.startsAt) && (
                      <span className="block text-muted">
                        요청: {koreanDateLabel(original.startsAt)}
                      </span>
                    )}
                  {koreanDateLabel(p.startsAt)}
                </dd>
              </div>
              <div>
                <dt>인원·공간</dt>
                <dd>
                  {r.kind === "CHANGE" && (
                    <span className="block text-muted">
                      요청: {original.expectedGuests}명 ·{" "}
                      {spaceLabel[original.space]} ·{" "}
                      {seatingLabel[original.seating]}
                    </span>
                  )}
                  {p.expectedGuests}명 · {spaceLabel[p.space]} ·{" "}
                  {seatingLabel[p.seating]}
                </dd>
              </div>
              <div>
                <dt>최소 이용금액 / 별도 대관료</dt>
                <dd>
                  {money(p.minimumSpend)} / {money(p.separateFee)}
                </dd>
              </div>
              <div>
                <dt>예약금</dt>
                <dd>
                  {p.deposit.kind === "PER_RESERVATION"
                    ? "예약별 협의"
                    : money(p.deposit.amount)}
                </dd>
              </div>
              <div>
                <dt>메뉴 확정</dt>
                <dd>
                  {p.menuDeadlineAt
                    ? koreanDateLabel(p.menuDeadlineAt)
                    : "확인 필요"}
                </dd>
              </div>
            </dl>
            {p.note && (
              <p className="whitespace-pre-wrap break-words">{p.note}</p>
            )}
            <p className="font-semibold text-brand-action">
              {r.state === "EXPIRED"
                ? "제안 선택 기한이 지났어요"
                : `선택 기한: ${koreanDateLabel(r.expiresAt!)}`}
            </p>
          </>
        )
      )}
    </section>
  );
}
