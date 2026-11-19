import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/shared/ui/checkbox";
import { IconButton } from "@/shared/ui/icon-button";
import { FormError } from "@/shared/ui/form-error";
import { Button } from "@/shared/ui/button";
import type { SignupValues } from "../../schemas/signup.schema";

import type { SignupTerm, SignupTermId } from "../../types/signup.types";

export function SignupTerms({
  onDetail,
  terms,
}: {
  onDetail: (term: SignupTermId) => void;
  terms: SignupTerm[];
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<SignupValues>();
  const values = useWatch({ control });
  const all = terms.every((term) => values[term.id]);
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
          {terms.map((term) => (
            <div key={term.id}>
              <div className="flex min-h-11 items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-label text-muted">
                  <Checkbox
                    {...register(term.id)}
                    aria-invalid={!!errors[term.id]}
                    aria-describedby={
                      errors[term.id] ? `${term.id}-error` : undefined
                    }
                  />
                  <span className="text-[clamp(16px,4.8vw,20px)] leading-6">
                    {term.title}
                    <span className={term.required ? "text-brand-action" : ""}>
                      ({term.required ? "필수" : "선택"})
                    </span>
                  </span>
                </label>
                <IconButton
                  aria-label={`${term.title} 상세 보기`}
                  onClick={() => onDetail(term.id)}
                  className="w-8"
                >
                  <Image
                    src="/images/ui/back.svg"
                    alt=""
                    width={10}
                    height={18}
                    style={{ width: "10.4142px", height: "auto" }}
                    className="rotate-180 opacity-60"
                  />
                </IconButton>
              </div>
              <FormError
                id={`${term.id}-error`}
                message={errors[term.id]?.message}
              />
            </div>
          ))}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-label text-muted">
            <Checkbox
              checked={all}
              onChange={(event) =>
                terms.forEach((term) =>
                  setValue(term.id, event.target.checked, {
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

export function SignupTermsDetail({
  term,
  onAgree,
  onClose,
}: {
  term: SignupTerm;
  onAgree: () => void;
  onClose: () => void;
}) {
  return (
    <article className="flex flex-1 flex-col px-[17px]">
      <h1 tabIndex={-1} className="focus:outline-none text-2xl font-bold">
        {term.title}
      </h1>
      <p className="mt-3 text-caption text-muted">
        {term.draft ? "수정 예정 초안 · " : ""}버전 {term.version}
      </p>
      {term.url ? (
        <a
          href={term.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 block text-link underline"
        >
          약관 원문 확인하기 (새 창)
        </a>
      ) : (
        <div className="mt-8 space-y-4">
          {term.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      )}
      <div className="mt-auto space-y-2 pt-8">
        <Button className="w-full" variant="brand-outline" onClick={onAgree}>
          동의하고 닫기
        </Button>
        <Button className="w-full" variant="outline" onClick={onClose}>
          동의하지 않고 돌아가기
        </Button>
      </div>
    </article>
  );
}
