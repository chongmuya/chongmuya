"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { PasswordInput } from "@/shared/ui/password-input";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useAuth } from "./auth-provider";
import { usePrivateAuthAction } from "../hooks/use-private-auth-action";
import { kakaoConnectionOptions, startKakao } from "../api/kakao.api";
import { passwordSchema } from "../schemas/password.schema";
const schema = z.object({
  password: passwordSchema,
  consent: z.boolean().refine(Boolean, "카카오 로그인 연결에 동의해 주세요."),
});
export function KakaoConnection({ accountId }: { accountId: string }) {
  const { client } = useAuth();
  const connection = useQuery(
    kakaoConnectionOptions(client.request.bind(client), accountId),
  );
  const action = usePrivateAuthAction();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", consent: false },
  });
  return (
    <section aria-label="카카오 로그인 연결" className="form-panel">
      <h2>카카오 로그인 연결</h2>
      {connection.isPending ? (
        <p role="status">연결 상태 확인 중…</p>
      ) : connection.isError ? (
        <>
          <FormError message={safeErrorMessage(connection.error)} />
          <Button onClick={() => void connection.refetch()}>다시 확인</Button>
        </>
      ) : connection.data.linked ? (
        <p role="status">
          카카오가 연결되어 있어요. 같은 계정으로 로그인할 수 있습니다.
        </p>
      ) : !connection.data.canLink ? (
        <p>이 계정은 비밀번호 재인증으로 연결할 수 없습니다.</p>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit((input) =>
            action.run(async (signal) => {
              const url = await startKakao(
                client.request.bind(client),
                input,
                signal,
              );
              if (
                !signal.aborted &&
                client.getSnapshot().account?.id === accountId
              ) {
                form.reset();
                window.location.assign(url);
              }
            }),
          )}
        >
          <p>
            현재 비밀번호를 다시 확인한 뒤 카카오에서 인증해 주세요. 연결한
            카카오는 교체하거나 해제할 수 없습니다.
          </p>
          <FormField
            id="kakao-link-password"
            label="현재 비밀번호"
            error={form.formState.errors.password?.message}
            required
          >
            {(attributes) => (
              <PasswordInput
                {...attributes}
                {...form.register("password")}
                autoComplete="current-password"
                disabled={action.isPending}
              />
            )}
          </FormField>
          <label className="mt-4 flex gap-2">
            <input
              type="checkbox"
              {...form.register("consent")}
              disabled={action.isPending}
              aria-describedby="kakao-link-consent-error"
            />
            현재 계정에 카카오 로그인을 연결하는 데 동의합니다.
          </label>
          <div id="kakao-link-consent-error">
            <FormError message={form.formState.errors.consent?.message} />
          </div>
          <FormError
            message={action.error ? safeErrorMessage(action.error) : undefined}
          />
          <Button type="submit" variant="kakao" loading={action.isPending}>
            카카오 연결
          </Button>
          <Link href="/auth/recovery?next=%2Fmypage">
            비밀번호를 잊으셨나요?
          </Link>
        </form>
      )}
    </section>
  );
}
