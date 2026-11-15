import Link from "next/link";
import { ApiError } from "@/shared/http/api-error";
import { useAuthActions } from "../hooks/use-auth-actions";
import { authErrorMessage } from "../lib/auth-error-message";
import { authEntryPath } from "../lib/auth-entry-path";
import { AuthLayout } from "./auth-layout";
import { CredentialsForm } from "./credentials-form";

export function LoginScreen({
  mode,
  returnTo,
}: {
  mode: "login" | "signup";
  returnTo: string;
}) {
  const { login, signIn } = useAuthActions();
  const error =
    login.error instanceof ApiError && login.error.code === "VALIDATION_FAILED"
      ? null
      : login.error;
  if (mode === "signup") {
    return (
      <main className="app-page">
        <Link href={authEntryPath("/start", returnTo)}>
          시작 화면으로 돌아가기
        </Link>
        <h1>회원가입</h1>
        <CredentialsForm
          mode="signup"
          pending={login.isPending}
          formError={error ? authErrorMessage(error) : undefined}
          submit={(values, onError) => signIn("signup", values, onError)}
        />
        <Link href={authEntryPath("/auth", returnTo)}>이미 계정이 있어요</Link>
      </main>
    );
  }
  return (
    <AuthLayout title="로그인" backHref={authEntryPath("/start", returnTo)}>
      <CredentialsForm
        mode="login"
        appearance="auth"
        pending={login.isPending}
        formError={error ? authErrorMessage(error) : undefined}
        submit={(values, onError) => signIn("login", values, onError)}
      />
    </AuthLayout>
  );
}
