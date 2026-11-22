"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAuth,
  AuthScreen,
  firstSetupPath,
  isFirstSetupComplete,
  safeReturnPath,
} from "@/features/auth/client";
import type { Account, SessionRequest } from "@/features/auth/types";
import {
  EventGuestEstimateForm,
  EventPicker,
  eventKeys,
  useEvent,
} from "@/features/events/client";
import { useGroups } from "@/features/groups/client";
import {
  canInquireAtRestaurants,
  RestaurantBrowser,
  restaurantInquiryIssue,
  useSelectedRestaurants,
} from "@/features/restaurants/client";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { Button, buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { NoticeDialog } from "@/shared/ui/notice-dialog";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { inquiryQuery } from "../api/reservations.api";
import { useCreateInquiry } from "../hooks/use-create-inquiry";
import {
  initialConditions,
  inquiryConditions,
  conditionsSchema,
  savedInquirySchedule,
} from "../schemas/conditions.schema";
import { ConditionsForm } from "./conditions-form";
import { ConditionSummary } from "./condition-summary";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { BrowseNavigation } from "@/features/restaurants/types";
import { serviceArea } from "@/shared/lib/service-area";
import { ApiError } from "@/shared/http/api-error";
import { koreanDateInput } from "@/shared/lib/korean-date";
import { InquiryReview } from "./inquiry-review";
import { isAccessError } from "@/shared/http/access-error";
import type { ReservationRequest } from "../types/inquiry.types";
import { DecisionReceipt } from "./reservation-progress";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const restaurantDetailLayout =
  "bg-surface pt-[max(8px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] [&>header]:mb-2";
const koreanWeekday = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
  timeZone: "Asia/Seoul",
});

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
    const next = new URLSearchParams(window.location.search);
    if ((next.get("selected") ?? "") === value) return;
    next.delete("region");
    if (value) next.set("selected", value);
    else next.delete("selected");
    window.history.replaceState(
      {
        restaurantNavigation:
          window.history.state?.restaurantNavigation === true,
        restaurantInquirySheet:
          window.history.state?.restaurantInquirySheet === true,
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
  const navigate: BrowseNavigation["onNavigate"] = (changes, options) => {
    if (changes.selected !== undefined)
      setSelected(
        (changes.selected ?? "")
          .split(",")
          .filter((id) => uuid.test(id))
          .slice(0, 3),
      );
    if (options?.replace)
      window.history.replaceState(
        {
          restaurantNavigation:
            window.history.state?.restaurantNavigation === true,
        },
        "",
        href(changes),
      );
    else
      window.history.pushState(
        { restaurantNavigation: true },
        "",
        href(changes),
      );
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
      className={browse.view === "detail" ? restaurantDetailLayout : undefined}
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
  const groups = useGroups(account.id, request);
  const existing = useQuery({
    ...inquiryQuery(account.id, eventId, request),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const [pausedInquiryId, setPausedInquiryId] = useState<string | null>(null);
  const previous =
    existing.data?.canReinquire && params.get("reinquire") === existing.data.id
      ? existing.data
      : undefined;
  const received = !!existing.data && !previous;
  useEffect(() => {
    if (received && window.history.state?.restaurantInquirySheet)
      window.history.back();
  }, [received]);
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
        <DecisionReceipt
          key={existing.data.id}
          inquiry={existing.data}
          accountId={account.id}
          request={request}
          showEventLink
        />
        {pausedInquiryId === existing.data.id && (
          <NoticeDialog
            title="문자 전송 일시 중지"
            description="현재 문자 전송 서비스를 이용할 수 없습니다. 문의는 저장됐어요."
            onClose={() => setPausedInquiryId(null)}
          >
            <Button onClick={() => setPausedInquiryId(null)}>확인</Button>
          </NoticeDialog>
        )}
      </StepLayout>
    );
  if (event.data.expectedGuests == null)
    return (
      <StepLayout
        variant="flow"
        title=""
        onBack={() => router.push(`/events?event=${eventId}`)}
      >
        <StepHeading
          title="행사 예상 인원을 등록해 주세요"
          description={event.data.name}
        />
        {event.isError || existing.isError ? (
          <ErrorState
            retry={() => {
              void event.refetch();
              void existing.refetch();
            }}
          />
        ) : (
          <EventGuestEstimateForm
            accountId={account.id}
            event={event.data}
            request={request}
          />
        )}
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
      groupType={
        groups.data?.find((group) => group.id === event.data.groupId)?.groupType
      }
      event={{
        id: eventId,
        version: event.data.version,
        name: event.data.name,
        scheduledAt: event.data.scheduledAt,
        expectedGuests: event.data.expectedGuests,
      }}
      request={request}
      browse={browse}
      onSaved={(inquiry) => {
        if (
          inquiry.targets.some((t) => t.delivery?.errorCode === "SMS_DISABLED")
        )
          setPausedInquiryId(inquiry.id);
      }}
    />
  );
}

function InquiryDraft({
  previous,
  unavailable,
  retry,
  account,
  groupType,
  event,
  request,
  browse,
  onSaved,
}: {
  previous?: ReservationRequest;
  unavailable: boolean;
  retry: () => void;
  account: Account;
  groupType?: string | null;
  event: {
    id: string;
    version: number;
    name: string;
    scheduledAt: string | null;
    expectedGuests: number;
  };
  request: SessionRequest;
  browse: BrowseNavigation;
  onSaved: (inquiry: ReservationRequest) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = useActiveScreen();
  const cache = useQueryClient();
  const { expectedGuests } = event;
  const savedSchedule = previous
    ? null
    : savedInquirySchedule(event.scheduledAt);
  const [draftValues, setValues] = useState(() => {
    const initial = initialConditions(
      account,
      previous?.snapshot.startsAt ?? event.scheduledAt,
    );
    const p = previous?.snapshot;
    return p
      ? {
          ...initial,
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
  const values = savedSchedule
    ? { ...draftValues, date: savedSchedule.date, time: savedSchedule.time }
    : draftValues;
  const valid = conditionsSchema.safeParse(values).success;
  const conditions = valid
    ? { ...inquiryConditions(values, savedSchedule?.startsAt), expectedGuests }
    : null;
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const scheduleChanged =
    !!previous && !!conditions && conditions.startsAt !== event.scheduledAt;
  const [error, setError] = useState<string>();
  const view = params.get("view");
  const legacyReview = !previous && view === "review";
  const browseView = legacyReview ? "list" : browse.view;
  const needsConditions = !conditions && !!view && view !== "conditions";
  useEffect(() => {
    if (!legacyReview && !needsConditions) return;
    const next = new URLSearchParams(window.location.search);
    next.set("view", needsConditions ? "conditions" : "list");
    next.delete("restaurant");
    window.history.replaceState(
      {
        restaurantNavigation:
          window.history.state?.restaurantNavigation === true,
      },
      "",
      safeReturnPath(`/restaurants?${next}`),
    );
  }, [legacyReview, needsConditions]);
  const step =
    !conditions || view === "conditions" || !view
      ? "conditions"
      : previous && view === "review"
        ? "review"
        : "browse";
  const requestIdentity = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const targets = useSelectedRestaurants(browse.selected);
  const issues = targets.map((target) =>
    restaurantInquiryIssue(target, expectedGuests),
  );
  const targetState = issues.includes("error")
    ? "error"
    : issues.includes("loading")
      ? "loading"
      : issues.some(Boolean)
        ? "unavailable"
        : "ready";
  const [confirmationVersion, setConfirmationVersion] = useState(event.version);
  const submitting = useRef(false);
  const create = useCreateInquiry(account.id, event.id, request, onSaved);
  const versionChanged = confirmationVersion !== event.version;
  const versionConflict =
    create.error instanceof ApiError &&
    create.error.code === "VERSION_CONFLICT";
  const awaitingEvent =
    versionConflict && create.variables?.expectedEventVersion === event.version;
  const submissionError =
    error ??
    (create.error && !versionConflict
      ? safeErrorMessage(create.error)
      : undefined);
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
      awaitingEvent ||
      !browse.selected.length ||
      !canInquireAtRestaurants(cache, browse.selected, expectedGuests) ||
      (scheduleChanged && !scheduleConfirmed)
    )
      return;
    const parsed = conditionsSchema.safeParse(values);
    if (!parsed.success) {
      setError("날짜와 입력 조건을 다시 확인해 주세요.");
      if (previous) browse.onNavigate({ view: "conditions", restaurant: null });
      return;
    }
    if (
      cache.getQueryData<{ version: number }>(
        eventKeys.detail(account.id, event.id),
      )?.version !== event.version
    )
      return;
    if (versionChanged) {
      if (!previous) return;
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
      conditions: inquiryConditions(parsed.data, savedSchedule?.startsAt),
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
          if (
            previous &&
            cause instanceof ApiError &&
            cause.code === "VERSION_CONFLICT"
          ) {
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
      className={
        step === "browse" && browseView === "detail"
          ? restaurantDetailLayout
          : undefined
      }
      title={
        step === "review"
          ? "문의 보내기"
          : step === "browse" && browseView === "map"
            ? "매장 지도"
            : step === "browse" && browseView === "detail"
              ? "매장 상세"
              : ""
      }
      busy={create.isPending}
      onBack={() => {
        if (window.history.state?.restaurantNavigation) router.back();
        else if (step === "browse" && browseView !== "list")
          browse.onNavigate(
            { view: "list", restaurant: null },
            { replace: true },
          );
        else if (step !== "conditions")
          browse.onNavigate(
            { view: "conditions", restaurant: null },
            { replace: true },
          );
        else router.push(`/events?event=${event.id}`);
      }}
    >
      {(step !== "browse" || browseView === "list") && (
        <StepHeading
          className={step === "review" ? "mb-7" : "mb-5 break-keep"}
          title={
            step === "conditions"
              ? "매장에 어떤 조건을 전달할까요?"
              : step === "review"
                ? `${browse.selected.length}곳에 문의를 보낼까요?`
                : "우리 모임에 맞는 매장을 찾아요"
          }
          description={
            step === "browse"
              ? "선택한 매장에 문자로 문의를 보내요. 답변이 오면 알려드려요. 매장을 최대 3곳 선택할 수 있어요."
              : step === "review"
                ? event.name
                : undefined
          }
        />
      )}
      {unavailable && (step !== "browse" || previous) && (
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
          key={savedSchedule?.startsAt ?? "editable"}
          initial={values}
          expectedGuests={expectedGuests}
          savedStartsAt={savedSchedule?.startsAt}
          groupType={groupType}
          onChange={setValues}
          nextLabel={
            previous && browse.selected.length
              ? "보낼 내용 확인하기"
              : "매장 선택하기"
          }
          onContinue={(next) => {
            setValues(next);
            setError(undefined);
            setScheduleConfirmed(false);
            if (previous && browse.selected.length) review(browse.selected);
            else
              browse.onNavigate({
                view: "list",
                restaurant: null,
              });
          }}
        />
      ) : step === "review" && conditions ? (
        <InquiryReview
          conditions={conditions}
          contact={{ name: values.contactName, phone: values.contactPhone }}
          browse={browse}
          targets={targets}
          targetState={targetState}
          unavailable={
            unavailable ||
            awaitingEvent ||
            (scheduleChanged && !scheduleConfirmed)
          }
          sending={create.isPending}
          onSubmit={submit}
          error={submissionError}
        />
      ) : (
        conditions && (
          <>
            {browseView === "list" && (
              <div className="mb-6">
                <ConditionSummary conditions={conditions} />
              </div>
            )}
            <RestaurantBrowser
              {...browse}
              view={browseView}
              restaurantId={legacyReview ? null : browse.restaurantId}
              expectedGuests={expectedGuests}
              onEditConditions={() =>
                browse.onNavigate({ view: "conditions", restaurant: null })
              }
              onInquiry={previous ? review : undefined}
              inquirySheet={
                previous
                  ? undefined
                  : {
                      summary: <InquirySheetSummary conditions={conditions} />,
                      notice:
                        unavailable || awaitingEvent ? (
                          <ErrorState retry={retry}>
                            최신 행사 상태를 확인하지 못했어요. 다시 확인한 뒤
                            보내 주세요.
                          </ErrorState>
                        ) : versionChanged ? (
                          <div
                            role="alert"
                            className="my-3 space-y-2 rounded-control bg-choice p-3 text-sm"
                          >
                            <p>
                              행사 정보가 변경됐어요. 위 일정과 최신 행사명을
                              확인해 주세요.
                            </p>
                            <p className="font-semibold wrap-break-word">
                              {event.name}
                            </p>
                            <Button
                              variant="outline"
                              disabled={create.isPending}
                              onClick={() => {
                                setConfirmationVersion(event.version);
                                setError(undefined);
                                create.reset();
                              }}
                            >
                              최신 행사 정보 확인
                            </Button>
                          </div>
                        ) : null,
                      disabled: unavailable || awaitingEvent || versionChanged,
                      sending: create.isPending,
                      onSubmit: submit,
                      error: submissionError,
                    }
              }
            />
          </>
        )
      )}
      {step !== "review" && <FormError message={error} />}
    </StepLayout>
  );
}

function InquirySheetSummary({
  conditions: { startsAt, expectedGuests },
}: {
  conditions: { startsAt: string; expectedGuests: number };
}) {
  const local = koreanDateInput(startsAt);
  return (
    <p className="mb-3 text-sm text-secondary">
      <time dateTime={startsAt}>
        {local.slice(5, 10).replace("-", ".")} (
        {koreanWeekday.format(new Date(startsAt))}) {local.slice(11, 16)}
      </time>
      {" · "}
      {expectedGuests}명
    </p>
  );
}
