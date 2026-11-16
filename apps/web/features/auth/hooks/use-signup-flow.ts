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
  verification?: { phone?: VerificationActions };
  terms: SignupTerm[];
}) {
  const methods = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: signupDefaults,
    shouldUnregister: false,
    mode: "onTouched",
  });
  const [step, setStep] = useState<SignupStep>("role");
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
    if (step === "nickname") setStep("information");
    else if (step === "information") setStep("terms");
    else if (step === "terms") setStep("role");
    else onExit();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || complete) return;
    lock.current = true;
    setFocus(null);
    methods.clearErrors("root");
    try {
      if (["information", "nickname"].includes(step) && !phone.isVerified()) {
        methods.setError("phone", {
          message: "현재 전화번호의 휴대폰 인증을 완료해 주세요.",
        });
        setStep("information");
        setFocus("phone");
        return;
      }
      if (step !== "nickname") {
        if (
          (await methods.trigger([...signupStepFields[step]], {
            shouldFocus: true,
          })) &&
          active.current
        )
          setStep(
            step === "role"
              ? "terms"
              : step === "terms"
                ? "information"
                : "nickname",
          );
        return;
      }
      await methods.handleSubmit(
        async (input) => {
          if (!input.accountType) return;
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
                accountType: input.accountType,
                email: input.email.trim().toLowerCase(),
                password: input.password,
                name: input.name,
                nickname: input.nickname,
                phone: input.phone,
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
              for (const term of terms) methods.setValue(term.id, false);
              methods.setError("serviceTerms", {
                message:
                  "약관이 변경되었습니다. 새로고침 후 다시 동의해 주세요.",
              });
            } else
              applyFormError(error, methods.setError, {
                accountType: "accountType",
                email: "email",
                name: "name",
                phone: "phone",
                nickname: "nickname",
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
    focus,
  };
}
