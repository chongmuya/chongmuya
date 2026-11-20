import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";

export function OwnerNavigation({
  current,
  restaurantId,
}: {
  current: "home" | "calendar";
  restaurantId?: string;
}) {
  const items = [
    {
      key: "home",
      label: "홈",
      href: "/owner",
      icon:
        current === "calendar"
          ? "/images/calendar/home.svg"
          : "/images/home/home.svg",
    },
    {
      key: "inquiries",
      label: "받은 문의",
      href: "/owner/inquiries",
      icon: "/images/restaurants/menu.svg",
    },
    {
      key: "calendar",
      label: "예약 관리",
      href: `/calendar${restaurantId ? `?restaurant=${restaurantId}` : ""}`,
      icon:
        current === "calendar"
          ? "/images/calendar/active.svg"
          : "/images/home/calendar.svg",
    },
  ];
  return (
    <nav
      aria-label="사장님 주요 메뉴"
      className="sticky bottom-0 z-10 -mx-5 mt-auto grid min-h-[78px] grid-cols-3 bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-4px_4px_rgb(0_0_0/0.1)]"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-col items-center gap-1 text-[10px] leading-[15px]",
            current === item.key ? "text-brand-action" : "text-secondary",
          )}
        >
          <span className="relative flex size-[22px] items-center justify-center">
            <Image
              style={{ height: "auto" }}
              src={item.icon}
              width={
                item.key === "home"
                  ? 19.75
                  : item.key === "inquiries"
                    ? 15.5
                    : 22
              }
              height={
                item.key === "home"
                  ? 20.7495
                  : item.key === "inquiries"
                    ? 20.5
                    : 22
              }
              alt=""
            />
            {item.key === "home" && (
              <Image
                style={{ height: "auto" }}
                src={
                  current === "calendar"
                    ? "/images/calendar/home-door.svg"
                    : "/images/home/home-door.svg"
                }
                width={7.75}
                height={10.75}
                alt=""
                className="absolute bottom-0"
              />
            )}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
