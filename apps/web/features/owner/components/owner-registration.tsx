"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  FormProvider,
  useFieldArray,
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
import { OwnerChoice, OwnerField, OwnerCheck } from "./owner-fields";
import { OwnerPolicyFields } from "./owner-policy-fields";
import { OwnerSummary } from "./owner-summary";

const titles = [
  "사장님, 매장을 등록해 주세요!",
  "손님을 얼마나 받을 수 있나요?",
  "예약 조건을 알려주세요",
  "메뉴 확정·인원 변경 조건을 알려주세요",
  "입력한 내용을 확인해 주세요",
];
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
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "spaces",
    keyName: "rowKey",
  });
  const [step, setStep] = useState(Math.min(draft.step, 4)),
    [complete, setComplete] = useState(
      draft.submitted ? draft.restaurantId : null,
    );
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
  if (complete)
    return (
      <StepLayout title="등록 완료" onBack={() => onNavigate("/owner")}>
        <div className="py-12 text-center">
          <div className="mx-auto mb-8 flex size-12 items-center justify-center rounded-full bg-brand text-3xl text-white">
            ✓
          </div>
          <h1 className="text-2xl font-bold">매장 정보가 저장되었어요</h1>
          <p className="mt-3 text-muted">
            {context.data?.restaurants.find((r) => r.id === complete)?.published
              ? "공개 중"
              : "공개 대기"}
          </p>
        </div>
        <OwnerSummary data={form.getValues()} />
        <div className="mt-8 space-y-3">
          <Link
            className={buttonStyles({ className: "w-full" })}
            href={`/owner/menus?restaurant=${complete}`}
          >
            메뉴 등록하기
          </Link>
          <Link
            className={buttonStyles({
              variant: "brand-outline",
              className: "w-full",
            })}
            href="/owner"
          >
            사장님 홈으로 가기
          </Link>
        </div>
      </StepLayout>
    );
  return (
    <FormProvider {...form}>
      <StepLayout
        title="매장 등록"
        progress={{ value: step + 1, max: 5 }}
        onBack={() => {
          if (step) void persist(step - 1).catch(() => undefined);
          else
            void persist(0)
              .then(() => {
                if (active.current) onNavigate("/owner");
              })
              .catch(() => undefined);
        }}
        busy={busy}
      >
        <StepHeading title={titles[step]} className="mb-8 px-4" />
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
          <fieldset disabled={busy} className="space-y-8 px-4">
            {step === 0 && (
              <>
                <OwnerField
                  path="name"
                  label="매장명 *"
                  placeholder="매장명을 입력해 주세요"
                />
                <OwnerField path="branchName" label="지점명 (선택)" />
                <div className="space-y-3">
                  <OwnerField
                    path="addressQuery"
                    onEnter={searchAddress}
                    changed={() => {
                      setAddressId(undefined);
                      setSearchNotice("");
                    }}
                    label="매장 주소 *"
                    placeholder="도로명·지번 주소를 검색해 주세요"
                  />
                  <Button
                    variant="brand-outline"
                    className="w-full"
                    onClick={searchAddress}
                  >
                    주소 검색
                  </Button>
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
                                setSearchNotice(
                                  `선택한 주소: ${a.baseAddress}`,
                                );
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
                <OwnerField path="detailAddress" label="상세주소 (층·호수)" />
                <OwnerChoice
                  path="category"
                  label="음식 종류 *"
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
                  label={
                    draft.restaurantId
                      ? "예약 문의 연락처"
                      : "예약 문의 연락처 *"
                  }
                  placeholder="01012345678"
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
                <OwnerCheck
                  checked={data.receiveConsent}
                  onChange={(e) =>
                    form.setValue("receiveConsent", e.target.checked)
                  }
                >
                  이 연락처로 단체 예약 문의 문자를 받는 데 동의합니다. (선택)
                </OwnerCheck>
                <p className="text-xs text-muted">
                  동의하지 않아도 등록할 수 있으며, 이 번호에는 문의 문자를
                  보내지 않아요.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <OwnerField
                  numeric
                  path="maxCapacity"
                  label="매장 전체 수용 인원 (미확인 시 비워 두세요)"
                />
                {fields.map((field, i) => (
                  <section
                    key={field.rowKey}
                    className="space-y-4 rounded-control bg-surface p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-bold">공간 {i + 1}</h2>
                      {!field.id && (
                        <Button variant="outline" onClick={() => remove(i)}>
                          입력 취소
                        </Button>
                      )}
                    </div>
                    <OwnerChoice
                      path={`spaces.${i}.kind`}
                      label="공간 유형"
                      options={[
                        ["HALL", "일반 홀"],
                        ["WHOLE", "전체 대관"],
                        ["FLOOR", "한 층 대관"],
                        ["ROOM", "룸"],
                      ]}
                    />
                    <OwnerField
                      path={`spaces.${i}.label`}
                      label="공간 이름 *"
                      placeholder="예: 룸 A"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <OwnerField
                        numeric
                        path={`spaces.${i}.capacity`}
                        label="수용 인원"
                      />
                      <OwnerField
                        numeric
                        path={`spaces.${i}.minGuests`}
                        label="최소 인원"
                      />
                    </div>
                    <OwnerField
                      numeric
                      path={`spaces.${i}.minSpend`}
                      label="최소 이용금액 (원, 없음은 0)"
                    />
                    <OwnerField
                      numeric
                      path={`spaces.${i}.separateFee`}
                      label="별도 대관료 (원, 없음은 0)"
                    />
                    <OwnerChoice
                      path={`spaces.${i}.togetherSeating`}
                      label="함께 착석"
                      options={[
                        ["UNKNOWN", "확인 필요"],
                        ["YES", "가능"],
                        ["NO", "분리 착석"],
                      ]}
                    />
                    <OwnerChoice
                      path={`spaces.${i}.availability`}
                      label="운영 상태"
                      options={[
                        ["UNKNOWN", "확인 필요"],
                        ["AVAILABLE", "운영 중"],
                        ["UNAVAILABLE", "이용 중단"],
                      ]}
                    />
                    <OwnerField
                      path={`spaces.${i}.conditions`}
                      label="추가 조건"
                    />
                  </section>
                ))}
                <Button
                  variant="brand-outline"
                  className="w-full"
                  onClick={() =>
                    append({
                      label: "",
                      kind: "HALL",
                      availability: "UNKNOWN",
                      togetherSeating: "UNKNOWN",
                      capacity: null,
                      minGuests: null,
                      minSpend: null,
                      separateFee: null,
                      conditions: "",
                    })
                  }
                >
                  공간 추가
                </Button>
              </>
            )}
            {(step === 2 || step === 3) && <OwnerPolicyFields step={step} />}
            {step === 4 && (
              <OwnerSummary
                data={data}
                onEdit={(n) => void persist(n).catch(() => undefined)}
              />
            )}
          </fieldset>
          <div className="mt-auto space-y-3 pt-10">
            <p className="text-center text-xs text-muted" role="status">
              {save.pending
                ? "초안을 저장하고 있어요…"
                : save.error
                  ? "초안을 저장하지 못했어요. 입력을 유지했으니 다시 저장해 주세요."
                  : "입력한 내용은 계정의 초안으로 저장돼요."}
            </p>
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
              className="w-full"
              loading={busy}
              disabled={!!save.conflict}
            >
              {step === 4 ? "등록 완료하기" : "다음"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void persist(step).catch(() => undefined)}
            >
              초안 저장
            </Button>
            {!!save.error && !save.conflict && (
              <Button variant="outline" onClick={() => void save.recover()}>
                최신 저장 상태 확인
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
