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
    { key: "home", label: "홈", href: "/owner", icon: "/images/home/home.svg" },
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
      className="sticky bottom-0 -mx-5 mt-auto grid grid-cols-3 bg-surface px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-card"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-2 text-xs",
            current === item.key ? "text-brand-action" : "text-secondary",
          )}
        >
          <Image src={item.icon} width={22} height={22} alt="" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
