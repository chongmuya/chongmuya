import Link from "next/link";
import { HealthStatus } from "@/features/health/health-status";

export default function HomePage() {
  return (
    <main>
      <h1>총무야</h1>
      <p>
        <Link href="/auth">로그인 · 회원가입</Link>
      </p>
      <HealthStatus />
    </main>
  );
}
