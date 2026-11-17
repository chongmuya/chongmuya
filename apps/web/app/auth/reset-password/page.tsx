import { RecoveryScreen } from "@/features/auth/client";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "새 비밀번호 설정",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <RecoveryScreen reset />;
}
