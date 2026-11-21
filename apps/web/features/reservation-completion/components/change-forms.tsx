"use client";
import { useState, type ReactNode } from "react";
import { ProposalComparison } from "./proposal-comparison";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm } from "./command-form";
import { isoDate, localDate } from "../lib/command-values";
import type { Field } from "../types/command-field";
import { won } from "./completion-summary";
import { guidanceFields, buildGuidance } from "../lib/guidance-fields";
import { proposalAgreement } from "../lib/proposal-agreement";
import {
  spaceLabels,
  seatingLabels,
  usageLabel,
} from "../lib/agreement-labels";
export function ChangeForms({
  data: q,
  access,
  initialKind,
  onClose,
  onDetails,
  contact,
}: {
  data: Completion;
  access: CompletionAccess;
  initialKind?: "CANCEL";
  onClose?: () => void;
  onDetails?: () => void;
  contact?: ReactNode;
}) {
  const props = { data: q, access },
    organizer = access.kind === "organizer",
    pending = q.changes.find(
      (c) =>
        c.kind !== "REFUND" && ["REQUESTED", "PROPOSED"].includes(c.status),
    );
  const [lastPending, setLastPending] = useState(pending);
  if (pending && lastPending?.id !== pending.id) setLastPending(pending);
  const editable = pending ?? lastPending;
  const title =
    pending?.status === "PROPOSED" && organizer
      ? pending.kind === "CANCEL"
        ? "예약 취소를 수락할까요?"
        : "예약 변경을 수락할까요?"
      : "예약 변경·취소";
  return (
    <section className="space-y-7">
      {!pending?.proposal && (
        <h3 className="text-center text-2xl leading-[1.5] font-bold text-brand-ink">
          {title}
        </h3>
      )}
      {pending && (
        <div className={pending.proposal ? undefined : "space-y-4 text-sm"}>
          {!pending.proposal && (
            <>
              <p>
                {pending.kind === "CANCEL" ? "취소" : "변경"} 문의 ·{" "}
                {pending.status === "REQUESTED"
                  ? "매장 확인 대기"
                  : "합의 내용 확인 대기"}
              </p>
              <p className="whitespace-pre-wrap">{pending.reason}</p>
              <p>문의만으로 예약 조건이나 환불이 바뀌지 않아요.</p>
            </>
          )}
          {pending.proposal && (
            <ProposalComparison
              data={q}
              proposal={pending.proposal}
              kind={pending.kind}
              onDetails={onDetails}
              title={title}
            />
          )}
        </div>
      )}
      {(q.cancellation ||
        pending?.kind === "CANCEL" ||
        initialKind === "CANCEL") && (
        <div className="space-y-2 rounded-control bg-choice p-4 text-sm">
          <p>
            환불 여부·금액·반환 일정은 {organizer ? "매장과" : "총무와"} 전화로
            협의해 주세요.
          </p>
          {contact}
        </div>
      )}
      {organizer && (
        <CommandForm
          available={!q.cancellation && !pending}
          {...props}
          action="change-request"
          onDone={onClose}
          title="변경·취소 문의 보내기"
          description="매장의 처리 제안을 확인하고 수락해야 적용돼요. 자동 취소나 자동 환불은 하지 않아요."
          fields={[
            {
              name: "kind",
              label: "문의 종류",
              value: initialKind,
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
      {pending?.status === "PROPOSED" &&
        organizer &&
        !(
          pending.kind === "CHANGE" && pending.proposal?.refundExpected !== null
        ) && (
          <CommandForm
            {...props}
            action="change-accept"
            onDone={onClose}
            title="수락하기"
            hideTitle
            onCancel={onClose}
            fields={[]}
            build={() => ({ changeId: pending.id, confirmed: true })}
          />
        )}
      {editable && !organizer && (
        <>
          {lastPending?.status === "REQUESTED" && (
            <ProposalForm
              key={editable.id}
              {...props}
              changeId={editable.id}
              cancel={editable.kind === "CANCEL"}
              onDone={onClose}
              available={
                pending?.id === editable.id && pending.status === "REQUESTED"
              }
            />
          )}
          <CommandForm
            {...props}
            available={!!pending}
            action="change-reject"
            onDone={onClose}
            title="문의 불가 결과 안내"
            fields={[
              {
                name: "reason",
                label: "처리 불가 사유",
                type: "textarea",
                max: 500,
              },
            ]}
            build={(v) => ({ changeId: editable.id, reason: v.reason })}
          />
        </>
      )}
      {q.cancellation && !organizer && (
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
      )}
      {onClose && !(pending?.status === "PROPOSED" && organizer) && (
        <button
          type="button"
          className="min-h-11 w-full text-sm text-muted"
          onClick={onClose}
        >
          뒤로가기
        </button>
      )}
      {!!q.changes.length && !onClose && (
        <details className="text-sm">
          <summary>변경·취소 문의 이력</summary>
          <ul className="mt-3 space-y-3">
            {q.changes.map((c) => (
              <li key={c.id}>
                {c.kind === "REFUND"
                  ? "환불 예정액"
                  : c.kind === "CANCEL"
                    ? "취소"
                    : "변경"}{" "}
                ·{" "}
                {
                  {
                    REQUESTED: "문의 중",
                    PROPOSED: "제안 중",
                    APPLIED: "적용 완료",
                    REJECTED: "처리 불가",
                  }[c.status]
                }
                <p>{c.reason}</p>
                {c.status === "REJECTED" && c.resolutionReason && (
                  <p>사장님 답변: {c.resolutionReason}</p>
                )}
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
  available,
  onDone,
}: {
  data: Completion;
  access: CompletionAccess;
  changeId: string;
  cancel: boolean;
  available: boolean;
  onDone?: () => void;
}) {
  const fields: Field[] = [
    { name: "reason", label: "합의할 처리 내용", type: "textarea", max: 500 },
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
        minValue: 1,
        maxValue: 100000,
      },
      {
        name: "space",
        label: "변경할 공간",
        value: q.agreement.space,
        options: Object.entries(spaceLabels).map(([value, label]) => ({
          value,
          label,
        })),
      },
      {
        name: "seating",
        label: "변경할 착석 조건",
        value: q.agreement.seating,
        options: Object.entries(seatingLabels).map(([value, label]) => ({
          value,
          label,
        })),
      },
      {
        name: "usageKind",
        label: "이용시간 제한",
        value: q.agreement.usageTime?.kind ?? "UNKNOWN",
        options: [
          { value: "UNKNOWN", label: "미확인" },
          { value: "UNLIMITED", label: "제한 없음" },
          { value: "MINUTES", label: "이용시간 지정" },
        ],
      },
      {
        name: "usageMinutes",
        label: "이용시간 (분)",
        when: (v) => v.usageKind === "MINUTES",
        type: "number",
        value:
          q.agreement.usageTime?.minutes == null
            ? ""
            : String(q.agreement.usageTime.minutes),
        optional: true,
      },
      {
        name: "note",
        label: "매장 추가 안내",
        type: "textarea",
        value: q.agreement.note,
        optional: true,
        max: 1500,
      },
      {
        name: "changeCancellationPolicy",
        label: "합의할 변경·취소 조건",
        type: "textarea",
        value: q.agreement.changeCancellationPolicy ?? "",
        optional: true,
        max: 1500,
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
        label: "주문 메뉴도 변경하기",
        type: "checkbox",
        optional: true,
      },
      ...q.catalog.menus.map((m) => ({
        name: `menu_${m.id}`,
        label: `${m.name} · ${won(m.price)}${!m.available ? " · 품절" : ""} 수량`,
        type: "number" as const,
        when: (v: Partial<Record<string, string>>) => v.replaceMenu === "yes",
        value: String(q.order?.lines.find((l) => l.id === m.id)?.quantity ?? 0),
        optional: true,
      })),
      {
        name: "replaceGuidance",
        label: "예약금 안내도 변경하기",
        type: "checkbox",
        optional: true,
      },
      ...guidanceFields(q).map((f) => ({
        ...f,
        when: (v: Partial<Record<string, string>>) =>
          v.replaceGuidance === "yes" && f.when?.(v) !== false,
      })),
    );
  return (
    <CommandForm
      data={q}
      access={access}
      available={available}
      action="change-propose"
      onDone={onDone}
      title="처리 내용 제안"
      description="총무가 수락하기 전에는 기존 조건이 유지돼요. 변경 후 메뉴·금액·기한을 다시 검증해요."
      fields={fields}
      validate={
        cancel
          ? undefined
          : (v) =>
              v.usageKind === "MINUTES" &&
              (!v.usageMinutes ||
                Number(v.usageMinutes) < 1 ||
                Number(v.usageMinutes) > 1440)
                ? [
                    {
                      field: "usageMinutes",
                      message: "이용시간을 1~1440분으로 입력해 주세요.",
                    },
                  ]
                : []
      }
      preview={
        cancel
          ? undefined
          : (values, base) => (
              <div className="space-y-5 rounded-[12px] border border-placeholder px-5 py-6 text-sm">
                <h4 className="text-xl font-semibold">바꾼 조건</h4>
                <dl className="space-y-3">
                  {[
                    [
                      "공간",
                      spaceLabels[base.agreement.space],
                      spaceLabels[values.space as keyof typeof spaceLabels],
                    ],
                    [
                      "착석",
                      seatingLabels[base.agreement.seating],
                      seatingLabels[
                        values.seating as keyof typeof seatingLabels
                      ],
                    ],
                    [
                      "이용시간",
                      usageLabel(base.agreement),
                      values.usageKind === "UNLIMITED"
                        ? "제한 없음"
                        : values.usageKind === "MINUTES"
                          ? `${values.usageMinutes || "미입력"}분`
                          : "미확인",
                    ],
                    [
                      "추가 안내",
                      base.agreement.note || "없음",
                      values.note || "없음",
                    ],
                    [
                      "변경·취소 조건",
                      base.agreement.changeCancellationPolicy || "미확인",
                      values.changeCancellationPolicy || "미확인",
                    ],
                  ].map(([label, before, after]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[72px_minmax(0,1fr)] gap-3"
                    >
                      <dt className="text-muted">{label}</dt>
                      <dd className="space-y-1 whitespace-pre-wrap wrap-anywhere">
                        {before === after ? (
                          <span>{after}</span>
                        ) : (
                          <>
                            <span className="block line-through">{before}</span>
                            <span className="block text-brand">→ {after}</span>
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
      }
      build={(v, b) => ({
        changeId,
        reason: v.reason,
        refundExpected: null,
        ...(!cancel
          ? {
              agreement: proposalAgreement(v, b.agreement),
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
