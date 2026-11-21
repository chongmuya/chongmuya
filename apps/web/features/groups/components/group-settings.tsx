"use client";

import { GroupManagement } from "@/features/handovers/client";
import { useState } from "react";
import { GroupSwitcher } from "./group-switcher";
import type { SessionRequest } from "@/features/auth/types";
import type { Group } from "../types/group.types";
import { GroupForm } from "./group-form";
import { Button } from "@/shared/ui/button";

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
          view="groups"
          onClose={() => setSwitching(false)}
        />
      )}
      <h2 className="mb-3 text-xl font-semibold">기본 정보</h2>
      <GroupForm
        accountId={accountId}
        request={request}
        group={selected}
        title="모임 정보 저장"
      />
      <GroupManagement
        accountId={accountId}
        groupId={selected.id}
        request={request}
      />
    </>
  );
}
