"use client";
import { useState, type ReactNode } from "react";
import { ChangedConditions, ProposalComparison } from "./proposal-comparison";
import { Button } from "@/shared/ui/button";
import { fromKoreanDateInput } from "@/shared/lib/korean-date";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm } from "./command-form";
import { isoDate, localDate } from "../lib/command-values";
import type { Field } from "../types/command-field";
import { won } from "./completion-summary";
import { guidanceFields, buildGuidance } from "../lib/guidance-fields";
import { proposalAgreement } from "../lib/proposal-agreement";
import { changeOutcome, changeSubjectLabels } from "../lib/change-labels";
import { spaceLabels, seatingLabels } from "../lib/agreement-labels";
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
  const [reply, setReply] = useState<{
    id: string;
    action: "propose" | "reject";
  }>();
  const [decliningId, setDecliningId] = useState<string>();
  const replyAction =
    reply && reply.id === editable?.id ? reply.action : undefined;
  const deciding = organizer && pending?.status === "PROPOSED";
  const declining = deciding && decliningId === pending.id;
  const cancel = pending?.kind === "CANCEL";
  const title = declining
    ? "제안을 거절할까요?"
    : deciding
      ? cancel
        ? "예약 취소를 수락할까요?"
        : "예약 변경을 수락할까요?"
      : pending?.status === "PROPOSED"
        ? cancel
          ? "보낸 취소안"
          : "보낸 변경안"
        : pending
          ? cancel
            ? "예약 취소 문의"
            : "예약 변경 문의"
          : "예약 변경·취소";
  return (
    <section className="space-y-7">
      {(!pending?.proposal || declining) && (
        <h3 className="text-center text-2xl leading-[1.5] font-bold text-brand-ink">
          {title}
        </h3>
      )}
      {pending && !declining && (
        <div
          className={
            pending.proposal
              ? undefined
              : "space-y-2 rounded-control bg-soft p-4 text-sm"
          }
        >
          {!pending.proposal && (
            <>
              <p className="font-semibold">
                {cancel
                  ? "취소 요청 내용"
                  : (changeSubjectLabels[pending.subject] ?? "기타")}
              </p>
              <p className="whitespace-pre-wrap">{pending.reason}</p>
              <p className="break-keep text-muted">
                총무가 처리안을 수락할 때까지 기존 예약이 유지돼요.
              </p>
            </>
          )}
          {pending.proposal && (
            <ProposalComparison
              data={q}
              proposal={pending.proposal}
              kind={pending.kind}
              onDetails={onDetails}
              title={title}
              organizer={organizer}
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
      {deciding &&
        (declining ? (
          <CommandForm
            key={`decline-${pending.id}`}
            {...props}
            action="change-decline"
            onDone={onClose}
            title="거절하고 기존 예약 유지"
            hideTitle
            description="사장님에게 거절 결과가 표시돼요. 예약 조건은 유지돼요."
            onCancel={() => setDecliningId(undefined)}
            fields={[]}
            build={() => ({ changeId: pending.id })}
          />
        ) : (
          <div className="space-y-3">
            {!(
              pending.kind === "CHANGE" &&
              pending.proposal?.refundExpected !== null
            ) && (
              <CommandForm
                key={`accept-${pending.id}`}
                {...props}
                action="change-accept"
                onDone={onClose}
                title={cancel ? "수락하고 예약 취소" : "수락하고 예약 변경"}
                hideTitle
                fields={[]}
                build={() => ({ changeId: pending.id, confirmed: true })}
              />
            )}
            <Button
              variant="brand-outline"
              className="w-full"
              onClick={() => setDecliningId(pending.id)}
            >
              제안 거절
            </Button>
          </div>
        ))}
      {editable && !organizer && (
        <>
          {!replyAction && pending?.status === "REQUESTED" && (
            <div className="space-y-3">
              <Button
                className="w-full"
                onClick={() => setReply({ id: pending.id, action: "propose" })}
              >
                {cancel ? "취소 가능 답변" : "변경안 작성"}
              </Button>
              <Button
                variant="brand-outline"
                className="w-full"
                onClick={() => setReply({ id: pending.id, action: "reject" })}
              >
                {cancel ? "취소 불가 답변" : "변경 불가 답변"}
              </Button>
            </div>
          )}
          {!replyAction && pending?.status === "PROPOSED" && (
            <Button
              variant="brand-outline"
              className="w-full"
              onClick={() => setReply({ id: pending.id, action: "reject" })}
            >
              보낸 제안 철회
            </Button>
          )}
          {replyAction === "propose" && (
            <ProposalForm
              key={editable.id}
              {...props}
              changeId={editable.id}
              cancel={editable.kind === "CANCEL"}
              subject={editable.subject}
              onDone={onClose}
              available={
                pending?.id === editable.id && pending.status === "REQUESTED"
              }
            />
          )}
          {replyAction === "reject" && (
            <CommandForm
              key={`reject-${editable.id}`}
              {...props}
              available={pending?.id === editable.id}
              action="change-reject"
              onDone={onClose}
              title={
                editable.status === "PROPOSED"
                  ? "제안 철회하기"
                  : `${editable.kind === "CANCEL" ? "취소" : "변경"} 불가 답변 보내기`
              }
              hideTitle
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
          )}
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
      {onClose && !declining && (
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
                    APPLIED: changeOutcome(c, organizer),
                    REJECTED: changeOutcome(c, organizer),
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
function proposalMenu(q: Completion) {
  const catalog = q.catalog.menus;
  const unavailable = (q.order?.lines ?? [])
    .filter((line) => !catalog.some((menu) => menu.id === line.id))
    .map((line) => ({ ...line, available: false }));
  return [...catalog, ...unavailable];
}

function ProposalForm({
  data: q,
  access,
  changeId,
  cancel,
  subject,
  available,
  onDone,
}: {
  data: Completion;
  access: CompletionAccess;
  changeId: string;
  cancel: boolean;
  subject: string;
  available: boolean;
  onDone?: () => void;
}) {
  const primary =
    subject === "SCHEDULE"
      ? "startsAt"
      : subject === "GUESTS"
        ? "expectedGuests"
        : undefined;
  const menuPrimary = subject === "MENU";
  const related = (values: Partial<Record<string, string>>) =>
    values.related === "yes";
  const editMenu = (values: Partial<Record<string, string>>) =>
    menuPrimary || (related(values) && values.replaceMenu === "yes");
  const editGuidance = (values: Partial<Record<string, string>>) =>
    related(values) && values.replaceGuidance === "yes";
  const agreementEdits = (values: Record<string, string>, base: Completion) =>
    proposalAgreement(
      values,
      base.agreement,
      (field) => field === primary || related(values),
    );
  const menuEdits = (values: Record<string, string>, base: Completion) => {
    if (!editMenu(values)) return undefined;
    const items = proposalMenu(base).map((m) => ({
      id: m.id,
      quantity: Number(values[`menu_${m.id}`] || 0),
    }));
    const original = new Map(
      base.order?.lines.map((line) => [line.id, line.quantity]),
    );
    if (items.every(({ id, quantity }) => quantity === (original.get(id) ?? 0)))
      return undefined;
    return { catalogVersion: base.catalog.version, items };
  };
  const fields = (q: Completion): Field[] => {
    const termFields: Field[] = [
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
    ];
    const menuFields: Field[] = proposalMenu(q).map((m) => ({
      name: `menu_${m.id}`,
      label: `${m.name} · ${won(m.price)}${!m.available ? " · 품절" : ""} 수량`,
      type: "number",
      when: editMenu,
      value: String(q.order?.lines.find((l) => l.id === m.id)?.quantity ?? 0),
      optional: true,
    }));
    return [
      ...(!cancel
        ? [
            ...termFields.filter((field) => field.name === primary),
            ...(menuPrimary ? menuFields : []),
            {
              name: "related",
              label: "관련 조건 추가",
              type: "checkbox" as const,
              optional: true,
            },
            ...termFields
              .filter((field) => field.name !== primary)
              .map((field) => ({
                ...field,
                when: (values: Partial<Record<string, string>>) =>
                  related(values) && field.when?.(values) !== false,
              })),
            ...(!menuPrimary
              ? [
                  {
                    name: "replaceMenu",
                    label: "주문 메뉴도 변경하기",
                    type: "checkbox" as const,
                    optional: true,
                    when: related,
                  },
                  ...menuFields,
                ]
              : []),
            {
              name: "replaceGuidance",
              label: "예약금 안내도 변경하기",
              type: "checkbox" as const,
              optional: true,
              when: related,
            },
            ...guidanceFields(q).map((field) => ({
              ...field,
              when: (values: Partial<Record<string, string>>) =>
                editGuidance(values) && field.when?.(values) !== false,
            })),
          ]
        : []),
      {
        name: "reason",
        label: cancel ? "취소 가능 답변" : "총무에게 전할 내용",
        type: "textarea",
        max: 500,
      },
    ];
  };
  return (
    <CommandForm
      data={q}
      access={access}
      available={available}
      action="change-propose"
      onDone={onDone}
      title={cancel ? "취소안 보내기" : "변경안 보내기"}
      hideTitle
      description={cancel ? "총무가 수락하면 예약이 취소돼요." : undefined}
      fields={fields}
      validate={
        cancel
          ? undefined
          : (values, base) => {
              const errors = [];
              if (
                primary &&
                agreementEdits(values, base)[primary] === undefined
              )
                errors.push({
                  field: primary,
                  message:
                    primary === "startsAt"
                      ? "기존 예약과 다른 날짜 또는 시간을 입력해 주세요."
                      : "기존 예약과 다른 인원을 입력해 주세요.",
                });
              if (menuPrimary && !menuEdits(values, base))
                errors.push({
                  field: "root",
                  message: "기존 주문의 메뉴나 수량을 바꿔 주세요.",
                });
              if (
                related(values) &&
                values.usageKind === "MINUTES" &&
                (!values.usageMinutes ||
                  Number(values.usageMinutes) < 1 ||
                  Number(values.usageMinutes) > 1440)
              )
                errors.push({
                  field: "usageMinutes",
                  message: "이용시간을 1~1440분으로 입력해 주세요.",
                });
              return errors;
            }
      }
      preview={
        cancel
          ? undefined
          : (values, base) => {
              const menu = menuEdits(values, base);
              const lines = menu?.items.flatMap(({ id, quantity }) => {
                const item = proposalMenu(base).find(
                  (entry) => entry.id === id,
                );
                return quantity > 0 && item?.price != null
                  ? [
                      {
                        id,
                        name: item.name,
                        quantity,
                        unit: item.unit,
                        price: item.price,
                        subtotal: item.price * quantity,
                      },
                    ]
                  : [];
              });
              const order = lines
                ? {
                    revision: (base.order?.revision ?? 0) + 1,
                    catalogVersion: base.catalog.version,
                    lines,
                    total: lines.reduce((sum, line) => sum + line.subtotal, 0),
                    submittedAt: base.order?.submittedAt ?? "",
                    currency: "KRW" as const,
                  }
                : base.order;
              const editingGuidance =
                editGuidance(values) &&
                (values.kind === "NONE" ||
                  (values.deadline && fromKoreanDateInput(values.deadline)));
              const guidance = editingGuidance
                ? {
                    ...base.guidance,
                    ...buildGuidance(values),
                    kind:
                      values.kind === "NONE"
                        ? ("NONE" as const)
                        : ("REQUIRED" as const),
                    channel:
                      values.channel === "WEB"
                        ? ("WEB" as const)
                        : ("SMS" as const),
                  }
                : base.guidance;
              return (
                <ChangedConditions
                  data={base}
                  proposal={{
                    agreement: {
                      ...base.agreement,
                      ...agreementEdits(values, base),
                    },
                    order,
                    guidance,
                  }}
                />
              );
            }
      }
      build={(values, base) => {
        const agreement = cancel ? {} : agreementEdits(values, base);
        const menu = cancel ? undefined : menuEdits(values, base);
        return {
          changeId,
          reason: values.reason,
          refundExpected: null,
          ...(Object.keys(agreement).length > 0 && { agreement }),
          ...(menu && { menu }),
          ...(!cancel &&
            editGuidance(values) && { guidance: buildGuidance(values) }),
        };
      }}
    />
  );
}
