import Link from "next/link";
import { cn } from "@/shared/lib/cn";

export function OrganizerNavigation({
  current,
  groupId,
  personal = !groupId,
  className,
}: {
  current: "home" | "calendar" | "members" | "records";
  groupId?: string;
  personal?: boolean;
  className?: string;
}) {
  const group = groupId ? encodeURIComponent(groupId) : undefined;
  const items = [
    {
      key: "home",
      label: "홈",
      href: group ? `/?group=${group}` : personal ? "/?view=personal" : "/",
    },
    {
      key: "calendar",
      label: "캘린더",
      href: `/calendar${group ? `?group=${group}` : ""}`,
    },
    {
      key: "members",
      label: "모임 명단",
      href: `/mypage?view=roster${group ? `&group=${group}` : ""}`,
    },
    {
      key: "records",
      label: group ? "모임 기록" : "행사 기록",
      href: `/events?view=records${group ? `&group=${group}` : personal ? "&scope=personal" : ""}`,
    },
  ] as const;
  return (
    <nav
      aria-label="주요 메뉴"
      className={cn(
        "bottom-navigation shrink-0 grid-cols-4 gap-1 px-1 text-center",
        className,
      )}
    >
      {items.map(({ key, label, href }) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className="flex min-h-11 min-w-0 flex-col items-center gap-1 text-[10px] font-normal leading-[15px] text-placeholder no-underline"
        >
          <span
            className={cn(
              "relative flex size-[22px] items-center justify-center",
              current === key ? "text-brand" : "text-placeholder",
            )}
            aria-hidden="true"
          >
            <span
              className="block bg-current"
              style={{
                width:
                  key === "home" ? 19.75 : key === "members" ? 20.8683 : 22,
                height:
                  key === "home" ? 20.7495 : key === "members" ? 18.2952 : 22,
                mask: `url(/images/home/${key}.svg) center / contain no-repeat`,
              }}
            />
            {key === "home" && (
              <span
                className="absolute bottom-0 block bg-current"
                style={{
                  width: 7.75,
                  height: 10.75,
                  mask: "url(/images/home/home-door.svg) center / contain no-repeat",
                }}
              />
            )}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
