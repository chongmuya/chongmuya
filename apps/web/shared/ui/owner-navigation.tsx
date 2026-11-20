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
      icon: "/images/home/home.svg",
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
      icon: "/images/home/calendar.svg",
    },
  ];
  return (
    <nav
      aria-label="사장님 주요 메뉴"
      className="bottom-navigation -mx-5 grid-cols-3 px-5"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className="flex min-h-11 flex-col items-center gap-1 text-[10px] font-normal leading-[15px] text-placeholder"
        >
          <span
            aria-hidden="true"
            className={cn(
              "relative flex size-[22px] items-center justify-center",
              current === item.key ? "text-brand" : "text-placeholder",
            )}
          >
            <span
              className="block bg-current"
              style={{
                width:
                  item.key === "home"
                    ? 19.75
                    : item.key === "inquiries"
                      ? 15.5
                      : 22,
                height:
                  item.key === "home"
                    ? 20.7495
                    : item.key === "inquiries"
                      ? 20.5
                      : 22,
                mask: `url(${item.icon}) center / contain no-repeat`,
              }}
            />
            {item.key === "home" && (
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
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
