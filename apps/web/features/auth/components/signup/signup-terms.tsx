import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/shared/ui/checkbox";
import { IconButton } from "@/shared/ui/icon-button";
import { FormError } from "@/shared/ui/form-error";
import type { SignupValues } from "../../schemas/signup.schema";

export const signupTerms = [
  { field: "serviceTerms", title: "이용약관 동의", required: true },
  {
    field: "privacyCollection",
    title: "개인정보 수집 및 이용동의",
    required: true,
  },
  { field: "privacyPolicy", title: "개인정보 처리방침", required: true },
  { field: "marketing", title: "마케팅 정보 수신", required: false },
] as const;
export type SignupTerm = (typeof signupTerms)[number]["field"];

export function SignupTerms({
  onDetail,
}: {
  onDetail: (term: SignupTerm) => void;
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<SignupValues>();
  const values = useWatch({ control });
  const all = signupTerms.every((term) => values[term.field]);
  return (
    <div className="flex flex-1 flex-col">
      <div className="px-3.5 pt-[clamp(24px,9.2svh,87px)]">
        <Image
          src="/images/auth/brand-wordmark-orange.svg"
          alt="총무야"
          width={131.2}
          height={47.2}
          priority
        />
        <h1
          tabIndex={-1}
          className="focus:outline-none mt-3 max-w-48 text-label leading-6"
        >
          모두에게 다음 회식이
          <br />
          기다려지도록
        </h1>
      </div>
      <fieldset className="mt-auto pt-16">
        <legend className="sr-only">약관 동의</legend>
        <div className="space-y-1">
          {signupTerms.map((term) => (
            <div key={term.field}>
              <div className="flex min-h-11 items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-label text-muted">
                  <Checkbox
                    {...register(term.field)}
                    aria-invalid={!!errors[term.field]}
                    aria-describedby={
                      errors[term.field] ? `${term.field}-error` : undefined
                    }
                  />
                  <span className="text-[clamp(16px,4.8vw,20px)] leading-6">
                    {term.title}
                    <span className={term.required ? "text-brand" : ""}>
                      ({term.required ? "필수" : "선택"})
                    </span>
                  </span>
                </label>
                <IconButton
                  aria-label={`${term.title} 상세 보기`}
                  onClick={() => onDetail(term.field)}
                  className="w-8"
                >
                  <Image
                    src="/images/auth/back.svg"
                    alt=""
                    width={10}
                    height={18}
                    style={{ width: "10.4142px", height: "auto" }}
                    className="rotate-180 opacity-60"
                  />
                </IconButton>
              </div>
              <FormError
                id={`${term.field}-error`}
                message={errors[term.field]?.message}
              />
            </div>
          ))}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-label text-muted">
            <Checkbox
              checked={all}
              onChange={(event) =>
                signupTerms.forEach((term) =>
                  setValue(term.field, event.target.checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  }),
                )
              }
            />
            전체 동의
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export function SignupTermsDetail({ term }: { term: SignupTerm }) {
  return (
    <article className="px-[17px]">
      <h1 tabIndex={-1} className="focus:outline-none text-2xl font-bold">
        {signupTerms.find((item) => item.field === term)?.title}
      </h1>
      <p className="mt-8 rounded-panel border border-border bg-surface p-4 text-muted">
        약관 본문 미확정 · 개발 미리보기
      </p>
      <p className="mt-4">
        총무야의 확인된 약관 원문이 아직 연결되지 않았어요. 이 화면의 동의는
        실제 약관 동의로 저장되지 않아요.
      </p>
      <p className="mt-4 text-caption text-muted">
        상세 보기와 동의는 별개예요. 돌아가도 입력과 선택 상태는 유지돼요.
      </p>
    </article>
  );
}
