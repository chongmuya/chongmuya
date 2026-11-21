"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { GroupSwitcher, useGroups } from "@/features/groups/client";
import { NotificationBadge } from "@/features/notifications/client";
import { isAccessError } from "@/shared/http/access-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { cn } from "@/shared/lib/cn";
import { compactEventDate } from "@/shared/lib/korean-date";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
import { FormInput } from "@/shared/ui/form-input";
import { IconButton } from "@/shared/ui/icon-button";
import { eventSummariesQuery } from "../api/event-summaries.api";
import { recordsQuery } from "../api/records.api";
import { recordsSchema } from "../schemas/records.schema";

const pageSize = 20;
const settlementLabels = {
  EMPTY: "정산 없음",
  COMPLETE: "정산 완료",
  IN_PROGRESS: "정산 진행 중",
} as const;

export function RecordsList({
  accountId,
  request,
  groupId,
  personal = false,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  personal?: boolean;
}) {
  const fieldId = useId();
  const [switching, setSwitching] = useState(false);
  const [filter, setFilter] = useState({
    search: "",
    after: "",
    before: "",
    offset: 0,
  });
  const form = useForm({
    resolver: zodResolver(recordsSchema),
    defaultValues: { search: "", after: "", before: "" },
  });
  const [after, before] = useWatch({
    control: form.control,
    name: ["after", "before"],
  });
  const groups = useGroups(accountId, request);
  const availableGroups = isAccessError(groups.error)
    ? []
    : (groups.data ?? []);
  const group = availableGroups.find((item) => item.id === groupId);
  const records = useQuery(
    recordsQuery(accountId, request, groupId, filter, personal),
  );
  const data = isAccessError(records.error) ? undefined : records.data;
  const summaries = useQuery(
    eventSummariesQuery({
      accountId,
      request,
      eventIds: data?.events.map((event) => event.id) ?? [],
    }),
  );
  const regions = new Map(
    (isAccessError(summaries.error) ? [] : (summaries.data ?? [])).map(
      (summary) => [summary.eventId, summary.region],
    ),
  );
  const page = filter.offset / pageSize + 1;
  const searchError = form.formState.errors.search?.message;

  return (
    <section className="space-y-5">
      <div className="space-y-6">
        <header className="flex min-h-control items-center justify-between gap-3">
          <button
            type="button"
            aria-label="기록 범위 선택"
            aria-haspopup="dialog"
            aria-expanded={switching}
            className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control pl-1 text-left font-medium"
            onClick={() => setSwitching(true)}
          >
            <span className="truncate">
              {group?.name ??
                (groupId ? "모임 기록" : personal ? "개인 행사" : "전체 행사")}
            </span>
            <Image
              src="/images/select-arrow.svg"
              alt=""
              width={10}
              height={7}
              className="shrink-0"
            />
          </button>
          <div className="-mr-1.5 flex shrink-0 items-center gap-1.5">
            <NotificationBadge accountId={accountId} request={request} />
            <IconButton
              href={group ? `/mypage?group=${group.id}` : "/mypage"}
              aria-label="마이페이지"
            >
              <Image
                src="/images/home/profile.svg"
                alt=""
                width={36}
                height={36}
              />
            </IconButton>
          </div>
        </header>
        <div className="space-y-2">
          <h1 className="text-label">모임의 기억을 모아둬요</h1>
          <p className="text-xs leading-tight">
            {personal ? "개인 행사의" : "지난 행사의"} 정산 내역과 증빙 자료를
            한눈에 확인해요.
          </p>
        </div>
      </div>
      {switching && (
        <GroupSwitcher
          groups={availableGroups}
          selected={groupId ?? undefined}
          view="records"
          personal={personal}
          onClose={() => setSwitching(false)}
        >
          {groups.isError && (
            <li className="space-y-2 text-sm">
              <p role="alert">모임 목록을 불러오지 못했어요.</p>
              <Button variant="outline" onClick={() => void groups.refetch()}>
                모임 다시 조회
              </Button>
            </li>
          )}
        </GroupSwitcher>
      )}
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit((values) =>
          setFilter({ ...values, offset: 0 }),
        )}
      >
        <div>
          <div className="relative">
            <Image
              src="/images/groups/search.svg"
              alt=""
              width={20}
              height={20}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <FormInput
              type="search"
              aria-label="행사 이름 검색"
              placeholder="행사 이름 검색"
              control={form.control}
              name="search"
              aria-invalid={!!searchError}
              aria-describedby={
                searchError ? `${fieldId}-search-error` : undefined
              }
              className="min-h-11 rounded-panel border-transparent pl-10 text-sm text-copy shadow-control placeholder:text-placeholder"
            />
          </div>
          <FormError id={`${fieldId}-search-error`} message={searchError} />
        </div>
        <fieldset className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-panel bg-surface p-3 shadow-control min-[360px]:gap-3">
          <legend className="sr-only">날짜 범위</legend>
          {(
            [
              { name: "after", label: "시작 날짜", max: before || undefined },
              { name: "before", label: "종료 날짜", min: after || undefined },
            ] as const
          ).map(({ name, label, ...bounds }) => (
            <FormField
              key={name}
              id={`${fieldId}-${name}`}
              label={label}
              error={form.formState.errors[name]?.message}
              className="min-w-0"
              labelClassName="text-xs font-medium text-secondary"
            >
              {(attributes) => (
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      {...attributes}
                      {...bounds}
                      label={label}
                      allowClear
                      formatValue={(value) => value.replaceAll("-", ".")}
                      className="min-h-control cursor-pointer gap-1 rounded-control border-field bg-background ps-2 pe-2 text-xs shadow-none min-[360px]:ps-3 min-[360px]:pe-3 min-[360px]:text-sm"
                    />
                  )}
                />
              )}
            </FormField>
          ))}
          <Button
            type="submit"
            variant="brand-outline"
            className="px-3 text-sm whitespace-nowrap text-brand min-[360px]:px-4"
          >
            검색
          </Button>
        </fieldset>
      </form>
      {records.error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">
            {safeErrorMessage(records.error)}
          </p>
          <Button variant="outline" onClick={() => void records.refetch()}>
            다시 조회
          </Button>
        </div>
      )}
      {records.isPending && (
        <p role="status" className="text-sm text-secondary">
          기록을 불러오는 중입니다.
        </p>
      )}
      {data?.events.length ? (
        <ul className="-mx-2.5 space-y-3">
          {data.events.map((event) => {
            const settled = event.status === "COMPLETE" && !event.needsReview;
            return (
              <li key={event.id}>
                <Link
                  className="block space-y-4 rounded-[4px] bg-surface px-5 py-4 shadow-card"
                  href={`/events?event=${event.id}&view=record`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 text-base leading-tight font-medium wrap-anywhere">
                      {event.name}
                    </h2>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-2 text-xs leading-tight",
                        settled
                          ? "text-brand-ink"
                          : event.status === "EMPTY" && !event.needsReview
                            ? "text-secondary"
                            : "text-brand",
                      )}
                    >
                      {(event.status !== "EMPTY" || event.needsReview) && (
                        <Image
                          src={
                            settled
                              ? "/images/home/complete-status.svg"
                              : "/images/home/settlement-status.svg"
                          }
                          width={settled ? 19 : 18.5}
                          height={settled ? 19 : 18}
                          alt=""
                        />
                      )}
                      {event.needsReview
                        ? "정산 재확인 필요"
                        : settlementLabels[event.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs leading-normal text-secondary">
                    <span className="inline-flex items-center gap-2">
                      <Image
                        src="/images/calendar/guests.svg"
                        alt=""
                        width={16.848}
                        height={14.8528}
                      />
                      <span>
                        <span className="sr-only">참석 </span>
                        {event.attendingCount}명
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 border-l border-placeholder/50 pl-3">
                      <Image
                        src="/images/home/calendar.svg"
                        alt=""
                        width={18}
                        height={18}
                      />
                      {event.scheduledAt ? (
                        <time dateTime={event.scheduledAt}>
                          {compactEventDate(event.scheduledAt)}
                        </time>
                      ) : (
                        compactEventDate(null)
                      )}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 border-l border-placeholder/50 pl-3 wrap-anywhere">
                      <Image
                        src="/images/calendar/location.svg"
                        alt=""
                        width={18}
                        height={18}
                        className="shrink-0"
                      />
                      {regions.get(event.id) ??
                        (summaries.isPending
                          ? "지역 확인 중"
                          : summaries.isError
                            ? "지역 확인 불가"
                            : "지역 미정")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : data ? (
        <p className="py-5 text-center text-sm text-secondary">
          해당하는 행사 기록이 없습니다.
        </p>
      ) : null}
      <nav
        aria-label="기록 페이지"
        className="flex items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          className="text-sm"
          disabled={!filter.offset}
          onClick={() =>
            setFilter((current) => ({
              ...current,
              offset: Math.max(0, current.offset - pageSize),
            }))
          }
        >
          이전
        </Button>
        <p className="text-sm text-secondary" aria-live="polite">
          {page}
          {data && ` / ${Math.max(page, Math.ceil(data.count / pageSize))}`}
        </p>
        <Button
          variant="outline"
          className="text-sm"
          disabled={!data || filter.offset + pageSize >= data.count}
          onClick={() =>
            setFilter((current) => ({
              ...current,
              offset: current.offset + pageSize,
            }))
          }
        >
          다음
        </Button>
      </nav>
    </section>
  );
}
