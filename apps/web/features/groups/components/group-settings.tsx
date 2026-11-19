"use client";

import Link from "next/link";
import { useState } from "react";
import { GroupSwitcher } from "./group-switcher";
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
        <GroupSwitcher
          groups={groups}
          selected={selected.id}
          view="roster"
          onClose={() => setSwitching(false)}
        />
      )}
      <GroupForm
        accountId={accountId}
        request={request}
        group={selected}
        title="모임 이름 수정"
      />
      <GroupRoster
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
