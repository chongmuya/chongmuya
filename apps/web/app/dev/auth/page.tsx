import { notFound } from "next/navigation";
import { AuthPreviewScreen } from "@/features/auth/client";

export default async function AuthPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AuthPreviewScreen />;
}
