import Image from "next/image";

export function CompletionSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="예약 진행 단계"
      className="relative mx-auto grid w-full max-w-[333px] grid-cols-[repeat(3,minmax(0,1fr))_48px] text-center text-xs leading-[14px] text-brand-ink"
    >
      {["조건 입력", "매장 선택", "확정 입금", "매장 확인"].map(
        (label, index) => (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className="relative flex flex-col items-start gap-2"
          >
            {index < 3 && (
              <span
                aria-hidden="true"
                className="absolute top-[9px] left-[37px] w-[calc(100%-25px)] overflow-hidden"
              >
                <Image
                  src="/images/reservations/progress-line.svg"
                  width={70}
                  height={1}
                  alt=""
                  className="max-w-none"
                />
              </span>
            )}
            <span className="relative flex h-[19px] w-12 items-center justify-center">
              {index < current ? (
                <Image
                  src="/images/reservations/progress-done.svg"
                  width={19}
                  height={19}
                  alt=""
                />
              ) : index === current ? (
                <>
                  <Image
                    src="/images/reservations/progress-current.svg"
                    width={18}
                    height={18}
                    alt=""
                  />
                  <span className="absolute text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                </>
              ) : (
                <Image
                  src="/images/reservations/progress-upcoming.svg"
                  width={19}
                  height={19}
                  alt=""
                />
              )}
            </span>
            <span className="flex w-12 justify-center whitespace-nowrap">
              {label}
            </span>
          </li>
        ),
      )}
    </ol>
  );
}
