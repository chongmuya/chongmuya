import { readFile, stat } from "node:fs/promises";

export function operationId(value) {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      value ?? "",
    )
  )
    throw new Error("INVALID_ID");
  return value;
}

export function requireOperator(v) {
  if (
    !v.actor?.trim() ||
    !v.reason?.trim() ||
    v.actor.length > 100 ||
    v.reason.length > 500
  )
    throw new Error("INVALID_OPERATOR");
}

export async function privateInput(file) {
  if (!file) throw new Error("INPUT_REQUIRED");
  const info = await stat(file);
  if (!info.isFile() || info.size > 32768 || info.mode & 0o077)
    throw new Error("PRIVATE_INPUT_REQUIRED");
  return JSON.parse(await readFile(file, "utf8"));
}

const display = (value) => String(value ?? "-").replace(/\p{Cc}/gu, " ");
export function maskedPhone(value) {
  return /^\d{10,11}$/.test(value ?? "") ? `***-****-${value.slice(-4)}` : "-";
}

export function deliveryNextStep(row) {
  if (
    row.status === "UNKNOWN" ||
    (row.status === "PROCESSING" && row.leaseExpired)
  )
    return "reconcile로 결과 확인; 재발송 금지";
  if (row.status === "PROCESSING") return "처리 중; 완료 대기";
  if (!row.current) return "이전 기록 보존; 현재 기록 확인";
  if (row.status === "DELIVERED") return "전달 완료; 매장 답변은 별도 확인";
  if (row.status === "ACCEPTED")
    return row.provider === "fake"
      ? "가상 접수; 실제 문자 없음"
      : "전달 결과 대기 또는 reconcile";
  if (row.status === "CANCELLED") return "종료된 발송 기록";
  if (row.holdReasons?.length || row.status === "HELD")
    return "보류 사유 확인; 수신자 자동 교체 없음";
  if (row.status === "PENDING") return "확인 후 retry로 발송";
  if (row.status === "FAILED" && row.failureStage === "SUBMISSION")
    return "실패 원인 수정 후 retry";
  return "전달 실패 원인 확인; 무조건 재발송 금지";
}

// Explicit projection: private exports may contain contacts/snapshots, terminal output must not.
export function deliveryTable(rows) {
  return rows.map((row) => ({
    매장: display(row.restaurant_name),
    발송ID: display(row.id),
    상태: display(row.status),
    수신번호: maskedPhone(row.recipient_phone),
    기록: row.current ? "현재" : "이전",
    시도: row.attempts,
    "실패 단계/코드":
      [row.failureStage, row.errorCode]
        .filter(Boolean)
        .map(display)
        .join(" / ") || "-",
    "보류 사유": (row.holdReasons ?? []).map(display).join(", ") || "-",
    "다음 조치": deliveryNextStep(row),
  }));
}

export function printDeliveries(rows, detailed = false) {
  if (rows.length)
    console.table(
      deliveryTable(rows),
      detailed
        ? undefined
        : ["매장", "발송ID", "상태", "수신번호", "실패 단계/코드"],
    );
  else console.log("조건에 맞는 발송 기록이 없습니다.");
  console.log(
    `발송 기록 ${rows.length}건. 조회만 수행했으며 문자 발송·상태 변경은 없습니다.`,
  );
}

export function printOperation(action, result, v) {
  if (!v.execute) {
    console.log(
      `${action}: 변경 전 확인입니다. DB 변경·문자 발송은 실행하지 않았습니다. 적용하려면 같은 명령에 --execute를 추가하세요.`,
    );
  } else {
    const effects = {
      "owner-link": "매장 계정을 연결했습니다.",
      publish: v.unpublish
        ? "매장을 비공개로 변경했습니다."
        : "매장을 공개했습니다.",
      "record-contact": result.existing
        ? "이미 등록된 연락처를 확인했습니다."
        : "담당 연락처를 등록했습니다. 과거 문의 수신자는 바뀌지 않습니다.",
      "change-recipient": result.existing
        ? "기존 수신자 전환 기록을 반환했습니다. 발송 상태를 확인하세요."
        : "문의 수신자를 전환했습니다. 새 발송은 대기 상태이며 retry로 별도 실행합니다.",
      "record-reply": "확인한 매장 답변을 기록했습니다. 예약 확정은 아닙니다.",
      "normalize-address": "검증한 주소와 좌표를 반영했습니다.",
      retry: result.dispatchAttempted
        ? "공급자 발송을 시도했습니다. 최종 상태를 확인하세요."
        : "외부 발송을 시작하지 않았습니다. 상태와 보류 사유를 확인하세요.",
      "regenerate-link":
        "이전 링크를 폐기하고 새 링크·발송 기록을 저장했습니다.",
      reconcile: result.queryAttempted
        ? result.unresolved
          ? "공급자 조회로 접수 여부를 확정하지 못했습니다. 재발송하지 않았습니다."
          : result.matches
            ? "공급자 결과를 조회·반영했습니다. 문자를 재발송하지 않았습니다."
            : "새 공급자 결과가 없어 현재 상태를 유지했습니다. 재발송하지 않았습니다."
        : "현재 상태를 확인했습니다. 공급자 조회·재발송은 하지 않았습니다.",
    };
    console.log(`${action}: ${effects[action]}`);
    if (result.leaseChanged)
      console.log(
        "만료된 발송 처리권을 UNKNOWN으로 전환하고 운영 이력을 남겼습니다.",
      );
    if (action === "regenerate-link")
      console.log(
        `공급자 발송 시도: ${result.dispatchAttempted ? "시도" : "미시도"}`,
      );
  }
  for (const key of ["restaurantId", "contactId", "targetId", "deliveryId"])
    if (result[key]) console.log(`${key}: ${operationId(result[key])}`);
  if (result.delivery) console.table(deliveryTable([result.delivery]));
  else if (result.status) console.log(`상태: ${display(result.status)}`);
}

export function printOperationError(error) {
  if (error?.code === "EEXIST") {
    console.error(
      "출력 파일이 이미 있습니다. 새 파일 경로를 지정하세요. 작업은 실행하지 않았습니다.",
    );
    return;
  }
  const allowed = [
    "RESTAURANT_DUPLICATE",
    "RESTAURANT_VERSION_CONFLICT",
    "DELIVERY_RETRY_BLOCKED",
    "MERCHANT_REPLY_CONFLICT",
    "MERCHANT_LINK_INVALID",
    "ADDRESS_SELECTION_REQUIRED",
    "GEOCODING_UNAVAILABLE",
    "GEOCODING_CONFIGURATION",
  ];
  console.error(
    `작업을 완료하지 못했습니다. 입력 ID·실행자·사유·설정을 확인하세요.${allowed.includes(error?.code) ? ` (${error.code})` : ""}`,
  );
  if (error?.code === "DELIVERY_RETRY_BLOCKED")
    console.error(
      "deliveries로 현재 상태를 확인하세요. PROCESSING/UNKNOWN은 reconcile로 결과를 확인하기 전 재발송하거나 링크를 재발급할 수 없습니다.",
    );
}
