import Image from "next/image";
import Link from "next/link";

export function HomeNavigation({
  groupId,
  personal,
}: {
  groupId?: string;
  personal?: boolean;
}) {
  return (
    <nav
      aria-label="주요 메뉴"
      className="sticky bottom-0 z-10 mt-auto grid grid-cols-4 bg-surface pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-center shadow-[0_-4px_4px_rgb(0_0_0/0.1)]"
    >
      <Link
        href={
          groupId
            ? `/?group=${encodeURIComponent(groupId)}`
            : personal
              ? "/?view=personal"
              : "/"
        }
        aria-current="page"
        className="flex flex-col items-center gap-1 text-[10px] text-brand-action"
      >
        <span className="relative flex size-[22px] items-center justify-center">
          <Image src="/images/home/home.svg" alt="" width={19} height={21} />
          <Image
            src="/images/home/home-door.svg"
            alt=""
            width={8}
            height={11}
            className="absolute bottom-0"
          />
        </span>
        홈
      </Link>
      <Link
        href={`/calendar${groupId ? `?group=${groupId}` : ""}`}
        className="flex flex-col items-center justify-center text-[10px] text-muted"
      >
        캘린더
      </Link>
      <Link
        href={
          groupId
            ? `/mypage?view=groups&group=${encodeURIComponent(groupId)}`
            : "/mypage?view=groups"
        }
        className="flex flex-col items-center gap-1 text-[10px] text-muted"
      >
        <Image
          src="/images/home/members.svg"
          alt=""
          width={21}
          height={18}
          className="my-[1.85px]"
        />
        모임 명단
      </Link>
      {(groupId || personal) && (
        <Link
          href={`/events?view=records${groupId ? `&group=${encodeURIComponent(groupId)}` : ""}`}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted"
        >
          모임 기록
        </Link>
      )}
    </nav>
  );
}
