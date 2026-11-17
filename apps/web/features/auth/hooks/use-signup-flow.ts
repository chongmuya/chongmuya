"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/shared/http/api-error";
import type { SignupRequest, SignupTerm } from "../types/signup.types";
import { applyFormError } from "@/shared/lib/apply-form-error";
import {
  signupDefaults,
  signupSchema,
  signupStepFields,
  type SignupStep,
  type SignupValues,
} from "../schemas/signup.schema";
import type { VerificationActions } from "../types/verification.types";
import { useContactVerification } from "./use-contact-verification";

export type SignupSubmission = (
  values: SignupRequest,
  signal: AbortSignal,
) => Promise<void>;
export function useSignupFlow({
  onSubmit,
  onExit,
  verification,
  terms,
}: {
  onSubmit?: SignupSubmission;
  onExit: () => void;
  verification?: { phone?: VerificationActions; email?: VerificationActions };
  terms: SignupTerm[];
}) {
  const methods = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: signupDefaults,
    shouldUnregister: false,
    mode: "onTouched",
  });
  const [step, setStep] = useState<SignupStep>("terms");
  const [detail, setDetail] = useState<
    | keyof Pick<
        SignupValues,
        "serviceTerms" | "privacyCollection" | "privacyPolicy" | "marketing"
      >
    | null
  >(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [focus, setFocus] = useState<keyof SignupValues | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const values = useWatch({ control: methods.control });
  const phone = useContactVerification(
    values.phone ?? "",
    () => methods.getValues("phone"),
    verification?.phone,
  );
  const email = useContactVerification(
    (values.email ?? "").trim().toLowerCase(),
    () => methods.getValues("email").trim().toLowerCase(),
    verification?.email,
  );
  const previousTerms = useRef(
    new Map(terms.map((term) => [term.id, `${term.version}:${term.required}`])),
  );
  const [termsNotice, setTermsNotice] = useState<string>();
  useEffect(() => {
    if (complete) return;
    const changed = terms.filter(
      (term) =>
        previousTerms.current.get(term.id) !==
        `${term.version}:${term.required}`,
    );
    previousTerms.current = new Map(
      terms.map((term) => [term.id, `${term.version}:${term.required}`]),
    );
    if (!changed.length) return;
    for (const term of changed)
      methods.setValue(term.id, false, { shouldValidate: false });
    setTermsNotice(
      "약관이 변경되었어요. 변경된 항목을 확인하고 다시 동의해 주세요. 입력한 가입 정보와 인증은 유지됩니다.",
    );
    setDetail(null);
    setStep("terms");
  }, [terms, methods, complete]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!focus || pending) return;
    // Wait until the destination fields have registered after the step mounts.
    const timer = setTimeout(() => methods.setFocus(focus), 0);
    return () => clearTimeout(timer);
  }, [focus, step, detail, methods, pending]);

  const back = () => {
    if (lock.current) return;
    if (detail) {
      setDetail(null);
      return;
    }
    methods.clearErrors("root");
    setFocus(null);
    if (step === "information") setStep("terms");
    else onExit();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || complete) return;
    lock.current = true;
    setFocus(null);
    methods.clearErrors("root");
    try {
      if (step === "information" && !phone.isVerified()) {
        methods.setError("phone", {
          message: "현재 전화번호의 휴대폰 인증을 완료해 주세요.",
        });
        setStep("information");
        setFocus("phone");
        return;
      }
      if (step === "terms") {
        if (
          (await methods.trigger([...signupStepFields.terms], {
            shouldFocus: true,
          })) &&
          active.current
        ) {
          setTermsNotice(undefined);
          setStep("information");
        }
        return;
      }
      if (!email.isVerified()) {
        methods.setError("email", {
          message: "현재 이메일의 인증을 완료해 주세요.",
        });
        setFocus("email");
        return;
      }
      await methods.handleSubmit(
        async (input) => {
          if (!onSubmit) {
            methods.setError("root.server", {
              message: "회원가입 연결을 준비하고 있어요.",
            });
            return;
          }
          setPending(true);
          const controller = new AbortController();
          request.current = controller;
          try {
            await onSubmit(
              {
                email: input.email.trim().toLowerCase(),
                password: input.password,
                name: input.name,
                phone: input.phone,
                emailVerificationId: email.state.id!,
                phoneVerificationId: phone.state.id!,
                consents: terms.map((term) => ({
                  id: term.id,
                  version: term.version,
                  accepted: input[term.id],
                })),
              },
              controller.signal,
            );
            if (!active.current || controller.signal.aborted) return;
            methods.reset(signupDefaults);
            phone.reset();
            email.reset();
            setComplete(true);
          } catch (error) {
            if (!active.current || controller.signal.aborted) return;
            if (
              error instanceof ApiError &&
              error.code === "EMAIL_ALREADY_REGISTERED"
            ) {
              methods.setError("email", {
                message: "이미 가입한 이메일입니다.",
              });
            } else if (
              error instanceof ApiError &&
              error.code.startsWith("EMAIL_VERIFICATION_")
            ) {
              email.reset();
              methods.setError("email", {
                message: "이메일 인증을 다시 진행해 주세요.",
              });
            } else if (
              error instanceof ApiError &&
              error.code.startsWith("PHONE_VERIFICATION_")
            ) {
              phone.reset();
              methods.setError("phone", {
                message: "휴대폰 인증을 다시 진행해 주세요.",
              });
            } else if (
              error instanceof ApiError &&
              error.code === "SIGNUP_TERMS_CHANGED"
            ) {
              methods.setError("serviceTerms", {
                message:
                  "약관이 변경되었습니다. 최신 약관을 확인하고 다시 동의해 주세요.",
              });
            } else
              applyFormError(error, methods.setError, {
                email: "email",
                name: "name",
                phone: "phone",
                password: "password",
                passwordConfirm: "passwordConfirm",
              });
            const target = (Object.keys(signupStepFields) as SignupStep[]).find(
              (s) =>
                signupStepFields[s].some((f) => methods.getFieldState(f).error),
            );
            if (target) {
              setStep(target);
              setFocus(
                signupStepFields[target].find(
                  (f) => methods.getFieldState(f).error,
                ) ?? null,
              );
            }
          } finally {
            if (active.current) setPending(false);
          }
        },
        (errors) => {
          const target = (Object.keys(signupStepFields) as SignupStep[]).find(
            (s) => signupStepFields[s].some((f) => errors[f]),
          );
          if (target) {
            setStep(target);
            setFocus(signupStepFields[target].find((f) => errors[f]) ?? null);
          }
        },
      )();
    } finally {
      lock.current = false;
    }
  };
  return {
    methods,
    step,
    detail,
    setDetail,
    pending,
    complete,
    back,
    submit,
    phone,
    email,
    termsNotice,
    focus,
  };
}
