export function IntroductionArt({ page }: { page: number }) {
  return (
    <svg
      viewBox="0 0 402 592"
      className="block h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <image
        href="/images/intro/backdrop.svg"
        x={-146}
        y={-315}
        width={694}
        height={907}
      />
      {page === 0 ? (
        <>
          <image
            href="/images/intro/message.svg"
            x={156}
            y={193}
            width={111}
            height={86.6588}
          />
          <rect
            x={172}
            y={213}
            width={48}
            height={7}
            rx={3.5}
            className="fill-brand"
          />
          <rect
            x={172}
            y={226}
            width={79}
            height={7}
            rx={3.5}
            className="fill-field"
          />
          <rect
            x={172}
            y={239}
            width={73}
            height={7}
            rx={3.5}
            className="fill-field"
          />
          <image
            href="/images/auth/brand-symbol.svg"
            x={167}
            y={287}
            width={67.1996}
            height={59.4287}
          />
          <image
            href="/images/intro/arrow-down.svg"
            width={103}
            height={11.547}
            transform="translate(207.7735 346) rotate(90)"
          />
          <image
            href="/images/intro/arrow-right.svg"
            width={52}
            height={98.7735}
            transform="translate(300.7735 370) rotate(90)"
          />
          <image
            href="/images/intro/arrow-left.svg"
            width={52}
            height={98.7735}
            transform="translate(103.2265 370) rotate(-90) scale(-1 1)"
          />
          {[
            [78.736, 434.5],
            [172.736, 466.5],
            [266.736, 434.5],
          ].map(([x, y]) => (
            <image
              key={x}
              href="/images/intro/store.svg"
              x={x}
              y={y}
              width={55.9157}
              height={53}
            />
          ))}
        </>
      ) : page === 1 ? (
        <>
          {[42, 266.6].map((x) => (
            <g key={x} opacity={0.8}>
              <image
                href="/images/intro/store.svg"
                x={x + 18.7}
                y={303.5}
                width={55.9157}
                height={53}
              />
              <rect x={x} y={369} width={93} height={86} rx={16} fill="white" />
              {[41, 57, 61, 57].map((w, i) => (
                <rect
                  key={i}
                  x={x + 16}
                  y={389 + i * 13}
                  width={w}
                  height={7}
                  rx={3.5}
                  className={i === 0 ? "fill-brand" : "fill-field"}
                />
              ))}
            </g>
          ))}
          <image
            href="/images/intro/store-selected.svg"
            x={167.48}
            y={261.2}
            width={67.0988}
            height={63.6}
          />
          <rect
            x={145}
            y={339.8}
            width={111.6}
            height={103.2}
            rx={19.2}
            fill="white"
          />
          {[49.2, 68.4, 73.2, 68.4].map((w, i) => (
            <rect
              key={i}
              x={164.2}
              y={363.8 + i * 15.6}
              width={w}
              height={8.4}
              rx={4.2}
              className={i === 0 ? "fill-brand" : "fill-field"}
            />
          ))}
          <image
            href="/images/intro/check.svg"
            x={183}
            y={459}
            width={38.4004}
            height={38.4004}
          />
        </>
      ) : (
        <>
          {[
            [89, 205],
            [148, 188],
            [213, 188],
            [272, 208],
          ].map(([x, y]) => (
            <image
              key={x}
              href="/images/intro/person.svg"
              x={x}
              y={y}
              width={40.2493}
              height={50.0001}
            />
          ))}
          <image
            href="/images/auth/brand-symbol.svg"
            x={167}
            y={258}
            width={67.1996}
            height={59.4287}
          />
          <image
            href="/images/intro/connector.svg"
            width={57}
            height={1}
            transform="translate(196 327) rotate(90)"
          />
          <rect
            x={134}
            y={402}
            width={128}
            height={164}
            rx={19.2}
            fill="white"
          />
          <rect
            x={154}
            y={422}
            width={52}
            height={8}
            rx={4}
            className="fill-brand"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect
                x={154}
                y={438 + i * 18}
                width={10}
                height={10}
                rx={5}
                className="fill-placeholder"
              />
              <rect
                x={168}
                y={439 + i * 18}
                width={52}
                height={8}
                rx={4}
                className="fill-field"
              />
              <rect
                x={224}
                y={438 + i * 18}
                width={18}
                height={10}
                rx={5}
                className="fill-field"
              />
            </g>
          ))}
          <image
            href="/images/intro/receipt-line.svg"
            x={154}
            y={527}
            width={83}
            height={1}
          />
          <rect
            x={154}
            y={536}
            width={13}
            height={10}
            rx={5}
            className="fill-field"
          />
          <rect
            x={219}
            y={536}
            width={23}
            height={10}
            rx={5}
            className="fill-field"
          />
          <image
            href="/images/intro/won.svg"
            x={237}
            y={394}
            width={31.5}
            height={31.5}
          />
        </>
      )}
    </svg>
  );
}
