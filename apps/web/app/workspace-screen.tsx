"use client";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { AuthScreen } from "@/features/auth/auth-screen";
import { Workspace } from "@/features/groups/workspace";
export function WorkspaceScreen({
  mode,
}: {
  mode: "events" | "mypage" | "onboarding";
}) {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  if (status !== "authenticated" || !account)
    return (
      <main>
        <AuthScreen />
      </main>
    );
  return (
    <main>
      <Workspace
        key={`${account.id}:${mode}:${params.toString()}`}
        accountId={account.id}
        request={client.request.bind(client)}
        groupId={params.get("group")}
        eventId={params.get("event")}
        mode={mode}
      />
      {mode === "mypage" && <AuthScreen />}
    </main>
  );
}
