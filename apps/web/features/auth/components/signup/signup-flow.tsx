"use client";

import Image from "next/image";
import { useEffect, useRef, type ComponentProps } from "react";
import { FormProvider } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { useSignupFlow } from "../../hooks/use-signup-flow";
import { StepLayout } from "@/shared/ui/step-layout";
import { SignupTerms, SignupTermsDetail } from "./signup-terms";
import { SignupInformation } from "./signup-information";

export function SignupFlow(
  props: Parameters<typeof useSignupFlow>[0] & {
    onComplete: () => void;
    loginHref?: string;
  },
) {
  const flow = useSignupFlow(props);
  const detail = props.terms.find((term) => term.id === flow.detail);
  const detailId = detail?.id ?? null;
  const showingTerms = !flow.complete && !detail && flow.step === "terms";
  const agree = () => {
    if (detail)
      flow.methods.setValue(detail.id, true, {
        shouldDirty: true,
        shouldValidate: true,
      });
    flow.setDetail(null);
  };
  const container = useRef<HTMLDivElement>(null);
  const previousDetail = useRef(detailId);
  useEffect(() => {
    const closedDetail = previousDetail.current;
    previousDetail.current = detailId;
    if (closedDetail && !detailId && flow.step === "terms") {
      const opener = container.current?.querySelector<HTMLElement>(
        `[data-signup-term="${closedDetail}"]`,
      );
      if (opener) {
        opener.focus();
        return;
      }
    }
    if (detailId || !flow.focus)
      container.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [flow.step, detailId, flow.complete, flow.focus]);
  return (
    <div ref={container}>
      <StepLayout
        title={
          flow.complete || detail || flow.step === "terms" ? "" : "회원가입"
        }
        className={
          detail
            ? "h-svh min-h-0"
            : showingTerms
              ? "pb-[max(44px,env(safe-area-inset-bottom))]"
              : undefined
        }
        backVisible={!showingTerms}
        onBack={flow.complete ? props.onComplete : flow.back}
        busy={flow.pending}
      >
        {flow.complete ? (
          <SignupComplete onContinue={props.onComplete} />
        ) : (
          <FormProvider {...flow.methods}>
            {detail ? (
              <SignupTermsDetail
                term={detail}
                onAgree={agree}
                onClose={flow.back}
              />
            ) : (
              <form
                noValidate
                aria-label="새 회원가입"
                onSubmit={flow.submit}
                className="flex flex-1 flex-col"
                aria-busy={flow.pending}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  {flow.termsNotice && (
                    <p role="status" className="mb-4 text-caption text-muted">
                      {flow.termsNotice}
                    </p>
                  )}
                  {flow.step === "terms" && (
                    <SignupTerms
                      onDetail={flow.openDetail}
                      terms={props.terms}
                    />
                  )}
                  {flow.step === "information" && (
                    <SignupInformation
                      phone={flow.phone}
                      email={flow.email}
                      kakao={!!props.kakao}
                      providerEmailVerified={flow.providerEmailVerified}
                      loginHref={props.loginHref}
                    />
                  )}
                  <div
                    className={
                      showingTerms ? "mt-auto pt-[54px]" : "mt-auto pt-12"
                    }
                  >
                    <FormError
                      className="mb-3"
                      message={
                        flow.methods.formState.errors.root?.server?.message
                      }
                    />
                    <Button
                      variant={showingTerms ? "brand-outline" : "solid"}
                      type="submit"
                      loading={flow.pending}
                      className={
                        showingTerms ? "w-full border-2 text-brand" : "w-full"
                      }
                    >
                      {flow.pending
                        ? "가입 처리 중…"
                        : flow.step === "information"
                          ? "가입하기"
                          : "다음"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </FormProvider>
        )}
      </StepLayout>
    </div>
  );
}

function SignupComplete({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-8 px-4 pt-[73px] text-center">
        <div
          className="relative size-[100px] overflow-hidden rounded-pill"
          style={celebrationBackground}
        >
          <div className="absolute top-5 left-[7px] flex h-[73.979px] w-[86.612px] items-center justify-center">
            <div className="relative h-[67.542px] w-[81.353px] -scale-y-100 rotate-[175.3deg]">
              <Image
                src="/images/auth/celebration.svg"
                alt=""
                width={83}
                height={69}
                className="absolute -top-[1.324px] left-0"
              />
            </div>
          </div>
        </div>
        <div>
          <h1
            tabIndex={-1}
            className="focus:outline-none text-2xl leading-tight font-bold"
          >
            총무야 가입을 축하드려요!
          </h1>
          <p className="mx-auto mt-2 max-w-[219px] text-control leading-5 break-keep text-muted">
            이제부터 총무야와 함께 모임과 행사를 편하게 준비해 봐요
          </p>
        </div>
      </div>
      <Button onClick={onContinue} className="mt-auto w-full" variant="outline">
        다음
      </Button>
    </>
  );
}

const celebrationBackground: ComponentProps<"div">["style"] = {
  backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%25' width='100%25' fill='url(%23grad)'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(-9.4527 -9.3816 22.359 -20.229 100 107.14)'><stop stop-color='rgba(255,221,153,1)' offset='0'/><stop stop-color='rgba(252,190,123,1)' offset='0.20911'/><stop stop-color='rgba(249,159,94,1)' offset='0.41822'/><stop stop-color='rgba(247,129,65,1)' offset='0.62733'/><stop stop-color='rgba(244,98,36,1)' offset='0.83644'/></radialGradient></defs></svg>")`,
};
