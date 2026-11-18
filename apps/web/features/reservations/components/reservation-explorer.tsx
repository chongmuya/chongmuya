"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  useAuth,
  AuthScreen,
  firstSetupPath,
  isFirstSetupComplete,
  safeReturnPath,
} from "@/features/auth/client";
import type { Account, SessionRequest } from "@/features/auth/types";
import { EventPicker, useEvent } from "@/features/events/client";
import { RestaurantBrowser } from "@/features/restaurants/client";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { inquiryQuery } from "../api/reservations.api";
import { useCreateInquiry } from "../hooks/use-create-inquiry";
import {
  initialConditions,
  inquiryConditions,
  conditionsSchema,
  type ConditionsValues,
} from "../schemas/conditions.schema";
import { ConditionsForm } from "./conditions-form";
import { InquiryReceipt } from "./reservation-progress";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type BrowseProps = {
  selected: string[];
  restaurantId: string | null;
  onSelect: (ids: string[]) => void;
  onOpen: (id: string | null) => void;
};
export function ReservationExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const { account, status, client } = useAuth();
  const selected = [
    ...new Set(
      (params.get("selected") ?? "").split(",").filter((id) => uuid.test(id)),
    ),
  ].slice(0, 3);
  const eventId = params.get("event");
  const restaurantId = params.get("restaurant");
  const inquiry = params.get("inquiry") === "1";
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return safeReturnPath(`/restaurants?${next}`);
  };
  const browse: BrowseProps = {
    selected,
    restaurantId: restaurantId && uuid.test(restaurantId) ? restaurantId : null,
    onSelect: (ids) =>
      router.replace(href({ selected: ids.join(",") }), { scroll: false }),
    onOpen: (id) => router.replace(href({ restaurant: id }), { scroll: false }),
  };
  const start = (ids: string[]) => {
    const destination = href({
      selected: ids.join(","),
      restaurant: null,
      inquiry: "1",
    });
    if (status === "anonymous")
      router.push(`/auth?next=${encodeURIComponent(destination)}`);
    else router.push(destination, { scroll: false });
  };
  if (inquiry) {
    if (status !== "authenticated" || !account)
      return (
        <StepLayout
          title="예약 문의"
          onBack={() => router.push(href({ inquiry: null }))}
        >
          {status === "anonymous" ? (
            <>
              <StepHeading
                title="로그인하고 문의를 이어가세요"
                description="선택한 매장과 원래 작업으로 돌아와요."
              />
              <Link
                href={`/auth?next=${encodeURIComponent(href({}))}`}
                className={buttonStyles()}
              >
                로그인 · 회원가입
              </Link>
            </>
          ) : (
            <AuthScreen />
          )}
        </StepLayout>
      );
    if (!isFirstSetupComplete(account))
      return (
        <StepLayout
          title="예약 문의"
          onBack={() => router.push("/restaurants")}
        >
          <StepHeading title="첫 설정을 이어서 진행해 주세요" />
          <Link href={firstSetupPath(href({}))} className={buttonStyles()}>
            첫 설정 이어서 하기
          </Link>
        </StepLayout>
      );
    if (!eventId || !uuid.test(eventId))
      return (
        <StepLayout
          title="문의할 행사"
          onBack={() => router.push(href({ inquiry: null }))}
        >
          <StepHeading
            title="어떤 행사로 문의할까요?"
            description="모임과 명단은 선택이에요. 기존 문의가 있는 행사는 진행 상태로 연결돼요."
          />
          <EventPicker
            key={account.id}
            accountId={account.id}
            request={client.request.bind(client)}
            onSelect={(id) =>
              router.replace(href({ event: id }), { scroll: false })
            }
          />
        </StepLayout>
      );
    return (
      <InquiryFlow
        key={`${account.id}:${eventId}`}
        account={account}
        eventId={eventId}
        request={client.request.bind(client)}
        browse={browse}
      />
    );
  }
  return (
    <StepLayout title="매장 찾기" onBack={() => router.push("/")}>
      <StepHeading
        title="우리 행사에 맞는 매장을 찾아요"
        description="공개 매장은 로그인 없이 둘러볼 수 있어요. 문의는 내 행사를 선택한 뒤 접수해요."
      />
      <RestaurantBrowser {...browse} onInquiry={start} />
    </StepLayout>
  );
}

function InquiryFlow({
  account,
  eventId,
  request,
  browse,
}: {
  account: Account;
  eventId: string;
  request: SessionRequest;
  browse: BrowseProps;
}) {
  const router = useRouter();
  const event = useEvent(account.id, eventId, request);
  const existing = useQuery(inquiryQuery(account.id, eventId, request));
  if (
    (event.isError || existing.isError) &&
    (!event.data || existing.data === undefined)
  )
    return (
      <StepLayout
        title="예약 문의"
        onBack={() => router.push(`/events?event=${eventId}`)}
      >
        <ErrorState
          retry={() => {
            void event.refetch();
            void existing.refetch();
          }}
        >
          행사와 문의 상태를 확인하지 못했어요. 본인 행사인지 확인하거나 다시
          시도해 주세요.
        </ErrorState>
        <Link className="mt-5 text-link underline" href="/events">
          내 행사로 돌아가기
        </Link>
      </StepLayout>
    );
  if (!event.data || existing.data === undefined)
    return (
      <StepLayout title="예약 문의" onBack={() => router.push("/events")}>
        <LoadingState>행사와 기존 문의 확인 중…</LoadingState>
      </StepLayout>
    );
  if (existing.data)
    return (
      <StepLayout
        title="문의 진행 상태"
        onBack={() => router.push(`/events?event=${eventId}`)}
      >
        {existing.isError && (
          <ErrorState retry={() => void existing.refetch()}>
            최신 상태를 확인하지 못했어요. 마지막 접수 내역입니다.
          </ErrorState>
        )}
        <InquiryReceipt inquiry={existing.data} />
        <Button
          variant="outline"
          disabled={existing.isFetching}
          onClick={() => void existing.refetch()}
        >
          진행 상태 새로 확인
        </Button>
      </StepLayout>
    );
  return (
    <InquiryDraft
      unavailable={event.isError || existing.isError}
      retry={() => {
        void event.refetch();
        void existing.refetch();
      }}
      account={account}
      event={{
        id: eventId,
        version: event.data.version,
        name: event.data.name,
        scheduledAt: event.data.scheduledAt,
      }}
      request={request}
      browse={browse}
    />
  );
}

