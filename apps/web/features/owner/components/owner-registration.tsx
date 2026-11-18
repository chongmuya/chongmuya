"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Account, SessionRequest } from "@/features/auth/types";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { Button, buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { Dialog } from "@/shared/ui/dialog";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { useOwnerAction } from "../hooks/use-owner-action";
import { useDraftSave } from "../hooks/use-draft-save";
import {
  registrationSchema,
  validRegistration,
  type RegistrationData,
  type VerifiedAddress,
} from "../schemas/registration.schema";
import type { RestaurantDraft, DuplicateResult } from "../types/owner.types";
import { OwnerChoice, OwnerField, OwnerCheck } from "./owner-fields";
import { OwnerPolicyFields } from "./owner-policy-fields";
import { OwnerSummary } from "./owner-summary";

type PhoneChallenge = {
  id: string;
  phone: string;
  message: string;
  receiver: string;
  status: string;
  nextCheckAt: string;
};
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
  const [addresses, setAddresses] = useState<VerifiedAddress[]>([]),
    [addressId, setAddressId] = useState<string>();
  const [searchNotice, setSearchNotice] = useState(""),
    [error, setError] = useState<unknown>(null);
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null),
    [copied, setCopied] = useState(false);
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null),
    [verifiedPhone, setVerifiedPhone] = useState(draft.verifiedPhone);
  const save = useDraftSave(account.id, request, draft),
    action = useOwnerAction<unknown>(account.id, request),
    active = useActiveScreen();
  const busy = action.isPending;
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serialized = JSON.stringify(data);
  const saveDraft = save.save;
  useEffect(() => {
    if (complete) return;
    const timer = setTimeout(() => {
      const parsed = registrationSchema.safeParse(JSON.parse(serialized));
      if (parsed.success)
        void saveDraft(parsed.data, step, addressId).catch(() => undefined);
    }, 900);
    debounce.current = timer;
    return () => clearTimeout(timer);
  }, [serialized, step, addressId, complete, saveDraft]);
  const execute = async <T,>(path: string, body?: unknown) => {
    setError(null);
    try {
      return (await action.mutateAsync({
        path: `drafts/${draft.id}/${path}`,
        body,
      })) as T;
    } catch (e) {
      if (active.current) setError(e);
      throw e;
    }
  };
  const searchAddress = () =>
    void execute<{ results: VerifiedAddress[] }>("addresses", {
      query: form.getValues("addressQuery"),
    })
      .then((r) => {
        if (active.current) {
          setAddresses(r.results);
          setSearchNotice(
            r.results.length
              ? "검색한 주소를 선택해 주세요."
              : "검색 결과가 없어요. 주소를 수정해 다시 검색해 주세요.",
          );
        }
      })
      .catch(() => undefined);
  const persist = async (nextStep: number) => {
    clearTimeout(debounce.current);
    const saved = await saveDraft(form.getValues(), nextStep, addressId);
    if (active.current) {
      setStep(nextStep);
      if (saved.submitted && saved.restaurantId) {
        form.reset(saved.data);
        setComplete(saved.restaurantId);
      }
    }
    return saved;
  };
  const next = async () => {
    try {
      const saved = await persist(step);
      if (saved.submitted) return;
      if (step === 0) {
        if (!saved.selectedAddress) {
          setSearchNotice("주소 검색 결과를 선택해 주세요.");
          return;
        }
        const result = await execute<DuplicateResult>("duplicate");
        if (!active.current) return;
        if (result.duplicate) {
          setDuplicate(result);
          return;
        }
      }
      if (step < 4) {
        await persist(step + 1);
        return;
      }
      if (!validRegistration(form.getValues())) {
        setError(
          new Error(
            "필수 항목과 조건별 숫자를 확인해 주세요. 공간은 한 곳 이상 필요해요.",
          ),
        );
        return;
      }
      const result = await execute<{ restaurantId: string }>("submit", {
        version: saved.version,
      });
      if (active.current) setComplete(result.restaurantId);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESTAURANT_DUPLICATE") {
        const result = await execute<DuplicateResult>("duplicate").catch(
          () => null,
        );
        if (active.current && result) setDuplicate(result);
      }
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
            신규 등록 매장은 공개 대기 상태예요.
            <br />
            정보를 확인한 뒤 공개됩니다.
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
        <StepHeading
          title={titles[step]}
          description={
            step === 0
              ? "정확한 매장 정보를 입력하면 단체 예약 문의를 더 편리하게 받을 수 있어요."
              : undefined
          }
          className="mb-8 px-4"
        />
        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => void form.handleSubmit(() => void next())(event)}
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
                              `${a.source === "fake" ? "개발용 결과 · " : ""}선택한 주소: ${a.baseAddress}`,
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
                </div>
                <OwnerField path="detailAddress" label="상세주소 (층·호수)" />
                <OwnerChoice
                  path="category"
                  label="음식 종류 *"
                  options={[
                    ["한식", "한식"],
                    ["호프·주점", "호프·주점"],
                    ["기타 음식점", "기타 음식점"],
                  ]}
                />
                <OwnerField
                  path="phone"
                  label="예약 문의 연락처 *"
                  placeholder="01012345678"
                />
                {data.phone &&
                (verifiedPhone === data.phone ||
                  (account.phone === data.phone && account.phoneVerifiedAt)) ? (
                  <p className="text-sm">확인된 연락처입니다.</p>
                ) : (
                  <div className="space-y-3">
                    <Button
                      variant="brand-outline"
                      onClick={() =>
                        void execute<PhoneChallenge>("contact-verification", {
                          phone: form.getValues("phone"),
                        })
                          .then((r) => {
                            if (active.current) setChallenge(r);
                          })
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
                            void execute<{ status: string }>(
                              "contact-verification/check",
                              {
                                phone: challenge.phone,
                                verificationId: challenge.id,
                              },
                            )
                              .then((r) => {
                                if (active.current && r.status === "verified") {
                                  setVerifiedPhone(challenge.phone);
                                  setChallenge(null);
                                }
                              })
                              .catch(() => undefined)
                          }
                        >
                          인증 확인
                        </Button>
                      </>
                    )}
                  </div>
                )}
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
                <OwnerChoice
                  path="minimumGuests.kind"
                  label="최소 단체 인원"
                  options={[
                    ["UNKNOWN", "미확인"],
                    ["NONE", "제한 없음"],
                    ["AT_LEAST", "최소 인원 제한 있음"],
                  ]}
                  changed={(v) =>
                    form.setValue(
                      "minimumGuests.value",
                      v === "NONE" ? 0 : null,
                    )
                  }
                />
                {data.minimumGuests.kind === "AT_LEAST" && (
                  <OwnerField
                    numeric
                    path="minimumGuests.value"
                    label="최소 예약 인원"
                  />
                )}
                <p className="text-sm text-muted">
                  공통 최소 인원·주문 조건과 각 공간 조건을 모두 충족해야 해요.
                  같은 식사 금액의 최소 기준은 더하지 않고, 별도 대관료는 따로
                  적용해요.
                </p>
                {fields.map((field, i) => (
                  <section
                    key={field.rowKey}
                    className="space-y-4 rounded-control bg-surface p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-bold">공간 {i + 1}</h2>
                      <Button variant="outline" onClick={() => remove(i)}>
                        공간 제외
                      </Button>
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
                      label="공간 이용 정보 (날짜별 예약 가능 확정 아님)"
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
                error instanceof Error && !(error instanceof ApiError)
                  ? error.message
                  : error
                    ? safeErrorMessage(error)
                    : save.error
                      ? safeErrorMessage(save.error)
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
