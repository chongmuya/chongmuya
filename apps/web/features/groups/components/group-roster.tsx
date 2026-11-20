"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { Input } from "@/shared/ui/input";
import { IconButton } from "@/shared/ui/icon-button";
import { Button, buttonStyles } from "@/shared/ui/button";
import { isAccessError } from "@/shared/http/access-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { groupMembersQueryOptions } from "../api/groups.queries";
import { EditMember } from "./edit-member";

export function GroupRoster({
  accountId,
  groupId,
  request,
  onEditingChange,
}: {
  accountId: string;
  groupId: string;
  request: SessionRequest;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState<string>();
  const [search, setSearch] = useState("");
  const members = useQuery(
    groupMembersQueryOptions(accountId, groupId, request),
  );
  if (members.isError && (!members.data || isAccessError(members.error)))
    return <ErrorState retry={() => void members.refetch()} />;
  if (!members.data) return <LoadingState>명단 불러오는 중…</LoadingState>;
  const member = members.data.find((row) => row.id === editing);
  if (editing && !member)
    return (
      <section className="space-y-4">
        <p role="status" className="text-sm text-secondary">
          이 구성원은 기본 명단에서 제외됐어요.
        </p>
        <Button
          onClick={() => {
            setEditing(undefined);
            onEditingChange?.(false);
          }}
        >
          명단으로 돌아가기
        </Button>
      </section>
    );
  const term = search.trim().toLocaleLowerCase("ko-KR");
  const filtered = members.data.filter(
    (row) =>
      row.name.toLocaleLowerCase("ko-KR").includes(term) ||
      (row.phoneLast4 ?? "").includes(term),
  );
  return (
    <section aria-label="저장된 모임 명단" className="space-y-3">
      {members.isError && (
        <ErrorState retry={() => void members.refetch()}>
          최신 명단을 불러오지 못했어요.
        </ErrorState>
      )}
      {member ? (
        <EditMember
          key={member.id}
          accountId={accountId}
          member={member}
          otherNames={members.data
            .filter((row) => row.id !== member.id)
            .map((row) => row.name)}
          groupId={groupId}
          request={request}
          refresh={() => void members.refetch()}
          onClose={() => {
            setEditing(undefined);
            onEditingChange?.(false);
          }}
        />
      ) : (
        <>
          <h1 className="sr-only">모임 기본 명단</h1>
          <div className="relative">
            <Image
              src="/images/groups/search.svg"
              alt=""
              width={20}
              height={20}
              className="pointer-events-none absolute top-3 left-3"
            />
            <Input
              type="search"
              name="memberSearch"
              aria-label="이름 · 전화번호 뒤 4자리 검색"
              placeholder="이름 · 전화번호 뒤 4자리 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-11 rounded-panel border-0 pl-10 text-xs shadow-control placeholder:text-placeholder"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-secondary" role="status">
              전체 {members.data.length}명
              {term && ` · 검색 결과 ${filtered.length}명`}
            </p>
            <Link
              href={`/groups/new?group=${groupId}`}
              className={buttonStyles({
                variant: "outline",
                className:
                  "rounded-control border-placeholder px-3 text-sm text-secondary",
              })}
            >
              <Image
                src="/images/calendar/add.svg"
                alt=""
                width={13}
                height={13}
                className="mr-1"
              />{" "}
              명단 추가
            </Link>
          </div>
          {!members.data.length ? (
            <p className="rounded-card bg-surface p-6 text-center text-sm text-secondary">
              아직 등록된 구성원이 없어요. 모임의 기본 명단을 추가해 주세요.
            </p>
          ) : !filtered.length ? (
            <p className="py-12 text-center text-sm text-secondary">
              검색 결과가 없어요. 이름이나 전화번호 뒤 4자리를 확인해 주세요.
            </p>
          ) : (
            <div>
              <div
                className="grid grid-cols-[42px_minmax(0,1fr)_17px] gap-x-9 border-b border-placeholder px-5 pb-1 text-xs text-placeholder"
                aria-hidden="true"
              >
                <span className="text-center">이름</span>
                <span>전화번호 뒷자리</span>
                <span className="-mx-1 text-center">수정</span>
              </div>
              <ol>
                {filtered.map((row) => (
                  <li
                    key={row.id}
                    className="grid min-h-[59px] grid-cols-[42px_minmax(0,1fr)_17px] items-center gap-x-9 px-5 py-[7.5px]"
                  >
                    <button
                      type="button"
                      className="min-h-11 min-w-0 cursor-pointer text-center"
                      onClick={() => {
                        setEditing(row.id);
                        onEditingChange?.(true);
                      }}
                      aria-label={`${row.name} 구성원 상세`}
                    >
                      <span className="block text-sm font-semibold break-words">
                        {row.name}
                      </span>
                      {row.label && (
                        <span className="block text-xs break-words text-secondary">
                          {row.label}
                        </span>
                      )}
                    </button>
                    <span className="text-base text-secondary">
                      {row.phoneLast4 ?? "미등록"}
                    </span>
                    <IconButton
                      aria-label={`${row.name} 수정·이력`}
                      className="-ml-[13.5px]"
                      onClick={() => {
                        setEditing(row.id);
                        onEditingChange?.(true);
                      }}
                    >
                      <Image
                        src="/images/groups/edit.svg"
                        alt=""
                        width={17.0888}
                        height={17.088}
                      />
                    </IconButton>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
