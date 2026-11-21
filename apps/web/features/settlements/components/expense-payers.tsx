"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import type { Detail } from "../types/settlement.types";
import { SettlementCheckbox } from "./settlement-checkbox";

export function ExpensePayers({
  facts,
  roundId,
  selected,
  titleId,
  onClose,
  onApply,
}: {
  facts: Detail["facts"];
  roundId: string;
  selected: string[];
  titleId: string;
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const round = facts.rounds.find((item) => item.id === roundId);
  const people = facts.participants.filter(
    (p) =>
      (showAll ||
        !round?.attendingIds.length ||
        round.attendingIds.includes(p.id) ||
        draft.includes(p.id)) &&
      [p.name, p.label, p.phoneLast4].some((value) =>
        value?.includes(search.trim()),
      ),
  );

  return (
    <section className="space-y-4 px-5 pt-4 pb-7">
      <header className="flex items-center gap-0.5">
        <IconButton className="-ml-4" aria-label="닫기" onClick={onClose}>
          <Image src="/images/ui/close.svg" alt="" width={15} height={15} />
        </IconButton>
        <h2 id={titleId} className="text-control font-medium">
          비용을 나눌 사람
        </h2>
        {draft.length > 0 && (
          <span className="ml-3.5 text-sm font-semibold text-brand">
            {draft.length}
          </span>
        )}
      </header>
      <div className="-mt-2.5 flex flex-wrap items-end justify-between gap-2">
        <div className="flex gap-1">
          {round && (
            <>
              <Button
                variant={showAll ? "brand-outline" : "solid"}
                className="min-h-11 px-3.5 font-medium"
                aria-pressed={!showAll}
                onClick={() => setShowAll(false)}
              >
                {round.title}
              </Button>
              <IconButton
                className="size-[46px] rounded-full border border-placeholder"
                aria-label="이 차수 참석자를 선택에 반영"
                title="이 차수 참석자를 선택에 반영"
                disabled={!round.attendingIds.length}
                onClick={() =>
                  setDraft([...new Set([...draft, ...round.attendingIds])])
                }
              >
                <Image
                  src="/images/settlements/add-round.svg"
                  alt=""
                  width={13}
                  height={13}
                />
              </IconButton>
            </>
          )}
        </div>
        <button
          type="button"
          aria-pressed={showAll}
          className={cn(
            "ml-auto cursor-pointer text-sm font-semibold text-brand",
            showAll && "underline",
          )}
          onClick={() => setShowAll(true)}
        >
          모임 명단 전체 보기
        </button>
      </div>
      <div className="relative">
        <Image
          src="/images/groups/search.svg"
          alt=""
          width={20}
          height={20}
          className="pointer-events-none absolute inset-y-0 left-3 my-auto"
        />
        <Input
          variant="form"
          className="min-h-11 rounded-xl border-placeholder pl-10 text-xs"
          aria-label="부담자 이름·전화번호 뒤4자리 검색"
          placeholder="이름 · 전화번호 뒷자리 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="min-h-[min(369px,45svh)] max-h-[min(369px,45svh)] overflow-y-auto rounded-card border border-placeholder px-[clamp(16px,9vw,36px)] py-4">
        {people.length ? (
          people.map((p) => (
            <label
              key={p.id}
              className="flex min-h-[67px] cursor-pointer items-center justify-between gap-3"
            >
              <span className="min-w-0 text-sm leading-tight font-semibold wrap-anywhere">
                {p.name}
                {p.label && ` (${p.label})`}
                {p.phoneLast4 && (
                  <small className="mt-1 block text-center text-xs font-normal">
                    {p.phoneLast4}
                  </small>
                )}
              </span>
              <SettlementCheckbox
                className="size-7 checked:bg-size-[28px_28px]"
                checked={draft.includes(p.id)}
                onChange={(event) =>
                  setDraft((ids) =>
                    event.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  )
                }
              />
            </label>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-secondary">
            {search ? "검색 결과가 없어요." : "등록된 참여자가 없어요."}
          </p>
        )}
      </div>
      <Button className="w-full" onClick={() => onApply(draft)}>
        추가하기
      </Button>
    </section>
  );
}
