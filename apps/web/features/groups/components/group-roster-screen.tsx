"use client";
import { useState } from "react";
import Image from "next/image";
import type { SessionRequest } from "@/features/auth/types";
import { NotificationBadge } from "@/features/notifications/client";
import { OrganizerNavigation } from "@/shared/ui/organizer-navigation";
import { IconButton } from "@/shared/ui/icon-button";
import type { Group } from "../types/group.types";
import { GroupRoster } from "./group-roster";
import { GroupSwitcher } from "./group-switcher";

export function GroupRosterScreen({
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
  const [editing, setEditing] = useState(false);
  return (
    <>
      {!editing && (
        <header className="mt-4 mb-14 flex min-h-[52px] items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 pl-1 text-left"
            aria-haspopup="dialog"
            aria-expanded={switching}
            onClick={() => setSwitching(true)}
          >
            <span className="truncate text-base font-medium">
              {selected.name}
            </span>
            <Image
              src="/images/calendar/scope-arrow.svg"
              alt=""
              width={6.59099}
              height={11.0607}
              className="shrink-0 -rotate-90 -scale-y-100"
            />
          </button>
          <div className="-mr-1.5 flex shrink-0 items-center gap-1.5">
            <NotificationBadge accountId={accountId} request={request} icon />
            <IconButton
              href={`/mypage?group=${selected.id}`}
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
      )}
      {switching && (
        <GroupSwitcher
          groups={groups}
          selected={selected.id}
          view="roster"
          onClose={() => setSwitching(false)}
        />
      )}
      <div className="min-w-0 flex-1 pb-8">
        <GroupRoster
          accountId={accountId}
          groupId={selected.id}
          request={request}
          onEditingChange={setEditing}
        />
      </div>
      {!editing && (
        <OrganizerNavigation
          current="members"
          groupId={selected.id}
          className="-mx-5"
        />
      )}
    </>
  );
}
