import { ProposalComparison } from "./proposal-comparison";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm, isoDate, localDate, type Field } from "./command-form";
import { won } from "./completion-summary";
import { guidanceFields, buildGuidance } from "./payment-forms";
export function ChangeForms({
  data: q,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const props = { data: q, access },
    organizer = access.kind === "organizer",
    pending = q.changes.find((c) =>
      ["REQUESTED", "PROPOSED"].includes(c.status),
    );
  return (
    <section className="space-y-5">
      <h3 className="font-semibold">예약 변경·취소</h3>
      {pending && (
        <div className="space-y-4 rounded-control bg-choice p-5 text-sm">
          <p>
            {pending.kind === "CANCEL" ? "취소" : "변경"} 문의 ·{" "}
            {pending.status === "REQUESTED"
              ? "매장 확인 대기"
              : "합의 내용 확인 대기"}
          </p>
          <p className="whitespace-pre-wrap">{pending.reason}</p>
          <p>문의만으로 예약 조건이나 환불이 바뀌지 않아요.</p>
          {pending.proposal && (
            <ProposalComparison data={q} proposal={pending.proposal} />
          )}
        </div>
      )}
      {!q.cancellation && !pending && organizer && (
        <CommandForm
          {...props}
          action="change-request"
          title="변경·취소 문의 보내기"
          description="매장의 처리 제안을 확인하고 수락해야 적용돼요. 자동 취소나 자동 환불은 하지 않아요."
          fields={[
            {
              name: "kind",
              label: "문의 종류",
              options: [
                { value: "CHANGE", label: "예약 변경 문의" },
                { value: "CANCEL", label: "예약 취소 문의" },
              ],
            },
            {
              name: "subject",
              label: "문의 항목",
              value: "OTHER",
              options: [
                { value: "SCHEDULE", label: "일정" },
                { value: "GUESTS", label: "인원" },
                { value: "MENU", label: "메뉴" },
                { value: "OTHER", label: "기타" },
              ],
            },
            {
              name: "reason",
              label: "문의 내용 (100자 이내)",
              type: "textarea",
              max: 100,
            },
          ]}
          build={(v) => ({
            kind: v.kind,
            subject: v.subject,
            reason: v.reason,
          })}
        />
      )}
      {pending?.status === "PROPOSED" && organizer && (
        <CommandForm
          {...props}
          action="change-accept"
          title={
            pending.kind === "CANCEL" ? "취소 처리 내용 수락" : "변경 내용 수락"
          }
          fields={[
            {
              name: "confirmed",
              label: "위 처리 내용과 금액·메뉴·조건을 확인했고 동의해요",
              type: "checkbox",
            },
          ]}
          build={() => ({ changeId: pending.id, confirmed: true })}
        />
      )}
      {pending && !organizer && (
        <>
          {pending.status === "REQUESTED" && (
            <ProposalForm
              {...props}
              changeId={pending.id}
              cancel={pending.kind === "CANCEL"}
            />
          )}
          <CommandForm
            {...props}
            action="change-reject"
            title="문의 불가 결과 안내"
            fields={[
              {
                name: "reason",
                label: "처리 불가 사유",
                type: "textarea",
                max: 500,
              },
            ]}
            build={(v) => ({ changeId: pending.id, reason: v.reason })}
          />
        </>
      )}
      {q.cancellation && !organizer && (
        <>
          <CommandForm
            {...props}
            action="refund-plan"
            title="환불 예정액 기록"
            description="실제 반환 기록과 구분돼요. 0원은 환불 없음이 확인된 경우에만 입력해 주세요."
            fields={[
              {
                name: "amount",
                label: "확인된 환불 예정 총액 (원)",
                type: "number",
                value:
                  q.refundExpected === null ? "" : String(q.refundExpected),
              },
              {
                name: "reason",
                label: "합의·변경 사유",
                type: "textarea",
                max: 500,
              },
            ]}
            build={(v) => ({ amount: Number(v.amount), reason: v.reason })}
          />
          <CommandForm
            {...props}
            action="refund"
            title="실제 반환 기록"
            description="은행에서 반환이 완료된 금액만 기록해 주세요. 여기서 송금은 실행되지 않아요."
            fields={[
              {
                name: "amount",
                label: "이번 실제 반환액 (원)",
                type: "number",
              },
              {
                name: "refundedAt",
                label: "실제 반환 시각",
                type: "datetime-local",
              },
              {
                name: "reason",
                label: "반환 확인 내용",
                type: "textarea",
                max: 500,
              },
            ]}
            build={(v) => ({
              amount: Number(v.amount),
              refundedAt: isoDate(v.refundedAt),
              reason: v.reason,
            })}
          />
        </>
      )}
      {!!q.changes.length && (
        <details className="text-sm">
          <summary>변경·취소 문의 이력</summary>
          <ul className="mt-3 space-y-3">
            {q.changes.map((c) => (
              <li key={c.id}>
                {c.kind === "CANCEL" ? "취소" : "변경"} ·{" "}
                {
                  {
                    REQUESTED: "문의 중",
                    PROPOSED: "제안 중",
                    APPLIED: "적용 완료",
                    REJECTED: "처리 불가",
                  }[c.status]
                }
                <p>{c.reason}</p>
                {c.proposal && <p>{c.proposal.reason}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
function ProposalForm({
  data: q,
  access,
  changeId,
  cancel,
}: {
  data: Completion;
  access: CompletionAccess;
  changeId: string;
  cancel: boolean;
}) {
  const fields: Field[] = [
    { name: "reason", label: "합의할 처리 내용", type: "textarea", max: 500 },
    {
      name: "refundExpected",
      label: "환불 예정 총액 (미확인은 빈칸, 없음은 0)",
      type: "number",
      optional: true,
    },
  ];
  if (!cancel)
    fields.push(
      {
        name: "startsAt",
        label: "변경할 일정",
        type: "datetime-local",
        value: localDate(q.agreement.startsAt),
      },
      {
        name: "expectedGuests",
        label: "변경할 인원",
        type: "number",
        value: String(q.agreement.expectedGuests),
      },
      {
        name: "menuDeadlineAt",
        label: "메뉴 제출 기한",
        type: "datetime-local",
        value: localDate(q.agreement.menuDeadlineAt),
        optional: true,
      },
      {
        name: "minimumSpend",
        label: "최소 주문 금액 (미확인은 빈칸)",
        type: "number",
        value:
          q.agreement.minimumSpend === null
            ? ""
            : String(q.agreement.minimumSpend),
        optional: true,
      },
      {
        name: "minimumQuantity",
        label: "최소 주문 수량 (미확인은 빈칸)",
        type: "number",
        value:
          q.agreement.minimumQuantity == null
            ? ""
            : String(q.agreement.minimumQuantity),
        optional: true,
      },
      {
        name: "separateFee",
        label: "별도 이용료 (미확인은 빈칸)",
        type: "number",
        value:
          q.agreement.separateFee === null
            ? ""
            : String(q.agreement.separateFee),
        optional: true,
      },
      {
        name: "replaceMenu",
        label: "메뉴를 아래 수량으로 변경해 제안해요",
        type: "checkbox",
        optional: true,
      },
      ...q.catalog.menus.map((m) => ({
        name: `menu_${m.id}`,
        label: `${m.name} · ${won(m.price)}${!m.available ? " · 품절" : ""} 수량`,
        type: "number" as const,
        value: String(q.order?.lines.find((l) => l.id === m.id)?.quantity ?? 0),
        optional: true,
      })),
      {
        name: "replaceGuidance",
        label: "예약금 안내도 아래 내용으로 변경해 제안해요",
        type: "checkbox",
        optional: true,
      },
      ...guidanceFields(q).map((f) => ({ ...f, optional: true })),
    );
  return (
    <CommandForm
      data={q}
      access={access}
      action="change-propose"
      title="처리 내용 제안"
      description="총무가 수락하기 전에는 기존 조건이 유지돼요. 변경 후 메뉴·금액·기한을 다시 검증해요."
      fields={fields}
      build={(v, b) => ({
        changeId,
        reason: v.reason,
        refundExpected: v.refundExpected ? Number(v.refundExpected) : null,
        ...(!cancel
          ? {
              agreement: {
                ...b.agreement,
                startsAt: isoDate(v.startsAt),
                expectedGuests: Number(v.expectedGuests),
                menuDeadlineAt: v.menuDeadlineAt
                  ? isoDate(v.menuDeadlineAt)
                  : null,
                minimumSpend: v.minimumSpend ? Number(v.minimumSpend) : null,
                minimumQuantity: v.minimumQuantity
                  ? Number(v.minimumQuantity)
                  : null,
                separateFee: v.separateFee ? Number(v.separateFee) : null,
              },
              ...(v.replaceMenu === "yes"
                ? {
                    menu: {
                      catalogVersion: b.catalog.version,
                      items: b.catalog.menus.map((m) => ({
                        id: m.id,
                        quantity: Number(v[`menu_${m.id}`] || 0),
                      })),
                    },
                  }
                : {}),
              ...(v.replaceGuidance === "yes"
                ? { guidance: buildGuidance(v) }
                : {}),
            }
          : {}),
      })}
    />
  );
}
