import Image from "next/image";

export function SplashScreen() {
  return (
    <main
      aria-label="총무야 시작 중"
      className="flex min-h-svh items-center justify-center bg-brand bg-[url(/images/auth/background.svg)] bg-size-[100%_100%] bg-no-repeat"
    >
      <div className="-translate-y-8 space-y-[18.7px] text-center">
        <Image
          src="/images/auth/brand-symbol.svg"
          alt=""
          width={84}
          height={74}
          className="mx-auto"
          priority
        />
        <Image
          src="/images/auth/brand-wordmark.svg"
          alt="총무야"
          width={121}
          height={44}
          priority
        />
        <p role="status" className="sr-only">
          로그인 상태를 확인하고 있어요.
        </p>
      </div>
    </main>
  );
}
