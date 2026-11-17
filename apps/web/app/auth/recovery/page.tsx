import { RecoveryScreen } from "@/features/auth/client";
export const metadata = {
  title: "비밀번호 재설정",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <RecoveryScreen />;
}
