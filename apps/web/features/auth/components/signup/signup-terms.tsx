import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";
import {
  LegalDocumentContent,
  legalDocumentsVersion,
} from "@/shared/legal/documents-2026-11-21";
import { Checkbox } from "@/shared/ui/checkbox";
import { IconButton } from "@/shared/ui/icon-button";
import { FormError } from "@/shared/ui/form-error";
import { LegalDocumentReader } from "@/shared/legal/legal-document-reader";
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
                  <span className="text-[clamp(16px,5vw,20px)] leading-6">
                    {term.title}
                    <span className={term.required ? "text-brand" : ""}>
                      ({term.required ? "필수" : "선택"})
                    </span>
                  </span>
                </label>
                <IconButton
                  aria-label={`${term.title} 상세 보기`}
                  data-signup-term={term.id}
                  onClick={() => onDetail(term.id)}
                  className="w-11 justify-end"
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
  const published = term.version === legalDocumentsVersion;
  const available = published || term.body.length > 0;
  return (
    <LegalDocumentReader
      title={term.title}
      actionLabel={available ? "동의하고 닫기" : "닫기"}
      onAction={available ? onAgree : onClose}
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
    </LegalDocumentReader>
  );
}
