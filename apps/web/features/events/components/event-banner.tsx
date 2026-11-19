import Image from "next/image";
import Link from "next/link";

export function EventBanner({
  href,
  eventName,
}: {
  href: string;
  eventName?: string;
}) {
  return (
    <Link
      href={href}
      className="relative block h-[270px] overflow-hidden rounded-control bg-[radial-gradient(ellipse_at_bottom_right,#fac253_0%,#f7923b_42%,#f46224_84%)] p-5 text-white shadow-card"
    >
      <span className="block text-2xl leading-tight font-bold">
        {eventName ? (
          <span className="line-clamp-2">{eventName}</span>
        ) : (
          <>
            행사 준비,
            <br />
            총무야와 시작해요!
          </>
        )}
      </span>
      <Image
        src="/images/home/calendar-art.svg"
        alt=""
        width={182}
        height={127}
        className="absolute top-[93px] right-9"
      />
      <span className="absolute right-7 bottom-5 left-7 flex items-center justify-between text-control">
        {eventName ? "행사 진행 상황 보기" : "새 행사를 계획해 볼까요?"}
        <span aria-hidden="true" className="text-3xl">
          ›
        </span>
      </span>
    </Link>
  );
}