function InquiryDraft({
  unavailable,
  retry,
  account,
  event,
  request,
  browse,
}: {
  unavailable: boolean;
  retry: () => void;
  account: Account;
  event: {
    id: string;
    version: number;
    name: string;
    scheduledAt: string | null;
  };
  request: SessionRequest;
  browse: BrowseProps;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() =>
    initialConditions(account, event.scheduledAt),
  );
  const [step, setStep] = useState<"conditions" | "browse">("conditions");
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [requestKey] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const create = useCreateInquiry(account.id, event.id, request);
  const continueWith = (next: ConditionsValues) => {
    setValues(next);
    setError(undefined);
    setStep("browse");
    window.scrollTo(0, 0);
  };
  return (
    <StepLayout
      title="예약 문의"
      busy={create.isPending}
      onBack={() => {
        if (step === "browse") setStep("conditions");
        else router.push(`/events?event=${event.id}`);
      }}
    >
      <StepHeading
        title={
          step === "conditions"
            ? "매장에 어떤 조건을 전달할까요?"
            : "우리 행사에 맞는 매장을 찾아요"
        }
        description={
          step === "conditions"
            ? `${event.name} · 문의 접수 전까지 수정할 수 있어요.`
            : `${values.expectedGuests}명 · ${values.date} ${values.time} · ${values.region}`
        }
      />
      {unavailable && (
        <ErrorState retry={retry}>
          행사 상태 재조회에 실패했어요. 입력은 유지됩니다. 접수 전에 다시
          확인해 주세요.
        </ErrorState>
      )}
      {step === "conditions" ? (
        <ConditionsForm initial={values} onContinue={continueWith} />
      ) : (
        <RestaurantBrowser
          {...browse}
          restaurantId={confirmIds ? null : browse.restaurantId}
          initialRegion={values.region}
          conditions={{
            expectedGuests: Number(values.expectedGuests),
            seating: values.seating,
            space: values.space,
          }}
          onEditConditions={() => setStep("conditions")}
          onInquiry={(ids) => {
            browse.onSelect(ids);
            setConfirmIds(ids);
          }}
        />
      )}
      <FormError
        message={
          error ?? (create.error ? safeErrorMessage(create.error) : undefined)
        }
      />
      {confirmIds && (
        <Dialog
          labelledBy="inquiry-confirm-title"
          describedBy="inquiry-confirm-description"
          busy={create.isPending}
          initialFocusRef={cancel}
          onClose={() => setConfirmIds(null)}
        >
          <h2 id="inquiry-confirm-title" className="text-xl font-bold">
            {confirmIds.length}곳에 문의를 접수할까요?
          </h2>
          <p className="my-4 text-sm" id="inquiry-confirm-description">
            접수 후에는 조건 수정·매장 추가·같은 행사 재문의가 불가능해요. 실제
            문자 전송은 운영 확인 후 진행하며, 지금은 전달 대기로 접수돼요.
          </p>
          <p className="mb-5 text-sm">
            {event.name} · {values.expectedGuests}명<br />
            {values.date} {values.time} (한국 시간)
          </p>
          <FormError
            message={
              error ??
              (create.error ? safeErrorMessage(create.error) : undefined)
            }
          />
          <div className="mt-5 flex gap-2">
            <Button
              ref={cancel}
              variant="outline"
              className="flex-1"
              disabled={create.isPending}
              onClick={() => setConfirmIds(null)}
            >
              돌아가기
            </Button>
            <Button
              className="flex-1"
              loading={create.isPending}
              disabled={unavailable}
              onClick={() => {
                if (submitting.current || unavailable) return;
                const parsed = conditionsSchema.safeParse(values);
                if (!parsed.success) {
                  setError("날짜와 입력 조건을 다시 확인해 주세요.");
                  setConfirmIds(null);
                  setStep("conditions");
                  return;
                }
                submitting.current = true;
                create.mutate(
                  {
                    requestKey,
                    mode: "DIRECT",
                    expectedEventVersion: event.version,
                    restaurantIds: confirmIds,
                    conditions: inquiryConditions(parsed.data),
                    contact: {
                      name: parsed.data.contactName,
                      phone: parsed.data.contactPhone,
                    },
                  },
                  {
                    onSettled: () => {
                      submitting.current = false;
                    },
                  },
                );
              }}
            >
              문의 접수
            </Button>
          </div>
        </Dialog>
      )}
    </StepLayout>
  );
}
