"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Account, SessionRequest } from "@/features/auth/types";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { Button, buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Dialog } from "@/shared/ui/dialog";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { useSubmitDraft } from "../hooks/use-owner-commands";
import { useDraftIdentity } from "../hooks/use-draft-identity";
import { checkDuplicate, contextQuery } from "../api/owner.api";
import { useQuery } from "@tanstack/react-query";
import { useDraftSave } from "../hooks/use-draft-save";
import {
  registrationSchema,
  registrationIssues,
  registrationStep,
  type RegistrationData,
} from "../schemas/registration.schema";
import type { RestaurantDraft, DuplicateResult } from "../types/owner.types";
import { OwnerChoice, OwnerField } from "./owner-fields";
import { OwnerPolicyFields } from "./owner-policy-fields";
import { DepositAccountEntry } from "@/features/account/client";
import { OwnerSummary, OwnerCompletionSummary } from "./owner-summary";
import { OwnerSpaceFields } from "./owner-space-fields";

const titles = [
  "사장님, 매장을 등록해 주세요!",
  "손님을 얼마나 받을 수 있나요?",
  "예약 조건을 알려주세요",
  "변경 및 취소 정책을 알려주세요",
  "입력한 내용을 확인해 주세요",
];
const descriptions = [
  "정확한 매장 정보를 입력하면 단체 예약 문의를 더 편리하게 받을 수 있어요.",
  "매장의 수용 인원과 공간별 이용 조건을 알려주세요.",
  "단체 손님을 받을 때 적용되는 기본 조건을 설정해 주세요. 나중에 수정할 수도 있어요.",
];
const headingSpacing = ["mb-7", "mb-12", "mb-7", "mb-[74px]", "mb-11"];
export function OwnerRegistration({
  account,
  request,
  draft,
  onNavigate,
}: {
  account: Account;
  request: SessionRequest;
  draft: RestaurantDraft;
  onNavigate: (path: string) => void;
}) {
  const form = useForm<RegistrationData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: draft.data,
  });
  const context = useQuery(contextQuery(account.id, request));
  const data = useWatch({ control: form.control }) as RegistrationData;
  const [step, setStep] = useState(Math.min(draft.step, 4)),
    [complete, setComplete] = useState(
      draft.submitted ? draft.restaurantId : null,
    );
  const [capacityUnknown, setCapacityUnknown] = useState(
    () =>
      draft.data.maxCapacity === null &&
      (draft.step > 1 || !!draft.restaurantId),
  );
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0);
    heading.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [step, complete]);
  const identity = useDraftIdentity(request, draft);
  const {
    addresses,
    setAddresses,
    addressId,
    setAddressId,
    searchNotice,
    setSearchNotice,
    challenge,
    verifiedPhone,
  } = identity;
  const [error, setError] = useState<unknown>(null);
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null),
    [copied, setCopied] = useState(false);
  const save = useDraftSave(account.id, request, draft),
    submit = useSubmitDraft(account.id, request, draft.id),
    active = useActiveScreen();
  const [advancing, setAdvancing] = useState(false);
  const busy = advancing || identity.busy || submit.isPending;
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serialized = JSON.stringify(data);
  const saveDraft = save.save;
  useEffect(() => {
    if (complete || save.conflict || advancing) return;
    const timer = setTimeout(() => {
      const parsed = registrationSchema.safeParse(JSON.parse(serialized));
      if (parsed.success)
        void saveDraft(parsed.data, step, addressId).catch(() => undefined);
    }, 900);
    debounce.current = timer;
    return () => clearTimeout(timer);
  }, [
    serialized,
    step,
    addressId,
    complete,
    saveDraft,
    save.conflict,
    advancing,
  ]);
  const searchAddress = () =>
    void identity.search(form.getValues("addressQuery")).catch(() => undefined);
  const persist = async (nextStep: number, resume = false, advance = false) => {
    clearTimeout(debounce.current);
    const saved = await saveDraft(
      form.getValues(),
      nextStep,
      addressId,
      resume,
      advance,
    );
    if (active.current) {
      setStep(saved.step);
      if (saved.submitted && saved.restaurantId) {
        form.reset(saved.data);
        setComplete(saved.restaurantId);
      }
    }
    return saved;
  };
  const next = async () => {
    if (advancing) return;
    setAdvancing(true);
    setError(null);
    try {
      const values = form.getValues();
      const savedContact = draft.currentRestaurant?.data;
      const unchangedContact =
        !!savedContact &&
        values.phone === savedContact.phone &&
        values.receiveConsent === savedContact.receiveConsent;
      const issues = registrationIssues(values, unchangedContact).filter(
        (issue) => step === 4 || issue.step === step,
      );
      if (step === 1 && values.maxCapacity === null && !capacityUnknown)
        issues.unshift({
          path: "maxCapacity",
          step: 1,
          message:
            "수용 인원을 입력하거나 아직 정확한 인원을 모른다고 표시해 주세요.",
        });
      if (issues.length) {
        form.clearErrors();
        for (const issue of issues)
          form.setError(issue.path as FieldPath<RegistrationData>, {
            type: "validate",
            message: issue.message,
          });
        setStep(issues[0]!.step);
        requestAnimationFrame(() => {
          if (active.current)
            form.setFocus(issues[0]!.path as FieldPath<RegistrationData>);
        });
        setError(issues[0]!.message);
        return;
      }
      const saved = await persist(Math.min(step + 1, 4), false, step < 4);
      if (saved.submitted) return;
      if (saved.duplicate) {
        setDuplicate(saved.duplicate);
        return;
      }
      if (step < 4) return;
      const result = await submit.mutateAsync(saved.version);
      if (active.current) {
        await context.refetch();
        setComplete(result.restaurantId);
      }
    } catch (e) {
      if (active.current) {
        setError(e);
        if (
          e instanceof ApiError &&
          [
            "ADDRESS_SELECTION_REQUIRED",
            "PHONE_VERIFICATION_REQUIRED",
          ].includes(e.code ?? "")
        ) {
          setStep(0);
          form.setError(
            e.code === "ADDRESS_SELECTION_REQUIRED" ? "addressQuery" : "phone",
            { type: "server", message: safeErrorMessage(e) },
          );
        }
      }
      if (e instanceof ApiError && e.code === "RESTAURANT_VERSION_CONFLICT")
        await save.recover();
      if (e instanceof ApiError && e.code === "RESTAURANT_DUPLICATE") {
        const result = await checkDuplicate(request, draft.id).catch(
          () => null,
        );
        if (active.current && result) setDuplicate(result);
      }
    } finally {
      if (active.current) setAdvancing(false);
    }
  };
  if (complete) {
    const submitted = form.getValues();
    const savedRestaurant = context.data?.restaurants.find(
      (r) => r.id === complete,
    );
    return (
      <StepLayout
        title=""
        className="pb-[max(16px,env(safe-area-inset-bottom))]"
        onBack={() => onNavigate("/owner")}
      >
        <div
          ref={heading}
          className="px-[17px] pt-[clamp(48px,9.8svh,93px)] text-center"
        >
          <Image
            src="/images/owner-registration/complete.svg"
            width={48}
            height={48}
            alt=""
            className="mx-auto mb-9"
          />
          <h1
            tabIndex={-1}
            className="text-2xl leading-[1.2] font-bold text-brand-ink focus:outline-none"
          >
            {draft.restaurantId
              ? "매장 정보를 수정했어요"
              : "매장 등록이 완료되었어요"}
          </h1>
          <p className="mx-auto mt-2 max-w-[225px] text-control leading-6 text-muted">
            메뉴를 등록하면 총무가 더 빠르게 예약을 진행할 수 있어요
          </p>
          {savedRestaurant && !savedRestaurant.published && (
            <p className="mt-3 text-xs text-muted">
              매장 정보는 공개 대기 중이에요.
            </p>
          )}
          {context.isError && (
            <p className="mt-3 text-xs text-muted">
              공개 상태를 확인하지 못했어요.
            </p>
          )}
        </div>
        <div className="mt-auto pt-[clamp(44px,13.7svh,130px)]">
          <OwnerCompletionSummary data={submitted} />
          <div className="space-y-2 pt-5">
            <Link
              className={buttonStyles({
                className: "w-full font-medium",
              })}
              href={`/owner/menus?restaurant=${complete}`}
            >
              메뉴 등록하기
            </Link>
            <Link
              className={buttonStyles({
                variant: "brand-outline",
                className: "w-full border-2 font-medium",
              })}
              href="/owner"
            >
              홈으로 가기
            </Link>
          </div>
        </div>
      </StepLayout>
    );
  }
  return (
    <FormProvider {...form}>
      <StepLayout
        variant="owner"
        title={
          step === 4 ? "" : draft.restaurantId ? "매장 정보 수정" : "매장 등록"
        }
        progress={step < 4 ? { value: step + 1, max: 4 } : undefined}
        onBack={() => {
          if (step) void persist(step - 1).catch(() => undefined);
          else
            void persist(0)
              .then(() => {
                if (active.current)
                  onNavigate(
                    draft.restaurantId
                      ? "/owner"
                      : "/getting-started?next=%2Fowner&guide=1",
                  );
              })
              .catch(() => undefined);
        }}
        busy={busy}
      >
        <div ref={heading}>
          <StepHeading
            title={titles[step]}
            description={descriptions[step]}
            className={`px-[17px] text-brand-ink ${headingSpacing[step]}`}
            descriptionClassName={`mt-2 text-control leading-[1.2] ${step === 0 ? "max-w-64" : ""}`}
          />
        </div>
        {save.conflict && (
          <section
            role="alert"
            className="mb-5 space-y-4 rounded-control border border-brand p-4"
          >
            <h2 className="font-bold">최신 정보 확인이 필요해요</h2>
            <p>
              다른 화면에서 정보가 변경됐어요. 작성 중인 입력은 유지했습니다.
              아래 최신 내용을 확인한 뒤 이어가면 현재 입력한 정보로 초안을
              저장합니다. 메뉴와 공개 상태는 유지됩니다.
            </p>
            <details>
              <summary>서버에 저장된 초안 확인</summary>
              <OwnerSummary data={save.conflict.data} />
            </details>
            {save.conflict.currentRestaurant && (
              <details>
                <summary>
                  현재 매장 정보 확인 ·{" "}
                  {save.conflict.currentRestaurant.published
                    ? "공개 중"
                    : "공개 대기"}
                </summary>
                <OwnerSummary data={save.conflict.currentRestaurant.data} />
              </details>
            )}
            <Button
              loading={save.pending}
              onClick={() =>
                void persist(step, true)
                  .then(() => {
                    if (active.current) setError(null);
                  })
                  .catch(() => undefined)
              }
            >
              최신 내용 확인 후 내 입력으로 이어가기
            </Button>
          </section>
        )}
        <form
          className="flex flex-1 flex-col"
          onChange={() => {
            if (typeof error === "string") setError(null);
          }}
          onSubmit={(event) =>
            void form.handleSubmit(
              () => void next(),
              () => {
                const result = registrationSchema.safeParse(form.getValues());
                if (!result.success && result.error.issues[0]) {
                  setStep(
                    registrationStep(result.error.issues[0].path.join(".")),
                  );
                  setError("표시된 입력 항목을 확인해 주세요.");
                }
              },
            )(event)
          }
          noValidate
        >
          <fieldset disabled={busy} className="space-y-9 px-[17px]">
            {step === 0 && (
              <>
                <OwnerField
                  path="name"
                  label="매장명"
                  required
                  placeholder="예) 총무식당"
                />
                <OwnerField
                  path="branchName"
                  label="지점명 (선택)"
                  placeholder="예) 건대점"
                />
                <div className="space-y-3">
                  <OwnerField
                    path="addressQuery"
                    onEnter={searchAddress}
                    changed={() => {
                      setAddressId(undefined);
                      setSearchNotice("");
                    }}
                    label="매장 주소"
                    required
                    placeholder="주소를 검색해 주세요"
                  />
                  {searchNotice && (
                    <p role="status" className="text-sm text-muted">
                      {searchNotice}
                    </p>
                  )}
                  {!!addresses.length && (
                    <BottomSheet
                      title="주소 선택"
                      onClose={() => setAddresses([])}
                    >
                      <ul className="space-y-2">
                        {addresses.map((a) => (
                          <li key={a.id}>
                            <Button
                              className="h-auto w-full py-3 text-left"
                              variant="outline"
                              onClick={() => {
                                form.setValue("addressQuery", a.baseAddress);
                                setAddressId(a.id);
                                setSearchNotice("");
                                setAddresses([]);
                              }}
                            >
                              {a.baseAddress}
                              {a.jibunAddress && (
                                <span className="block text-xs">
                                  {a.jibunAddress}
                                </span>
                              )}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </BottomSheet>
                  )}
                </div>
                {(addressId || data.detailAddress) && (
                  <OwnerField
                    path="detailAddress"
                    label="상세주소 (선택)"
                    placeholder="층·호수"
                  />
                )}
                <OwnerChoice
                  path="category"
                  label="음식 종류"
                  required
                  options={[
                    ...(["한식", "호프·주점", "기타 음식점"].includes(
                      draft.data.category,
                    )
                      ? []
                      : [
                          [
                            draft.data.category,
                            draft.data.category || "미확인",
                          ] as const,
                        ]),
                    ["한식", "한식"],
                    ["호프·주점", "호프·주점"],
                    ["기타 음식점", "기타 음식점"],
                  ]}
                />
                <OwnerField
                  path="phone"
                  label="예약 문의 연락처"
                  required={!draft.restaurantId}
                  inputMode="tel"
                  placeholder="연락처를 입력해 주세요"
                  hint="예약 요청과 진행 상황을 안내받을 번호에요."
                />
                {data.phone &&
                (verifiedPhone === data.phone ||
                  (account.phone === data.phone && account.phoneVerifiedAt)) ? (
                  <p className="text-sm">확인된 연락처입니다.</p>
                ) : data.phone ? (
                  <div className="space-y-3">
                    <Button
                      variant="brand-outline"
                      onClick={() =>
                        void identity
                          .start(form.getValues("phone"))
                          .catch(() => undefined)
                      }
                    >
                      다른 번호 인증하기
                    </Button>
                    {challenge && (
                      <>
                        <p className="text-sm">
                          이 번호의 휴대폰에서 {challenge.receiver}로 아래 인증
                          문자를 보내 주세요.
                        </p>
                        <p className="break-all rounded-control bg-surface p-3 text-sm">
                          {challenge.message}
                        </p>
                        <a
                          className={buttonStyles({ variant: "outline" })}
                          href={`sms:${challenge.receiver}?body=${encodeURIComponent(challenge.message)}`}
                        >
                          문자 앱 열기
                        </a>
                        <Button
                          onClick={() =>
                            void identity.check().catch(() => undefined)
                          }
                        >
                          인증 확인
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}
            {step === 1 && (
              <OwnerSpaceFields
                capacityUnknown={capacityUnknown}
                onCapacityUnknownChange={setCapacityUnknown}
              />
            )}
            {(step === 2 || step === 3) && (
              <OwnerPolicyFields
                step={step}
                depositAccount={
                  <DepositAccountEntry
                    accountId={account.id}
                    request={request}
                  />
                }
              />
            )}
            {step === 4 && (
              <OwnerSummary
                data={data}
                onEdit={(n) => void persist(n).catch(() => undefined)}
                onConsentChange={(checked) =>
                  form.setValue("receiveConsent", checked)
                }
                contactSettings={
                  <details
                    className="mt-3"
                    open={form.formState.errors.publicPhone ? true : undefined}
                  >
                    <summary className="cursor-pointer text-sm text-muted">
                      고객용 매장 대표번호 (선택)
                    </summary>
                    <div className="mt-3">
                      <OwnerField
                        path="publicPhone"
                        label="고객용 매장 대표번호"
                        hideLabel
                        placeholder="02-1234-5678"
                        inputMode="tel"
                        hint="예약한 총무에게 안내할 번호예요."
                      />
                    </div>
                  </details>
                }
              />
            )}
          </fieldset>
          <div className="mt-auto space-y-3 pt-7">
            {save.pending && (
              <p className="text-center text-xs text-muted" role="status">
                초안 저장 중…
              </p>
            )}
            <FormError
              message={
                error
                  ? typeof error === "string"
                    ? error
                    : safeErrorMessage(error)
                  : (save.error ?? identity.error ?? submit.error)
                    ? safeErrorMessage(
                        save.error ?? identity.error ?? submit.error,
                      )
                    : undefined
              }
            />
            {Object.keys(form.formState.errors).length > 0 && (
              <FormError message="입력값의 길이와 숫자를 확인해 주세요." />
            )}
            <Button
              type="submit"
              variant={step === 4 ? "solid" : "brand-outline"}
              className={
                step === 4
                  ? "w-full font-medium"
                  : "w-full border-2 font-medium"
              }
              loading={busy}
              disabled={!!save.conflict}
            >
              {step === 4
                ? draft.restaurantId
                  ? "수정 완료하기"
                  : "등록 완료하기"
                : "다음"}
            </Button>
            {!!save.error && !save.conflict && (
              <Button variant="outline" onClick={() => void save.recover()}>
                최신 저장 상태 확인
              </Button>
            )}
            {!!save.error && !save.conflict && (
              <Button
                variant="outline"
                onClick={() => void persist(step).catch(() => undefined)}
              >
                초안 다시 저장
              </Button>
            )}
          </div>
        </form>
        {duplicate && (
          <Dialog
            labelledBy="duplicate-title"
            onClose={() => setDuplicate(null)}
          >
            <h2 id="duplicate-title" className="text-xl font-bold">
              {duplicate.ownRestaurantId
                ? "이미 등록한 매장입니다"
                : "이미 등록된 매장이 있어요"}
            </h2>
            <p className="mt-4">
              같은 이름과 주소로 등록된 매장이 있습니다. 기존 매장 연결이
              필요하면 관리자에게 문의해 주세요.
            </p>
            {duplicate.ownRestaurantId ? (
              <Link
                className={buttonStyles({ className: "mt-4 w-full" })}
                href={`/owner/register?restaurant=${duplicate.ownRestaurantId}`}
              >
                내 매장 수정하기
              </Link>
            ) : duplicate.supportEmail ? (
              <div className="mt-4 space-y-3">
                <p className="break-all">
                  관리자 이메일: {duplicate.supportEmail}
                </p>
                <Button
                  className="w-full"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(duplicate.supportEmail!)
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false))
                  }
                >
                  {copied ? "복사했어요" : "이메일 복사"}
                </Button>
                <a
                  className={buttonStyles({
                    variant: "brand-outline",
                    className: "w-full",
                  })}
                  href={`mailto:${duplicate.supportEmail}?subject=${encodeURIComponent("기존 매장 연결 문의")}&body=${encodeURIComponent(`매장명: ${data.name}\n주소: ${data.addressQuery} ${data.detailAddress}\n총무야 계정 ID: ${account.id}\n연결 확인을 부탁드립니다.`)}`}
                >
                  메일 앱 열기
                </a>
              </div>
            ) : (
              <p className="mt-4 text-sm">
                관리자 이메일 설정을 확인 중이에요. 입력한 내용은 보존됩니다.
              </p>
            )}
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => setDuplicate(null)}
            >
              입력 내용 수정
            </Button>
          </Dialog>
        )}
      </StepLayout>
    </FormProvider>
  );
}
