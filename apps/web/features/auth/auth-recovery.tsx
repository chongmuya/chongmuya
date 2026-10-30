import type { AuthState } from "./session";

// Distinct recovery actions: restoring must never undo a requested logout.
export function AuthRecovery({
  status,
  pending,
  onRestore,
  onLogout,
}: {
  status: AuthState["status"];
  pending: boolean;
  onRestore: () => void;
  onLogout: () => void;
}) {
  if (status === "logging-out") return <p role="status">로그아웃 처리 중…</p>;
  if (status === "logout-failed")
    return (
      <div>
        <p role="alert">
          로그아웃을 완료하지 못했습니다. 연결을 확인한 뒤 로그아웃을 다시
          시도해 주세요.
        </p>
        <button disabled={pending} onClick={onLogout}>
          로그아웃 다시 시도
        </button>
      </div>
    );
  if (status === "unavailable")
    return (
      <div>
        <p role="status">
          인증 서버에 연결하지 못했습니다. 연결을 다시 확인해 로그인 상태를
          복원해 주세요.
        </p>
        <button disabled={pending} onClick={onRestore}>
          연결 재확인
        </button>
      </div>
    );
  return null;
}
