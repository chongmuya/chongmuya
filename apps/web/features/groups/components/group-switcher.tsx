"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { buttonStyles } from "@/shared/ui/button";
import type { Group } from "../types/group.types";

export function GroupSwitcher({
  groups,
  selected,
  view,
  createPath = "/groups/new",
  onClose,
  children,
}: {
  groups: Group[];
  selected?: string;
  view: "home" | "roster" | "groups" | "mypage";
  createPath?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const destination =
    view === "home"
      ? "/?group="
      : view === "mypage"
        ? "/mypage?group="
        : view === "roster"
          ? "/mypage?view=roster&group="
          : "/mypage?view=groups&group=";
  return (
    <BottomSheet
      title={view === "home" ? "모임·행사 선택" : "모임 전환"}
      onClose={onClose}
    >
      <ul className="my-5 space-y-2">
        {view === "home" && (
          <li>
            <Link
              replace
              href="/?view=personal"
              aria-current={!selected ? "page" : undefined}
              onClick={onClose}
              className={buttonStyles({
                variant: selected ? "outline" : "solid",
                className: "w-full justify-start",
              })}
            >
              개인 행사
            </Link>
          </li>
        )}
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              replace
              href={destination + group.id}
              aria-current={selected === group.id ? "page" : undefined}
              onClick={onClose}
              className={buttonStyles({
                variant: selected === group.id ? "solid" : "outline",
                className: "w-full justify-between",
              })}
            >
              <span className="truncate">{group.name}</span>
              <span className="text-xs">{group.memberCount}명</span>
            </Link>
          </li>
        ))}
        {children}
      </ul>
      <Link
        href={createPath}
        onClick={onClose}
        className={buttonStyles({
          variant: "brand-outline",
          className: "w-full",
        })}
      >
        모임 만들기
      </Link>
    </BottomSheet>
  );
}
