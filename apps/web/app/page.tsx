import Link from "next/link";
import { HealthStatus } from "@/features/health/client";

export default function HomePage() {
  return (
    <main className="app-page">
      <h1>총무야</h1>
      <p>
        <Link href="/start">로그인 · 회원가입</Link>
      </p>
      <p>
        <Link href="/events">내 행사 관리</Link>
      </p>
      <HealthStatus />
    </main>
  );
}
