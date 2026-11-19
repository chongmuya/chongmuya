"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";
import { StepLayout } from "@/shared/ui/step-layout";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { isAccessError } from "@/shared/http/access-error";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { AttendanceRoster } from "./attendance-roster";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { roundsQuery, roundQuery } from "../api/attendance.api";
import { useAttendanceAction } from "../hooks/use-attendance-action";
import { stateLabel, reasonLabel } from "../lib/attendance-labels";
import type {
  AttendanceCounts,
  RoundDto,
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
  const router = useRouter(),
    params = useSearchParams(),
    list = useQuery({
      ...roundsQuery(props.accountId, props.eventId, props.request),
      enabled: !(roundId && params.get("review")),
      refetchInterval: roundId ? false : 5000,
    });
  const [creating, setCreating] = useState(false);
  if (roundId && params.get("review"))
    return <RoundDetail key={roundId} {...props} roundId={roundId} />;
  if (list.isError && !list.data)
    return <ErrorState retry={() => void list.refetch()} />;
  if (!list.data) return <LoadingState>참석 차수 확인 중…</LoadingState>;
  return (
    <section className="space-y-5">
      {list.isError && (
        <p role="alert">
          {isAccessError(list.error)
            ? "이 행사를 관리할 권한이 없어요."
            : "최신 정보를 불러오지 못했어요. 입력은 유지됩니다."}
        </p>
      )}
      <fieldset
        disabled={isAccessError(list.error)}
        className="min-w-0 space-y-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">참석 관리</h2>
          <Button variant="outline" onClick={() => setCreating(true)}>
            차수 만들기
          </Button>
        </div>
        {roundId && (
          <nav aria-label="참석 차수" className="flex flex-wrap gap-2">
            {list.data.rounds.map((round) => (
              <Link
                key={round.id}
                href={`/events?event=${props.eventId}&view=attendance&round=${round.id}`}
                aria-current={round.id === roundId ? "page" : undefined}
                className={cn(
                  "rounded-pill border border-brand px-4 py-2 text-sm",
                  round.id === roundId
                    ? "bg-brand-action text-white"
                    : "text-brand-action",
                )}
              >
                {round.title}
              </Link>
            ))}
          </nav>
        )}
        {roundId ? (
          <RoundDetail key={roundId} {...props} roundId={roundId} />
        ) : list.data.rounds.length ? (
          <ul className="space-y-3">
            {list.data.rounds.map((round) => (
              <li key={round.id}>
                <Link
                  className="block space-y-3 rounded-control bg-surface p-5 shadow-card"
                  href={`/events?event=${props.eventId}&view=attendance&round=${round.id}`}
                >
                  <strong>{round.title}</strong>
                  <p className="text-xs text-muted">
                    {round.closedAt ? "참여자 응답 마감" : "응답 받는 중"}
                  </p>
                  <Counts counts={round.counts} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-control bg-surface p-5 text-sm">
            차수를 만들어 참석을 받아 보세요.
          </p>
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
      </fieldset>
    </section>
  );
}
function Counts({ counts }: { counts: AttendanceCounts }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm" aria-label="최종 참석 집계">
      <span>참석 {counts.attending}명</span>
      <span>불참 {counts.absent}명</span>
      <span>미응답 {counts.unanswered}명</span>
      {counts.pending > 0 && <span>연결할 응답 {counts.pending}건</span>}
    </div>
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
  const [requestKey] = useState(() => crypto.randomUUID()),
    action = useAttendanceAction(props.accountId, props.eventId, props.request),
    active = useActiveScreen();
  const form = useForm({
    resolver: zodResolver(titleSchema),
    defaultValues: { title: defaultTitle },
  });
  return (
    <BottomSheet title="차수 만들기" busy={action.isPending} onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) =>
          action.mutate(
            { kind: "create", requestKey, title: values.title },
            {
              onSuccess: (result) => {
                if (active.current && "id" in result) onCreated(result.id);
              },
            },
          ),
        )}
      >
        <FormField
          id="round-title"
          label="차수 제목"
          error={form.formState.errors.title?.message}
        >
          {(attributes) => (
            <Input {...attributes} {...form.register("title")} variant="pill" />
          )}
        </FormField>
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={action.isPending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button className="flex-1" type="submit" loading={action.isPending}>
            만들기
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
function RoundDetail({ roundId, ...props }: OwnerProps & { roundId: string }) {
  const params = useSearchParams(),
    router = useRouter();
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
  if (query.isError && !query.data)
    return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return <LoadingState>차수 확인 중…</LoadingState>;
  const round = query.data;
  const reviewId = params.get("review");
  const review = round.reviews.find((r) => r.id === reviewId);
  if (reviewId)
    return (
      <StepLayout
        title="제출한 사람 연결 확인"
        onBack={() =>
          router.replace(
            `/events?event=${props.eventId}&view=attendance&round=${roundId}`,
          )
        }
      >
        {query.isError && (
          <ErrorState retry={() => void query.refetch()}>
            최신 응답을 확인하지 못했어요. 입력은 유지됩니다.
          </ErrorState>
        )}
        <fieldset disabled={isAccessError(query.error)} className="min-w-0">
          {review ? (
            <ResolveReviewPage
              key={review.id}
              {...props}
              roundId={roundId}
              review={review}
              people={round.participants}
              onClose={() =>
                router.replace(
                  `/events?event=${props.eventId}&view=attendance&round=${roundId}`,
                )
              }
            />
          ) : (
            <p>확인 건을 찾을 수 없어요.</p>
          )}
        </fieldset>
      </StepLayout>
    );
  return (
    <div className="space-y-5">
      {query.isError && (
        <p role="alert">
          {isAccessError(query.error)
            ? "이 행사를 관리할 권한이 없어요."
            : "최신 정보를 불러오지 못했어요. 입력은 유지됩니다."}
        </p>
      )}
      <fieldset
        disabled={isAccessError(query.error)}
        className="min-w-0 space-y-5"
      >
        <div className="rounded-control bg-surface p-5 shadow-card">
          <Counts counts={round.counts} />
        </div>
        <div className="flex gap-2">
          {!round.closedAt && (
            <Button className="flex-1" onClick={() => setShare(true)}>
              링크 · QR 공유
            </Button>
          )}
          <Button
            className="flex-1"
            variant="outline"
            disabled={!!round.closedAt || action.isPending}
            onClick={() => setClosing(true)}
          >
            {round.closedAt ? "참여자 응답 마감됨" : "참여자 응답 마감"}
          </Button>
        </div>
        <AttendanceRoster
          people={round.participants}
          eventId={props.eventId}
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
        {share && <ShareRound round={round} onClose={() => setShare(false)} />}
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
function ShareRound({
  round,
  onClose,
}: {
  round: RoundDto;
  onClose: () => void;
}) {
  const [url] = useState(
      () =>
        new URL(`/attendance/${round.shareId}`, window.location.origin).href,
    ),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  return (
    <BottomSheet title={`${round.title} 참석 링크 공유`} onClose={onClose}>
      <QRCodeSVG
        value={url}
        size={250}
        marginSize={4}
        title={`${round.title} 참석 응답 QR`}
        className="mx-auto h-auto max-w-full"
      />
      <a
        href={url}
        className="mb-4 block break-all text-xs text-link underline"
      >
        {url}
      </a>
      <Button
        className="w-full"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => {
              setCopied(true);
              setCopyError(false);
            },
            () => setCopyError(true),
          );
        }}
      >
        {copied ? "링크를 복사했어요" : "링크 복사"}
      </Button>
      {copyError && (
        <p role="status" className="text-xs">
          자동 복사를 사용할 수 없어요. 위 링크를 길게 눌러 복사해 주세요.
        </p>
      )}
      {typeof navigator.share === "function" && (
        <Button
          className="mt-3 w-full"
          onClick={() =>
            void navigator
              .share({ title: `${round.title} 참석 응답`, url })
              .catch(() => undefined)
          }
        >
          공유하기
        </Button>
      )}
    </BottomSheet>
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
