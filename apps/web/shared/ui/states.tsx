import type { ReactNode } from "react";
import { Button } from "./button";

export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <p role="status" aria-live="polite">
      {children}
    </p>
  );
}
export function ErrorState({
  retry,
  children = "정보를 불러오지 못했습니다. 연결과 접근 권한을 확인해 주세요.",
}: {
  retry: () => void;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="space-y-2 py-3">
      <p>{children}</p>
      <Button onClick={retry}>다시 시도</Button>
    </div>
  );
}
