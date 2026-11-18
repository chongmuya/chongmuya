import Image from "next/image";
import Link from "next/link";

export function HomeNavigation({ groupId }: { groupId?: string }) {
  return (
    <nav
      aria-label="주요 메뉴"
      className="sticky bottom-0 z-10 mt-auto grid grid-cols-4 bg-surface pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-center shadow-[0_-4px_4px_rgb(0_0_0/0.1)]"
    >
      <Link
        href="/"
        aria-current="page"
        className="flex flex-col items-center gap-1 text-[10px] text-brand"
      >
        <span className="relative flex size-[22px] items-center justify-center">
          <Image
            src="/images/home/home.svg"
            alt=""
            width={19.35}
            height={20.75}
          />
          <Image
            src="/images/home/home-door.svg"
            alt=""
            width={7.75}
            height={10.75}
            className="absolute bottom-0"
          />
        </span>
        홈
      </Link>
      <span
        aria-disabled="true"
        className="flex flex-col items-center gap-1 text-[10px] text-muted"
      >
        <Image src="/images/home/calendar.svg" alt="" width={22} height={22} />
        캘린더 · 준비 중
      </span>
      <Link
        href={groupId ? `/mypage?group=${groupId}` : "/mypage"}
        className="flex flex-col items-center gap-1 text-[10px] text-muted"
      >
        <Image
          src="/images/home/members.svg"
          alt=""
          width={20.8698}
          height={18.2955}
          className="my-[1.85px]"
        />
        모임 명단
      </Link>
      <span
        aria-disabled="true"
        className="flex flex-col items-center gap-1 text-[10px] text-muted"
      >
        <Image src="/images/home/records.svg" alt="" width={22} height={22} />
        모임 기록 · 준비 중
      </span>
    </nav>
  );
}
