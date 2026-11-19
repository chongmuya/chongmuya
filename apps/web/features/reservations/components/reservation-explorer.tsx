"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import {
  RestaurantBrowser,
  useSelectedRestaurants,
} from "@/features/restaurants/client";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { inquiryQuery } from "../api/reservations.api";
import { useCreateInquiry } from "../hooks/use-create-inquiry";
import {
  initialConditions,
  inquiryConditions,
  conditionsSchema,
} from "../schemas/conditions.schema";
import { ConditionsForm } from "./conditions-form";
import { ConditionSummary } from "./condition-summary";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { BrowseNavigation } from "@/features/restaurants/types";
import { serviceArea } from "@/shared/lib/service-area";
import { ApiError } from "@/shared/http/api-error";
import { InquiryReview } from "./inquiry-review";
import { isAccessError } from "@/shared/http/access-error";
import type { ReservationRequest } from "../types/inquiry.types";
import { InquiryReceipt } from "./reservation-progress";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function ReservationExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const { account, status, client } = useAuth();
  const [selected, setSelected] = useState(() =>
    [
      ...new Set(
        (params.get("selected") ?? "").split(",").filter((id) => uuid.test(id)),
      ),
    ].slice(0, 3),
  );
  // Selection belongs to this flow. Older history entries must not resurrect removed stores.
  useEffect(() => {
    const value = selected.join(",");
    if ((params.get("selected") ?? "") === value) return;
    const next = new URLSearchParams(params);
    next.delete("region");
    if (value) next.set("selected", value);
    else next.delete("selected");
    window.history.replaceState(
      {
        restaurantNavigation:
          window.history.state?.restaurantNavigation === true,
      },
      "",
      safeReturnPath(`/restaurants?${next}`),
    );
  }, [params, selected]);
  const eventId = params.get("event");
  const restaurantId = params.get("restaurant");
  const inquiry = params.get("inquiry") === "1";
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.delete("region");
    if (selected.length) next.set("selected", selected.join(","));
    else next.delete("selected");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return safeReturnPath(`/restaurants?${next}`);
  };
  const navigate = (changes: Record<string, string | null>) => {
    if (changes.selected !== undefined)
      setSelected(
        (changes.selected ?? "")
          .split(",")
          .filter((id) => uuid.test(id))
          .slice(0, 3),
      );
    window.history.pushState({ restaurantNavigation: true }, "", href(changes));
    window.scrollTo(0, 0);
  };
  const back = () => {
    if (window.history.state?.restaurantNavigation) router.back();
    else if (params.get("view") === "map" || restaurantId)
      router.replace(href({ view: "list", restaurant: null }));
    else router.push("/");
  };
  const browse: BrowseNavigation = {
    selected,
    restaurantId: restaurantId && uuid.test(restaurantId) ? restaurantId : null,
    view:
      params.get("view") === "map" ? "map" : restaurantId ? "detail" : "list",
    page: Math.max(1, Math.min(9999, Number(params.get("page")) || 1)),
    onSelect: setSelected,
    onNavigate: navigate,
  };
  const start = (ids: string[]) => {
    setSelected(ids);
    const destination = href({
      selected: ids.join(","),
      restaurant: null,
      inquiry: "1",
      view: "conditions",
    });
    if (status === "anonymous")
      router.push(`/auth?next=${encodeURIComponent(destination)}`);
    else router.push(destination, { scroll: false });
  };
  if (inquiry) {
    if (status !== "authenticated" || !account)
      return (
        <StepLayout
          variant="flow"
          title=""
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
          variant="flow"
          title=""
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
          variant="flow"
          title="문의할 행사"
          onBack={() => router.push(href({ inquiry: null }))}
        >
          <EventPicker
            key={account.id}
            accountId={account.id}
            request={client.request.bind(client)}
            onSelect={(id) => navigate({ event: id, view: "conditions" })}
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
    <StepLayout
      variant="flow"
      title={
        browse.view === "map"
          ? "매장 지도"
          : browse.view === "detail"
            ? "매장 상세"
            : ""
      }
      onBack={back}
    >
      {browse.view === "list" && (
        <StepHeading
          title="매장 찾기"
          description={serviceArea.label}
          className="mb-7"
        />
      )}
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
  browse: BrowseNavigation;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const event = useEvent(account.id, eventId, request);
  const existing = useQuery({
    ...inquiryQuery(account.id, eventId, request),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  if (
    (event.isError || existing.isError) &&
    (!event.data ||
      existing.data === undefined ||
      isAccessError(event.error) ||
      isAccessError(existing.error))
  )
    return (
      <StepLayout
        variant="flow"
        title=""
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
        <Link className="mt-5 text-link underline" href="/">
          내 행사로 돌아가기
        </Link>
      </StepLayout>
    );
  if (!event.data || existing.data === undefined)
    return (
      <StepLayout variant="flow" title="" onBack={() => router.push("/events")}>
        <LoadingState>행사와 기존 문의 확인 중…</LoadingState>
      </StepLayout>
    );
  const previous =
    existing.data?.canReinquire && params.get("reinquire") === existing.data.id
      ? existing.data
      : undefined;
  if (existing.data && !previous)
    return (
      <StepLayout
        variant="flow"
        title="문의 진행 상태"
        onBack={() => router.push(`/events?event=${eventId}`)}
      >
        {existing.isError && (
          <ErrorState retry={() => void existing.refetch()}>
            최신 상태를 확인하지 못했어요. 마지막 접수 내역입니다.
          </ErrorState>
        )}
        <InquiryReceipt inquiry={existing.data} showEventLink />
      </StepLayout>
    );
  return (
    <InquiryDraft
      key={previous?.id ?? "initial"}
      previous={previous}
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
  previous,
  unavailable,
  retry,
  account,
  event,
  request,
  browse,
}: {
  previous?: ReservationRequest;
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
  browse: BrowseNavigation;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = useActiveScreen();
  const [values, setValues] = useState(() => {
    const initial = initialConditions(
      account,
      previous?.snapshot.startsAt ?? event.scheduledAt,
    );
    const p = previous?.snapshot;
    return p
      ? {
          ...initial,
          expectedGuests: String(p.expectedGuests),
          seating: p.seating,
          space: p.space,
          seatingImportance: p.seatingImportance ?? ("PREFERRED" as const),
          spaceImportance: p.spaceImportance ?? ("PREFERRED" as const),
          budgetBasis: p.budgetBasis ?? ("PER_PERSON" as const),
          budgetAmount: p.budgetAmount ? String(p.budgetAmount) : "",
          alcohol: p.alcohol ?? ("UNKNOWN" as const),
          additionalRequests: p.additionalRequests ?? "",
        }
      : initial;
  });
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const scheduleChanged =
    !!previous &&
    conditionsSchema.safeParse(values).success &&
    inquiryConditions(values).startsAt !== event.scheduledAt;
  const [error, setError] = useState<string>();
  const valid = conditionsSchema.safeParse(values).success;
  const step =
    !valid || params.get("view") === "conditions" || !params.get("view")
      ? "conditions"
      : params.get("view") === "review"
        ? "review"
        : "browse";
  const requestIdentity = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const targets = useSelectedRestaurants(browse.selected);
  const targetState = targets.some((target) => target.isError)
    ? "error"
    : targets.some((target) => target.isPending)
      ? "loading"
      : targets.some(
            ({ data }) =>
              !data?.inquiryAvailable ||
              data.maxCapacity === null ||
              data.maxCapacity < Number(values.expectedGuests),
          )
        ? "unavailable"
        : "ready";
  const [confirmationVersion, setConfirmationVersion] = useState(event.version);
  const submitting = useRef(false);
  const create = useCreateInquiry(account.id, event.id, request);
  const review = (ids: string[]) => {
    setError(undefined);
    create.reset();
    setConfirmationVersion(event.version);
    browse.onNavigate({
      selected: ids.join(","),
      restaurant: null,
      view: "review",
    });
  };
  const submit = () => {
    if (
      submitting.current ||
      unavailable ||
      targetState !== "ready" ||
      !browse.selected.length ||
      (scheduleChanged && !scheduleConfirmed)
    )
      return;
    const parsed = conditionsSchema.safeParse(values);
    if (!parsed.success) {
      setError("날짜와 입력 조건을 다시 확인해 주세요.");
      browse.onNavigate({ view: "conditions", restaurant: null });
      return;
    }
    if (confirmationVersion !== event.version) {
      setConfirmationVersion(event.version);
      setError(
        "행사 정보가 변경됐어요. 최신 행사명과 조건을 확인한 뒤 다시 보내 주세요.",
      );
      return;
    }
    submitting.current = true;
    const body = {
      mode: "DIRECT" as const,
      expectedEventVersion: confirmationVersion,
      previousRequestId: previous?.id,
      expectedRequestVersion: previous?.version,
      updateEventSchedule: scheduleConfirmed,
      restaurantIds: browse.selected,
      conditions: inquiryConditions(parsed.data),
      contact: {
        name: parsed.data.contactName,
        phone: parsed.data.contactPhone,
      },
    };
    const fingerprint = JSON.stringify(body);
    if (requestIdentity.current?.fingerprint !== fingerprint)
      requestIdentity.current = { fingerprint, key: crypto.randomUUID() };
    create.mutate(
      { ...body, requestKey: requestIdentity.current.key },
      {
        onError: (cause) => {
          if (!active.current) return;
          if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
            setError(
              "행사가 변경됐어요. 입력과 선택은 유지됩니다. 최신 행사 정보를 확인해 주세요.",
            );
            browse.onNavigate({ view: "conditions", restaurant: null });
          }
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  return (
    <StepLayout
      variant="flow"
      title={
        step === "review"
          ? "문의 보내기"
          : step === "conditions"
            ? "문의 조건"
            : browse.view === "map"
              ? "매장 지도"
              : browse.view === "detail"
                ? "매장 상세"
                : "매장 선택"
      }
      busy={create.isPending}
      onBack={() => {
        if (window.history.state?.restaurantNavigation) router.back();
        else if (step !== "conditions")
          browse.onNavigate({ view: "conditions", restaurant: null });
        else router.push(`/events?event=${event.id}`);
      }}
    >
      {(step !== "browse" || browse.view === "list") && (
        <StepHeading
          className="mb-7"
          title={
            step === "conditions"
              ? "매장에 어떤 조건을 전달할까요?"
              : step === "review"
                ? `${browse.selected.length}곳에 문의를 보낼까요?`
                : "우리 모임에 맞는 매장을 찾아요"
          }
          description={event.name}
        />
      )}
      {unavailable && (
        <ErrorState retry={retry}>
          최신 행사 상태를 확인하지 못했어요. 다시 확인한 뒤 보내 주세요.
        </ErrorState>
      )}
      {previous && (
        <p className="mb-5 text-sm text-muted">
          {previous.round ?? 1}회차는 보존하고 새 회차로 문의해요. 제출 전에
          매장 답변이 바뀌면 다시 확인해야 해요.
        </p>
      )}
      {step === "review" && scheduleChanged && (
        <label className="mb-5 flex gap-3 rounded-control bg-choice p-4 text-sm">
          <input
            type="checkbox"
            checked={scheduleConfirmed}
            onChange={(e) => setScheduleConfirmed(e.target.checked)}
          />
          새 문의 일시로 행사 대표 일정도 갱신합니다. 이전 회차의 일시는
          유지됩니다.
        </label>
      )}
      {step === "conditions" ? (
        <ConditionsForm
          initial={values}
          onChange={setValues}
          nextLabel={
            browse.selected.length ? "보낼 내용 확인하기" : "매장 선택하기"
          }
          onContinue={(next) => {
            setValues(next);
            setError(undefined);
            if (browse.selected.length) review(browse.selected);
            else
              browse.onNavigate({
                view: "list",
                restaurant: null,
              });
          }}
        />
      ) : step === "review" ? (
        <InquiryReview
          values={values}
          browse={browse}
          targets={targets}
          targetState={targetState}
          unavailable={unavailable || (scheduleChanged && !scheduleConfirmed)}
          sending={create.isPending}
          onSubmit={submit}
          error={
            error ?? (create.error ? safeErrorMessage(create.error) : undefined)
          }
        />
      ) : (
        <>
          {browse.view === "list" && (
            <div className="mb-6">
              <ConditionSummary conditions={inquiryConditions(values)} />
            </div>
          )}
          <RestaurantBrowser
            {...browse}
            expectedGuests={Number(values.expectedGuests)}
            onEditConditions={() =>
              browse.onNavigate({ view: "conditions", restaurant: null })
            }
            onInquiry={review}
          />
        </>
      )}
      {step !== "review" && <FormError message={error} />}
    </StepLayout>
  );
}
