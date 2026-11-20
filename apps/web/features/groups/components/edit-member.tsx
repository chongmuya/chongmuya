"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import type { SessionRequest } from "@/features/auth/types";
import type { GroupMember } from "../types/group.types";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Dialog } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { ApiError } from "@/shared/http/api-error";
import { isAccessError } from "@/shared/http/access-error";
import { koreanDateOnly } from "@/shared/lib/korean-date";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { useEditMember } from "../hooks/use-edit-member";
import { memberHistoryQueryOptions } from "../api/groups.queries";

export function EditMember({
  accountId,
  member,
  otherNames = [],
  groupId,
  request,
  refresh,
  onClose,
}: {
  accountId: string;
  member: GroupMember;
  otherNames?: string[];
  groupId: string;
  request: SessionRequest;
  refresh: () => void;
  onClose: () => void;
}) {
  const { base, setBase, uncertain, pending, form, save } = useEditMember(
    member,
    groupId,
    request,
    refresh,
    onClose,
  );
  const [offset, setOffset] = useState(0);
  const [excluding, setExcluding] = useState(false);
  const name = useWatch({ control: form.control, name: "name" });
  const duplicate =
    otherNames.includes(name.trim()) ||
    (save.error instanceof ApiError &&
      save.error.code === "ROSTER_DUPLICATES_UNCONFIRMED");
  const fields: ("name" | "phoneLast4" | "label")[] = [
    "name",
    "phoneLast4",
    ...(member.label || duplicate ? ["label" as const] : []),
  ];
  const history = useQuery(
    memberHistoryQueryOptions(accountId, groupId, member.id, offset, request),
  );
  const changed = base.version !== member.version;
  const saveError = uncertain
    ? "응답을 확인하지 못했어요. 같은 요청을 다시 확인해 주세요."
    : "저장하지 못했어요. 최신 명단과 동명이인 확인 여부를 검토해 주세요.";
  if (isAccessError(history.error) || isAccessError(save.error))
    return (
      <ErrorState
        retry={() => {
          void history.refetch();
          refresh();
        }}
      >
        이 구성원 정보를 확인할 권한이 없어요.
      </ErrorState>
    );
  return (
    <>
      <header className="relative mb-14 flex min-h-11 items-center justify-center">
        <IconButton
          className="absolute -left-3"
          aria-label="명단으로 돌아가기"
          disabled={save.isPending || uncertain}
          onClick={onClose}
        >
          <Image src="/images/ui/back.svg" alt="" width={10.4142} height={18} />
        </IconButton>
        <h1 className="text-xl leading-[normal] font-semibold">구성원 수정</h1>
        <IconButton
          className="absolute -right-1.5"
          aria-label="기본 명단에서 제외"
          disabled={save.isPending || uncertain || changed}
          onClick={() => setExcluding(true)}
        >
          <Image
            src="/images/groups/remove.svg"
            alt=""
            width={22}
            height={24}
          />
        </IconButton>
      </header>
      <form
        className="flex flex-col gap-11"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            pending.current ??= {
              ...values,
              exclude: false,
              phoneLast4: values.phoneLast4 || null,
              label: values.label || null,
              expectedVersion: base.version,
              requestKey: crypto.randomUUID(),
            };
            save.mutate(pending.current);
          })(event)
        }
      >
        <div className="mx-[9px] space-y-7">
          <section className="space-y-3" aria-labelledby="member-basics-title">
            <h2
              id="member-basics-title"
              className="text-xl leading-[normal] font-semibold"
            >
              기본 정보
            </h2>
            <div className="space-y-5 rounded-card bg-surface px-4 py-6 shadow-card">
              {fields.map((field) => (
                <div key={field} className="space-y-2">
                  <label
                    className="block text-xs leading-[normal]"
                    htmlFor={`${member.id}-${field}`}
                  >
                    {
                      {
                        name: "이름",
                        phoneLast4: "전화번호 뒷자리",
                        label: "동명이인 구분",
                      }[field]
                    }
                  </label>
                  <Input
                    id={`${member.id}-${field}`}
                    variant="form"
                    className="min-h-[49px] leading-[normal]"
                    {...form.register(field)}
                    disabled={save.isPending || uncertain}
                    aria-invalid={!!form.formState.errors[field]}
                    aria-describedby={
                      form.formState.errors[field]
                        ? `${member.id}-${field}-error`
                        : undefined
                    }
                  />
                  {form.formState.errors[field] && (
                    <p
                      className="text-xs text-danger"
                      id={`${member.id}-${field}-error`}
                      role="alert"
                    >
                      {form.formState.errors[field]?.message}
                    </p>
                  )}
                </div>
              ))}
              {duplicate && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-1 accent-brand"
                    {...form.register("duplicatesConfirmed")}
                    disabled={save.isPending || uncertain}
                  />
                  동명이인 여부와 구분 정보를 확인했어요
                </label>
              )}
            </div>
          </section>
          <section aria-labelledby="member-history-title" className="space-y-3">
            <h2
              id="member-history-title"
              className="text-xl leading-[normal] font-semibold"
            >
              참여 내역
            </h2>
            {history.isError && (
              <ErrorState retry={() => void history.refetch()}>
                참여 내역을 불러오지 못했어요. 작성 중인 정보는 유지돼요.
              </ErrorState>
            )}
            {!history.data ? (
              !history.isError && (
                <LoadingState>참여 내역 확인 중…</LoadingState>
              )
            ) : (
              <div className="rounded-card bg-surface px-4 py-6 shadow-card">
                <dl className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                  <div className="flex items-baseline gap-3">
                    <dt
                      className="text-xs text-secondary"
                      title="한 차수 이상 최종 참석한 고유 행사 수"
                    >
                      참여한 행사
                    </dt>
                    <dd>
                      <strong className="text-xl leading-5 font-semibold text-brand">
                        {history.data.attendedEventCount}
                      </strong>
                      <span className="ml-0.5 text-xs text-placeholder">
                        회
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <dt
                      className="text-xs text-secondary"
                      title="참석 여부와 별도로 계산한 현재 개인 분담액 합계"
                    >
                      누적 분담액
                    </dt>
                    <dd className="font-semibold text-secondary">
                      <span className="text-xl leading-5">
                        {history.data.contributionTotal.toLocaleString("ko-KR")}
                      </span>
                      <span className="ml-0.5 text-xs font-normal text-placeholder">
                        원
                      </span>
                    </dd>
                  </div>
                </dl>
                {history.data.events.length ? (
                  <ol aria-label="연결된 행사" className="mt-5">
                    {history.data.events.map((event) => (
                      <li key={event.eventId}>
                        <Link
                          href={`/events?event=${event.eventId}&view=settlement`}
                          aria-label={`${event.name}, ${event.attending ? "참석한 행사" : "참석으로 집계된 차수 없음"}, 분담액 ${event.contributionAmount.toLocaleString("ko-KR")}원`}
                          className="flex items-center justify-between gap-2 py-5"
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xl leading-[normal] font-semibold break-words">
                              {event.name}
                            </h3>
                            <p className="mt-2 text-xs leading-[normal] text-secondary">
                              {event.startsAt
                                ? koreanDateOnly(
                                    new Date(event.startsAt),
                                  ).replaceAll("-", ".")
                                : "일정 미정"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-base leading-[normal] font-medium">
                              {event.contributionAmount.toLocaleString("ko-KR")}
                              원
                            </span>
                            <Image
                              src="/images/groups/history-arrow.svg"
                              alt=""
                              width={10.0879}
                              height={15.75}
                              className="rotate-180 -scale-y-100"
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-8 text-center text-sm text-secondary">
                    아직 연결된 행사 내역이 없어요.
                  </p>
                )}
                {history.data.count > 20 && (
                  <nav
                    aria-label="구성원 이력 페이지"
                    className="mt-3 flex items-center justify-between gap-2"
                  >
                    <Button
                      variant="outline"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - 20))}
                    >
                      이전
                    </Button>
                    <span className="text-xs text-secondary">
                      {Math.floor(offset / 20) + 1} /{" "}
                      {Math.ceil(history.data.count / 20)}
                    </span>
                    <Button
                      variant="outline"
                      disabled={offset + 20 >= history.data.count}
                      onClick={() => setOffset(offset + 20)}
                    >
                      다음
                    </Button>
                  </nav>
                )}
              </div>
            )}
          </section>
          {changed && (
            <div role="alert" className="space-y-3 text-sm">
              <p>
                최신 명단: {member.name} · {member.phoneLast4 ?? "번호 없음"} ·{" "}
                {member.label ?? "구분 없음"}
              </p>
              <Button
                disabled={uncertain || save.isPending}
                variant="outline"
                onClick={() => setBase(member)}
              >
                최신 내용을 확인했고 내 입력을 다시 적용할게요
              </Button>
            </div>
          )}
          {save.isError && !excluding && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
        </div>
        {uncertain ? (
          <Button
            className="-mx-[3px]"
            disabled={save.isPending}
            onClick={() => pending.current && save.mutate(pending.current)}
          >
            같은 요청 다시 확인
          </Button>
        ) : (
          <Button
            className="-mx-[3px]"
            type="submit"
            disabled={save.isPending || changed}
          >
            변경사항 저장
          </Button>
        )}
      </form>
      {excluding && (
        <Dialog
          labelledBy={`exclude-${member.id}`}
          onClose={() => setExcluding(false)}
          busy={save.isPending || uncertain}
        >
          <h2
            id={`exclude-${member.id}`}
            className="text-xl leading-[normal] font-semibold"
          >
            기본 명단에서 제외할까요?
          </h2>
          <p className="mt-3 text-sm text-secondary">
            과거 행사 기록은 보존돼요.
          </p>
          {save.isError && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {saveError}
            </p>
          )}
          <div className="mt-6 flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={save.isPending || uncertain}
              onClick={() => setExcluding(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1"
              loading={save.isPending}
              onClick={() => {
                pending.current ??= {
                  name: base.name,
                  phoneLast4: base.phoneLast4,
                  label: base.label,
                  exclude: true,
                  expectedVersion: base.version,
                  requestKey: crypto.randomUUID(),
                };
                save.mutate(pending.current);
              }}
            >
              {uncertain ? "같은 요청 다시 확인" : "명단에서 제외"}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
