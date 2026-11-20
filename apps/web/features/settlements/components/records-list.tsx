"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordsSchema } from "../schemas/records.schema";
import { recordsQuery } from "../api/records.api";
import Link from "next/link";
import type { SessionRequest } from "@/features/auth/types";
import { FormInput } from "@/shared/ui/form-input";
import { Button } from "@/shared/ui/button";
import { safeErrorMessage } from "@/shared/http/error-contract";
export function RecordsList({
  accountId,
  request,
  groupId,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
}) {
  const [filter, setFilter] = useState({
      search: "",
      after: "",
      before: "",
      offset: 0,
    }),
    f = useForm({
      resolver: zodResolver(recordsSchema),
      defaultValues: filter,
    });
  const q = useQuery(recordsQuery(accountId, request, groupId, filter));
  if (q.error)
    return (
      <div>
        <p role="alert">{safeErrorMessage(q.error)}</p>
        <Button onClick={() => void q.refetch()}>다시 조회</Button>
      </div>
    );
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">모임의 기억을 모아둬요</h1>
      <p className="text-sm">
        {groupId ? "이 모임의" : "접근 가능한 모든"} 행사 정산과 증빙을 한눈에
        확인해요.
      </p>
      <form
        className="space-y-3"
        onSubmit={f.handleSubmit((v) => setFilter({ ...v, offset: 0 }))}
      >
        <FormInput
          aria-label="행사 이름 검색"
          placeholder="행사 이름 검색"
          control={f.control}
          name="search"
          aria-invalid={!!f.formState.errors.search}
          aria-describedby="records-search-error"
        />
        <p id="records-search-error" className="text-danger">
          {f.formState.errors.search?.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <label>
            시작 날짜
            <FormInput type="date" control={f.control} name="after" />
          </label>
          <label>
            종료 날짜
            <FormInput type="date" control={f.control} name="before" />
          </label>
        </div>
        <Button type="submit">검색</Button>
      </form>
      {q.isPending && <p role="status">기록을 불러오는 중입니다.</p>}
      {q.data?.events.map((e) => (
        <Link
          key={e.id}
          className="block space-y-3 rounded-lg bg-surface p-5 shadow-sm"
          href={`/events?event=${e.id}&view=record`}
        >
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="break-words">{e.name}</strong>
            <small className="text-brand-action">
              {
                {
                  EMPTY: "정산 없음",
                  COMPLETE: "정산 완료",
                  IN_PROGRESS: "정산 진행 중",
                }[e.status]
              }
            </small>
          </div>
          <p className="text-xs text-secondary">
            {e.scheduledAt
              ? new Date(e.scheduledAt).toLocaleString("ko-KR")
              : "날짜 미정"}{" "}
            · 한 차수 이상 참석 {e.attendingCount}명
          </p>
          <p>
            전체 지출 {e.total.toLocaleString()}원 · 입금 확인 {e.confirmed}명
          </p>
          {e.files.map((file) => (
            <p
              key={file.id}
              className="break-all rounded-lg border border-brand p-3 text-sm"
            >
              {file.name}
            </p>
          ))}
        </Link>
      ))}
      {q.data && !q.data.events.length && <p>해당하는 행사 기록이 없습니다.</p>}
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={!filter.offset}
          onClick={() =>
            setFilter({ ...filter, offset: Math.max(0, filter.offset - 20) })
          }
        >
          이전
        </Button>
        <Button
          variant="outline"
          disabled={!q.data || filter.offset + 20 >= q.data.count}
          onClick={() => setFilter({ ...filter, offset: filter.offset + 20 })}
        >
          다음
        </Button>
      </div>
    </section>
  );
}
