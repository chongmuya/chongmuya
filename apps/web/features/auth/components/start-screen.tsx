import Link from "next/link";
import { buttonStyles } from "@/shared/ui/button";
import { authEntryPath } from "../lib/auth-entry-path";
import { AuthLayout } from "./auth-layout";

export function StartScreen({ returnTo }: { returnTo: string }) {
  return (
    <AuthLayout title="총무야 시작하기" start>
      <div className="mt-auto pt-16">
        <div className="flex flex-col gap-2">
          <Link
            href={authEntryPath("/auth", returnTo, "signup")}
            className={buttonStyles({ variant: "ink" })}
          >
            처음 가입해요
          </Link>
          <Link
            href={authEntryPath("/auth", returnTo)}
            className={buttonStyles({ variant: "outline" })}
          >
            이미 계정이 있어요
          </Link>
        </div>
        <Link
          href="/"
          className="mx-auto mt-8 block w-fit text-center text-caption text-black underline underline-offset-2"
        >
          회원가입 없이 사용해볼래요
        </Link>
      </div>
    </AuthLayout>
  );
}
