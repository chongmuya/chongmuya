import Image from "next/image";
import Link from "next/link";

export function MenuLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-control items-center justify-between gap-3 py-2 text-base"
    >
      {children}
      <MenuArrow />
    </Link>
  );
}

export function MenuArrow() {
  return (
    <Image
      src="/images/notifications/next.svg"
      width={10.0879}
      height={15.75}
      alt=""
      className="shrink-0 rotate-180"
    />
  );
}
