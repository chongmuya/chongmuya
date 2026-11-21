import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";
import { cn } from "@/shared/lib/cn";
import {
  LegalDocumentContent,
  legalDocumentProse,
} from "@/shared/legal/documents-2026-11-21";
import { legalDocumentsVersion } from "@/shared/legal/links";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormError } from "@/shared/ui/form-error";
import { Button } from "@/shared/ui/button";
import type { SignupValues } from "../../schemas/signup.schema";
import type { SignupTerm, SignupTermId } from "../../types/signup.types";

export function SignupTerms({
  onDetail,
  terms,
  privacyPolicy,
}: {
  onDetail: (term: SignupTermId) => void;
  terms: SignupTerm[];
  privacyPolicy?: SignupTerm;
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<SignupValues>();
  const values = useWatch({ control });
  const requiredTerms = terms.filter((term) => term.required);
  const allRequired = requiredTerms.every((term) => values[term.id]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-3.5 pt-[clamp(24px,9.2svh,87px)]">
        <Image
          src="/images/auth/brand-wordmark-orange.svg"
          alt="총무야"
          width={131}
          height={47}
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
      <fieldset className="mt-auto pt-10">
        <legend className="sr-only">약관 동의</legend>
        <div className="divide-y divide-border rounded-control border border-border bg-surface">
          {terms.map((term) => (
            <div key={term.id}>
              <div className="flex items-stretch pr-2">
                <label className="flex min-w-11 cursor-pointer items-center justify-center">
                  <Checkbox
                    {...register(term.id)}
                    aria-label={`${term.title} (${term.required ? "필수" : "선택"})`}
                    aria-invalid={!!errors[term.id]}
                    aria-describedby={
                      errors[term.id] ? `${term.id}-error` : undefined
                    }
                  />
                </label>
                <TermsDetailButton term={term} onOpen={onDetail} />
              </div>
              <FormError
                id={`${term.id}-error`}
                className="px-3"
                message={errors[term.id]?.message}
              />
            </div>
          ))}
          {privacyPolicy && (
            <div className="flex items-stretch pl-3 pr-2">
              <TermsDetailButton
                term={privacyPolicy}
                readOnly
                onOpen={onDetail}
              />
            </div>
          )}
        </div>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-label text-muted">
          <Checkbox
            checked={allRequired}
            onChange={(event) =>
              requiredTerms.forEach((term) =>
                setValue(term.id, event.target.checked, {
                  shouldDirty: true,
                  shouldValidate: true,
                }),
              )
            }
          />
          필수 항목 모두 동의
        </label>
      </fieldset>
    </div>
  );
}

function TermsDetailButton({
  term,
  readOnly = false,
  onOpen,
}: {
  term: SignupTerm;
  readOnly?: boolean;
  onOpen: (id: SignupTermId) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${term.title} 상세 보기`}
      data-signup-term={term.id}
      className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control py-2 pr-2 text-left text-sm font-semibold text-brand-ink hover:bg-background"
      onClick={() => onOpen(term.id)}
    >
      <span className="min-w-0 flex-1 break-keep">{term.title}</span>
      <span className="shrink-0 text-xs font-medium text-muted">
        {readOnly ? "열람" : term.required ? "필수" : "선택"}
      </span>
      <Image
        src="/images/ui/back.svg"
        alt=""
        width={10}
        height={18}
        className="h-3.5 w-2 shrink-0 rotate-180 opacity-60"
      />
    </button>
  );
}

export function SignupTermsDetail({
  term,
  onAgree,
  onClose,
}: {
  term: SignupTerm;
  onAgree?: () => void;
  onClose: () => void;
}) {
  const published = term.version === legalDocumentsVersion;
  const available = published || term.body.length > 0;
  return (
    <article className="flex min-h-0 flex-1 flex-col gap-4 px-1">
      <h1
        tabIndex={-1}
        className="focus:outline-none text-lg leading-tight font-bold text-brand-ink"
      >
        {term.title}
      </h1>
      <div
        role="region"
        aria-label={`${term.title} 본문`}
        tabIndex={0}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-control border border-border bg-surface p-4",
          legalDocumentProse,
        )}
      >
        {published ? (
          <LegalDocumentContent id={term.id} />
        ) : available ? (
          term.body.map((paragraph, index) => (
            <p key={`${index}:${paragraph}`}>{paragraph}</p>
          ))
        ) : (
          <p role="status">
            약관 본문을 확인할 수 없어요. 돌아가서 다시 열어 주세요.
          </p>
        )}
      </div>
      {onAgree && available ? (
        <Button
          className="w-full shrink-0"
          variant="brand-outline"
          onClick={onAgree}
        >
          동의하고 닫기
        </Button>
      ) : (
        <Button className="w-full shrink-0" variant="outline" onClick={onClose}>
          닫기
        </Button>
      )}
    </article>
  );
}
