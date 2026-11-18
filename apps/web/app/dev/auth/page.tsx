import { notFound } from "next/navigation";
import { AuthPreviewScreen } from "@/features/auth/client";
import { HealthStatus } from "@/features/health/client";

export default async function AuthPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <div className="p-3 text-caption">
        <HealthStatus />
      </div>
      <AuthPreviewScreen />
    </>
  );
}
