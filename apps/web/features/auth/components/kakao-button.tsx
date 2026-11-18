"use client";
import Image from "next/image";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useAuth } from "./auth-provider";
import { usePrivateAuthAction } from "../hooks/use-private-auth-action";
import { startKakao } from "../api/kakao.api";
export function KakaoButton({
  returnTo,
  disabled = false,
}: {
  returnTo: string;
  disabled?: boolean;
}) {
  const { client } = useAuth();
  const action = usePrivateAuthAction();
  return (
    <>
      <Button
        type="button"
        variant="kakao"
        className="mt-2 w-full py-[5px]"
        disabled={disabled}
        loading={action.isPending}
        onClick={() =>
          action.run(async (signal) => {
            const url = await startKakao(
              client.request.bind(client),
              { next: returnTo },
              signal,
            );
            if (!signal.aborted) window.location.assign(url);
          })
        }
      >
        <Image
          src="/images/auth/kakao.png"
          alt=""
          width={33}
          height={33}
          unoptimized
          className="rounded-full"
        />
        카카오 계정으로 계속하기
      </Button>
      <FormError
        message={action.error ? safeErrorMessage(action.error) : undefined}
      />
    </>
  );
}
