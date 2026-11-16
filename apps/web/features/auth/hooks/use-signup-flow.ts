"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  values: SignupValues,
  signal: AbortSignal,
) => Promise<void>;
export function useSignupFlow({
  onSubmit,
  onExit,
  verification,
}: {
  onSubmit?: SignupSubmission;
  onExit: () => void;
  verification?: { email?: VerificationActions; phone?: VerificationActions };
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
  const email = useContactVerification(
    values.email ?? "",
    () => methods.getValues("email"),
    verification?.email,
  );
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
    else onExit();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || complete) return;
    lock.current = true;
    setFocus(null);
    methods.clearErrors("root");
    try {
      if (step !== "nickname") {
        if (
          (await methods.trigger([...signupStepFields[step]], {
            shouldFocus: true,
          })) &&
          active.current
        )
          setStep(step === "terms" ? "information" : "nickname");
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
            await onSubmit(input, controller.signal);
            if (!active.current || controller.signal.aborted) return;
            methods.reset(signupDefaults);
            email.reset();
            phone.reset();
            setComplete(true);
          } catch (error) {
            if (!active.current || controller.signal.aborted) return;
            applyFormError(error, methods.setError, {
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
    email,
    phone,
    focus,
  };
}
