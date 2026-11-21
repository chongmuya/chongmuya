"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StepLayout } from "@/shared/ui/step-layout";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { ApiError } from "@/shared/http/api-error";
import { isAccessError } from "@/shared/http/access-error";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { AttendanceRoster } from "./attendance-roster";
import { InviteParticipants } from "./invite-participants";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { roundsQuery, roundQuery } from "../api/attendance.api";
import { useAttendanceAction } from "../hooks/use-attendance-action";
import { stateLabel, reasonLabel } from "../lib/attendance-labels";
import type {
  RoundDetailDto,
  ReviewDto,
  AttendanceAnswer,
  ResolveReview,
} from "../types/attendance.types";
import type { OwnerProps } from "./event-roster";

export function AttendanceWorkspace({
  roundId,
  ...props
}: OwnerProps & { roundId: string | null }) {
  const router = useRouter();
  const reviewId = useSearchParams().get("review");
  const list = useQuery({
    ...roundsQuery(props.accountId, props.eventId, props.request),
    enabled: !(roundId && reviewId),
    refetchInterval: roundId ? false : 5000,
  });
  const [creating, setCreating] = useState(false);
  if (roundId && reviewId)
    return (
      <RoundDetail
        key={roundId}
        {...props}
        roundId={roundId}
        reviewId={reviewId}
      />
    );
  if (list.isError && (!list.data || isAccessError(list.error)))
    return <ErrorState retry={() => void list.refetch()} />;
  if (!list.data) return <LoadingState>참석 차수 확인 중…</LoadingState>;
  const selectedRoundId = roundId ?? list.data.rounds[0]?.id;
  const rosterHref = `/events?event=${props.eventId}&view=roster`;
  const roundPicker = (
    <nav aria-label="참석 차수" className="flex min-w-0 flex-wrap gap-1">
      {list.data.rounds.map((round) => (
        <Link
          key={round.id}
          href={`/events?event=${props.eventId}&view=attendance&round=${round.id}`}
          aria-current={round.id === selectedRoundId ? "page" : undefined}
          className={buttonStyles({
            variant: round.id === selectedRoundId ? "solid" : "outline",
            className: cn(
              "min-h-input min-w-[51px] px-3.5 font-medium",
              round.id !== selectedRoundId &&
                "border-placeholder text-secondary",
            ),
          })}
        >
          {round.title}
        </Link>
      ))}
      <Button
        variant="outline"
        onClick={() => setCreating(true)}
        className={cn(
          "min-h-input min-w-[51px] border-placeholder",
          selectedRoundId ? "px-0" : "gap-2 px-3.5 text-sm",
        )}
        aria-label="차수 만들기"
        aria-haspopup="dialog"
      >
        <Image
          src="/images/attendance/add-round.svg"
          alt=""
          width={13}
          height={13}
        />
        {!selectedRoundId && "차수 만들기"}
      </Button>
    </nav>
  );
  return (
    <section className="space-y-5">
      {list.isError && (
        <p role="alert">최신 정보를 불러오지 못했어요. 입력은 유지됩니다.</p>
      )}
      {selectedRoundId ? (
        <RoundDetail
          key={selectedRoundId}
          {...props}
          roundId={selectedRoundId}
          roundPicker={roundPicker}
        />
      ) : (
        <>
          {roundPicker}
          <p className="rounded-control bg-surface p-5 text-sm">
            차수를 만들어 참석을 받아 보세요.
          </p>
          <Link
            href={rosterHref}
            className={buttonStyles({
              variant: "outline",
              className: "w-full",
            })}
          >
            명단 수정
          </Link>
        </>
      )}
      {creating && (
        <CreateRound
          {...props}
          defaultTitle={list.data.nextTitle}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(
              `/events?event=${props.eventId}&view=attendance&round=${id}`,
            );
          }}
        />
      )}
    </section>
  );
}
const titleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "차수 제목을 입력해 주세요.")
    .max(100, "100자 이내로 입력해 주세요."),
});
function CreateRound({
  defaultTitle,
  onClose,
  onCreated,
  ...props
}: OwnerProps & {
  defaultTitle: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const action = useAttendanceAction(
      props.accountId,
      props.eventId,
      props.request,
    ),
    active = useActiveScreen();
  const form = useForm({
    resolver: zodResolver(titleSchema),
    defaultValues: { title: defaultTitle },
  });
  const pending = useRef<{
    kind: "create";
    requestKey: string;
    title: string;
  } | null>(null);
  const submitting = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = action.isPending || uncertain;
  useEffect(() => {
    if (!busy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);
  const save = (title: string) => {
    if (submitting.current) return;
    submitting.current = true;
    pending.current ??= {
      kind: "create",
      requestKey: crypto.randomUUID(),
      title,
    };
    action.mutate(pending.current, {
      onSuccess: (result) => {
        if (!active.current || !result || !("id" in result)) return;
        pending.current = null;
        onCreated(result.id);
      },
      onError: (error) => {
        if (!active.current) return;
        const unknown =
          !(error instanceof ApiError) ||
          error.status < 400 ||
          error.status >= 500;
        setUncertain(unknown);
        if (!unknown) pending.current = null;
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  return (
    <BottomSheet title="차수 만들기" busy={busy} onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void form.handleSubmit((values) => save(values.title))(event);
        }}
      >
        <FormField
          id="round-title"
          label="차수 제목"
          error={form.formState.errors.title?.message}
        >
          {(attributes) => (
            <Input
              {...attributes}
              {...form.register("title")}
              variant="pill"
              disabled={busy}
            />
          )}
        </FormField>
        <FormError
          message={
            action.error
              ? uncertain
                ? "차수 생성 결과를 확인하지 못했어요. 제목과 요청을 유지하고 다시 확인해 주세요."
                : safeErrorMessage(action.error)
              : undefined
          }
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          {uncertain ? (
            <Button
              className="flex-1"
              loading={action.isPending}
              onClick={() => {
                if (pending.current) save(pending.current.title);
              }}
            >
              같은 요청 다시 확인
            </Button>
          ) : (
            <Button className="flex-1" type="submit" loading={action.isPending}>
              만들기
            </Button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
function RoundDetail({
  roundId,
  roundPicker,
  reviewId,
  ...props
}: OwnerProps & {
  roundId: string;
  roundPicker?: ReactNode;
  reviewId?: string;
}) {
  const router = useRouter();
  const query = useQuery(
      roundQuery(props.accountId, props.eventId, roundId, props.request),
    ),
    action = useAttendanceAction(props.accountId, props.eventId, props.request);
  const [share, setShare] = useState(false),
    [closing, setClosing] = useState(false);
  function correct(
    person: RoundDetailDto["participants"][number],
    value: AttendanceAnswer | null,
  ) {
    action.mutate({
      kind: "override",
      roundId,
      participantId: person.id,
      expectedVersion: person.response.version,
      managerOverride: value,
    });
  }
  const closeReview = () =>
    router.replace(
      `/events?event=${props.eventId}&view=attendance&round=${roundId}`,
    );
  const failure = query.isError && (!query.data || isAccessError(query.error));
  if (failure || !query.data) {
    const state = failure ? (
      <ErrorState retry={() => void query.refetch()}>
        {isAccessError(query.error)
          ? "이 행사를 관리할 권한이 없어요."
          : undefined}
      </ErrorState>
    ) : (
      <LoadingState>차수 확인 중…</LoadingState>
    );
    return reviewId ? (
      <StepLayout title="제출한 사람 연결 확인" onBack={closeReview}>
        {state}
      </StepLayout>
    ) : (
      <div className="space-y-6">
        {roundPicker}
        {state}
      </div>
    );
  }
  const round = query.data;
  const review = round.reviews.find((item) => item.id === reviewId);
  if (reviewId)
    return (
      <StepLayout title="제출한 사람 연결 확인" onBack={closeReview}>
        {query.isError && (
          <ErrorState retry={() => void query.refetch()}>
            최신 응답을 확인하지 못했어요. 입력은 유지됩니다.
          </ErrorState>
        )}
        {review?.status === "PENDING" ? (
          <ResolveReviewPage
            key={review.id}
            {...props}
            roundId={roundId}
            review={review}
            people={round.participants}
            onClose={closeReview}
          />
        ) : (
          <p>
            {review ? "이미 처리한 응답이에요." : "확인 건을 찾을 수 없어요."}
          </p>
        )}
      </StepLayout>
    );
  return (
    <div className="space-y-6">
      {query.isError && (
        <p role="alert">최신 정보를 불러오지 못했어요. 입력은 유지됩니다.</p>
      )}
      <div className="flex items-start justify-between gap-3">
        {roundPicker}
        {!round.closedAt && (
          <button
            type="button"
            aria-haspopup="dialog"
            className="group flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-control text-xs leading-none text-secondary"
            onClick={() => setShare(true)}
          >
            <span className="grid size-10 place-items-center rounded-control bg-brand-ink transition-colors group-hover:bg-brand-ink-hover">
              <Image
                src="/images/attendance/invite.svg"
                alt=""
                width={24}
                height={24}
              />
            </span>
            참여자 초대
          </button>
        )}
      </div>
      <fieldset className="min-w-0 space-y-5">
        <AttendanceRoster
          people={round.participants}
          counts={round.counts}
          saving={action.isPending}
          onCorrect={correct}
        />
        {round.counts.pending > 0 && (
          <section className="space-y-3" aria-label="연결 확인 목록">
            <h3 className="text-lg font-bold">
              연결 확인 필요 · {round.counts.pending}건
            </h3>
            {round.reviews
              .filter((item) => item.status === "PENDING")
              .map((item) => (
                <article
                  key={item.id}
                  className="space-y-2 rounded-control bg-surface p-4"
                >
                  <strong className="text-sm">
                    {item.name} · {item.phoneLast4}
                  </strong>
                  <p className="text-sm">
                    제출 답변: {stateLabel(item.answer)}
                  </p>
                  <p className="text-xs text-muted">
                    {reasonLabel(item.reason)}
                    <br />
                    {new Date(item.submittedAt).toLocaleString("ko-KR")}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      router.push(
                        `/events?event=${props.eventId}&view=attendance&round=${roundId}&review=${item.id}`,
                      )
                    }
                  >
                    연결 확인
                  </Button>
                </article>
              ))}
          </section>
        )}
        {!!round.reviews.some((item) => item.status !== "PENDING") && (
          <details className="text-sm">
            <summary>처리 이력</summary>
            <ul className="mt-3 space-y-2">
              {round.reviews
                .filter((item) => item.status !== "PENDING")
                .map((item) => (
                  <li key={item.id}>
                    {item.name} · {item.phoneLast4} ·{" "}
                    {item.status === "EXCLUDED"
                      ? "제외"
                      : item.resolution === "KEEP"
                        ? "연결 · 기존 응답 유지"
                        : "연결 · 접수된 응답 적용"}
                  </li>
                ))}
            </ul>
          </details>
        )}
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        <div className="space-y-2 pt-2">
          <Link
            href={`/events?event=${props.eventId}&view=roster&round=${roundId}`}
            className={buttonStyles({
              variant: "outline",
              className: "w-full",
            })}
          >
            {round.participants.length ? "명단 수정" : "명단 추가"}
          </Link>
          <Button
            className="w-full"
            variant={round.closedAt ? "outline" : "solid"}
            disabled={!!round.closedAt || action.isPending}
            onClick={() => {
              action.reset();
              setClosing(true);
            }}
          >
            {round.closedAt ? "참여자 응답 마감됨" : "참여자 응답 마감"}
          </Button>
        </div>
        {share && (
          <InviteParticipants
            shareId={round.shareId}
            roundTitle={round.title}
            onClose={() => setShare(false)}
          />
        )}
        {closing && (
          <Dialog
            labelledBy="close-round-title"
            busy={action.isPending}
            onClose={() => setClosing(false)}
          >
            <h2 id="close-round-title" className="text-xl font-bold">
              참여자 응답을 마감할까요?
            </h2>
            <p className="my-5 text-sm">
              참여자의 제출과 수정이 중단돼요. 다시 열 수 없으며 총무의 상태
              수정과 연결 확인은 계속할 수 있어요.
            </p>
            <FormError
              message={
                action.error ? safeErrorMessage(action.error) : undefined
              }
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={action.isPending}
                onClick={() => setClosing(false)}
              >
                돌아가기
              </Button>
              <Button
                className="flex-1"
                loading={action.isPending}
                onClick={() =>
                  action.mutate(
                    { kind: "close", roundId },
                    { onSuccess: () => setClosing(false) },
                  )
                }
              >
                응답 마감 확정
              </Button>
            </div>
          </Dialog>
        )}
      </fieldset>
    </div>
  );
}
function ResolveReviewPage({
  review: currentReview,
  people,
  roundId,
  onClose,
  ...props
}: OwnerProps & {
  review: ReviewDto;
  people: RoundDetailDto["participants"];
  roundId: string;
  onClose: () => void;
}) {
  // Freeze both sides while the manager confirms. A background refresh must not silently authorize a newer response.
  const [review] = useState(currentReview);
  const [snapshot] = useState(people),
    [mode, setMode] = useState<"LINK" | "NEW" | "EXCLUDE">("LINK"),
    [personId, setPersonId] = useState(""),
    [choice, setChoice] = useState<"KEEP" | "APPLY" | null>(null);
  const action = useAttendanceAction(
    props.accountId,
    props.eventId,
    props.request,
  );
  const person = snapshot.find((item) => item.id === personId);
  const confirm = () => {
    const input: ResolveReview = {
      action: mode,
      expectedReviewVersion: review.version,
    };
    if (mode === "LINK" && person) {
      input.participantId = person.id;
      input.expectedParticipantVersion = person.version;
      input.expectedResponseVersion = person.response.version;
      if (choice) input.responseChoice = choice;
    }
    action.mutate(
      { kind: "resolve", roundId, reviewId: review.id, input },
      { onSuccess: onClose },
    );
  };
  return (
    <section>
      <h2 id="review-title" className="text-xl font-bold">
        제출한 사람 연결 확인
      </h2>
      <p className="my-4 text-sm">
        {review.name} · {review.phoneLast4}
        <br />
        접수된 응답: {stateLabel(review.answer)}
      </p>
      <fieldset disabled={action.isPending} className="space-y-3">
        <legend className="sr-only">처리 방법</legend>
        {(["LINK", "NEW", "EXCLUDE"] as const).map((value) => (
          <label
            key={value}
            className="flex min-h-11 items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="review-action"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {
              {
                LINK: "기존 행사 참여자에 연결",
                NEW: "행사에 새 사람으로 추가",
                EXCLUDE: "제외",
              }[value]
            }
          </label>
        ))}
        {mode === "LINK" && (
          <>
            <label className="block text-sm">
              연결 대상
              <select
                className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface p-2"
                value={personId}
                onChange={(event) => {
                  setPersonId(event.target.value);
                  setChoice(null);
                }}
              >
                <option value="">참여자 선택</option>
                {snapshot.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.name, item.phoneLast4, item.label]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </label>
            {person && (
              <p className="text-sm">
                기존 본인 응답: {stateLabel(person.response.selfAnswer)} /
                접수된 응답: {stateLabel(review.answer)}
              </p>
            )}
            {person?.response.selfAnswer && (
              <div className="space-y-3">
                {(["KEEP", "APPLY"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="response-choice"
                      checked={choice === value}
                      onChange={() => setChoice(value)}
                    />
                    {value === "KEEP" ? "기존 응답 유지" : "접수된 응답 적용"}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>
      <FormError
        message={action.error ? safeErrorMessage(action.error) : undefined}
      />
      {action.isError && (
        <p className="text-xs">
          닫은 뒤 최신 제출과 응답을 다시 확인해 주세요.
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={action.isPending}
          onClick={onClose}
        >
          닫기
        </Button>
        <Button
          className="flex-1"
          loading={action.isPending}
          disabled={
            mode === "LINK" &&
            (!person || (!!person.response.selfAnswer && !choice))
          }
          onClick={confirm}
        >
          처리 확정
        </Button>
      </div>
    </section>
  );
}
