import Link from "next/link";
import { ApiError } from "@/shared/http/api-error";
import { privacyPolicyHref } from "@/shared/legal/documents";
import { useAuthActions } from "../hooks/use-auth-actions";
import { authErrorMessage } from "../lib/auth-error-message";
import { authEntryPath } from "../lib/auth-entry-path";
import { AuthLayout } from "./auth-layout";
import { CredentialsForm } from "./credentials-form";

export function LoginScreen({ returnTo }: { returnTo: string }) {
  const { login, signIn } = useAuthActions();
  const error =
    login.error instanceof ApiError && login.error.code === "VALIDATION_FAILED"
      ? null
      : login.error;
  return (
    <AuthLayout title="로그인" backHref={authEntryPath("/start", returnTo)}>
      <CredentialsForm
        returnTo={returnTo}
        pending={login.isPending}
        formError={error ? authErrorMessage(error) : undefined}
        submit={(values, onError) => signIn(values, onError)}
      />
      <footer className="mt-6 text-center">
        <Link
          href={privacyPolicyHref}
          className="inline-flex min-h-control items-center px-2 text-caption font-semibold text-black underline underline-offset-4"
        >
          개인정보 처리방침
        </Link>
      </footer>
    </AuthLayout>
  );
}
