import { isDeepStrictEqual } from "node:util";
import type {
  DepositGuidance,
  ReservationPreparation,
} from "../types/reservation-completion.js";
import { smsDate } from "./reservation-sms.js";

export function sameGuidance(before: DepositGuidance, after: DepositGuidance) {
  if (before.kind === "NONE" && after.kind === "NONE")
    return before.policy === after.policy;
  return isDeepStrictEqual(guidanceTerms(before), guidanceTerms(after));
}

function guidanceTerms(g: DepositGuidance) {
  return [
    g.kind,
    g.amount,
    g.deadline ? Date.parse(g.deadline) : null,
    g.channel,
    g.bank,
    g.account,
    g.holder,
    g.policy,
  ];
}

function smsAccount(g: DepositGuidance) {
  if (g.kind !== "REQUIRED" || g.channel !== "SMS" || !g.deadline) return "";
  return `\n${g.amount?.toLocaleString("ko-KR")}원 (기한 ${smsDate(g.deadline, true)})\n${g.bank} ${g.account} 예금주 ${g.holder}`;
}

function latestTransfer(state: ReservationPreparation) {
  return state.guidance.kind === "REQUIRED" &&
    state.transfer?.guidanceRevision === state.guidance.revision
    ? state.transfer
    : null;
}

type Sms = { kind: string; text: string };
export function completionSmsPolicy({
  action,
  before,
  after,
  changeKind,
  proposedGuidance,
  operator,
  confirmed,
}: {
  action: string;
  before: ReservationPreparation;
  after: ReservationPreparation;
  changeKind?: "CHANGE" | "CANCEL" | "REFUND";
  proposedGuidance?: DepositGuidance;
  operator: boolean;
  confirmed: boolean;
}): { organizer?: Sms; merchant?: Sms } {
  let organizer: Sms | undefined;
  let merchant: Sms | undefined;
  const send = (text: string): Sms => ({ kind: action, text });

  switch (action) {
    case "GUIDANCE":
      if (
        after.guidance.kind !== "UNKNOWN" &&
        !sameGuidance(before.guidance, after.guidance) &&
        (after.guidance.kind !== "NONE" || before.guidance.kind !== "NONE")
      )
        organizer = send(
          after.guidance.kind === "NONE"
            ? "예약금 없음. 메뉴를 확인해 주세요."
            : `예약금 안내 확인${smsAccount(after.guidance)}`,
        );
      break;
    case "MENU_SUBMITTED":
    case "TRANSFER_REPORTED": {
      const transfer = latestTransfer(after);
      const menu = action === "MENU_SUBMITTED";
      if (after.order && transfer && (menu || !latestTransfer(before))) {
        merchant = send(
          "메뉴와 송금 신고가 도착했어요. 실입금을 확인해 주세요.",
        );
      } else if (menu && after.guidance.kind === "NONE") {
        merchant = send("메뉴가 도착했어요. 주문 내용을 확인해 주세요.");
      } else if (
        menu &&
        after.agreement.menuDeadlineAt &&
        after.guidance.deadline &&
        Date.parse(after.agreement.menuDeadlineAt) <
          Date.parse(after.guidance.deadline)
      ) {
        merchant = send("메뉴 마감이 먼저예요. 제출된 메뉴를 확인해 주세요.");
      }
      break;
    }
    case "RECEIPT_RECORDED":
      if (
        !after.cancellation &&
        !confirmed &&
        before.guidance.kind === "REQUIRED" &&
        after.receipt &&
        after.receipt.amount - after.refunded < (after.guidance.amount ?? 0) &&
        before.receipt?.amount !== after.receipt.amount
      ) {
        const remaining =
          (after.guidance.amount ?? 0) -
          (after.receipt.amount - after.refunded);
        organizer = {
          kind: "PAYMENT_ACTION_REQUIRED",
          text: `예약금 ${remaining.toLocaleString("ko-KR")}원 부족. 매장에 입금 내역을 확인해 주세요.`,
        };
      }
      break;
    case "CHANGE_REQUESTED":
      if (changeKind === "CHANGE" || changeKind === "CANCEL")
        merchant = send(
          `예약 ${changeKind === "CANCEL" ? "취소" : "변경"} 요청. 처리안을 등록해 주세요.`,
        );
      break;
    case "CHANGE_PROPOSED":
      if (changeKind === "CHANGE" || changeKind === "CANCEL")
        organizer = send(
          `예약 ${changeKind === "CANCEL" ? "취소" : "변경"} 처리안 확인${changeKind === "CHANGE" && proposedGuidance && !sameGuidance(before.guidance, proposedGuidance) ? smsAccount(proposedGuidance) : ""}`,
        );
      break;
    case "CHANGE_REJECTED":
      if (changeKind === "CHANGE" || changeKind === "CANCEL")
        organizer = send(
          `예약 ${changeKind === "CANCEL" ? "취소" : "변경"} 요청 처리 불가. 결과를 확인해 주세요.`,
        );
      break;
    case "CHANGE_APPLIED":
      if (changeKind === "CHANGE" || changeKind === "CANCEL") {
        const text =
          changeKind === "CANCEL"
            ? "예약 취소 완료. 환불은 전화로 협의해 주세요."
            : "예약 변경 적용. 변경된 예약 조건을 확인해 주세요.";
        merchant = send(text);
        if (operator) organizer = send(text);
      }
      break;
  }

  if (
    confirmed &&
    (!before.confirmation ||
      before.agreementRevision !== after.agreementRevision)
  ) {
    organizer = {
      kind: "CONFIRMED",
      text:
        action === "CHANGE_APPLIED" ? "예약 변경 적용 및 확정" : "예약 확정",
    };
    if (merchant)
      merchant.text =
        action === "CHANGE_APPLIED"
          ? "예약 변경 적용 및 확정. 변경된 예약 조건을 확인해 주세요."
          : "예약 확정 및 메뉴 접수. 주문 내용을 확인해 주세요.";
    else if (operator)
      merchant = {
        kind: "CONFIRMED",
        text: "예약 확정. 확정 조건을 확인해 주세요.",
      };
  }
  return { organizer, merchant };
}
