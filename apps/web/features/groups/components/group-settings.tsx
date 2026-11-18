"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import type { SessionRequest } from "@/features/auth/types";
import type { Group } from "../types/group.types";
import { GroupForm } from "./group-form";
import { GroupRoster } from "./group-roster";
import { Button, buttonStyles } from "@/shared/ui/button";

export function GroupSettings({
  accountId,
  request,
  selected,
  groups,
}: {
  accountId: string;
  request: SessionRequest;
  selected: Group;
  groups: Group[];
}) {
  const [switching, setSwitching] = useState(false);
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{selected.name}</h2>
        <Button variant="outline" onClick={() => setSwitching(true)}>
          모임 전환
        </Button>
      </div>
      {switching && (
        <BottomSheet title="모임 전환" onClose={() => setSwitching(false)}>
          <ul className="space-y-3">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  className={buttonStyles({
                    variant: group.id === selected.id ? "solid" : "outline",
                    className: "w-full",
                  })}
                  href={`/mypage?view=groups&group=${group.id}`}
                >
                  {group.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            className={buttonStyles({
              variant: "outline",
              className: "mt-5 w-full",
            })}
            href="/groups/new"
          >
            모임 만들기
          </Link>
        </BottomSheet>
      )}
      <GroupForm
        key={selected.id}
        accountId={accountId}
        request={request}
        group={selected}
        title="모임 이름 수정"
      />
      <GroupRoster
        key={selected.id}
        accountId={accountId}
        groupId={selected.id}
        request={request}
      />
      <Link href="/groups/new" className={buttonStyles({ className: "mt-6" })}>
        모임 추가
      </Link>
    </>
  );
}
