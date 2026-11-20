const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function smsDate(date: string, includeYear = false) {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(new Date(date))
      .map(({ type, value }) => [type, value]),
  );
  return `${includeYear ? `${parts.year}/` : ""}${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export const RESERVATION_SMS_POLICY_VERSION = 2;

export const spaceNames: Record<string, string> = {
  HALL: "일반 홀",
  ROOM: "룸",
  FLOOR: "층 대관",
  WHOLE: "전체 대관",
  ANY: "공간 무관",
};

export function merchantSms(
  name: string,
  terms: { startsAt: string; expectedGuests: number },
  action: string,
  url: string,
) {
  return `[총무야] ${name} ${smsDate(terms.startsAt)} ${terms.expectedGuests}명\n${action}\n${url}`.normalize(
    "NFC",
  );
}

// The provider accepts KS X 1001 (EUC-KR). Node's decoder also knows
// Windows-949 extensions, so enumerate only the two-byte EUC-KR grid.
const decoder = new TextDecoder("euc-kr", { fatal: true });
const doubleByteCharacters = new Set<string>();
for (let lead = 0xa1; lead <= 0xfe; lead++) {
  for (let trail = 0xa1; trail <= 0xfe; trail++) {
    try {
      const character = decoder.decode(Uint8Array.of(lead, trail));
      if (character.length === 1 && character !== "\uFFFD")
        doubleByteCharacters.add(character);
    } catch {
      // Unassigned code point.
    }
  }
}

export function textMessageFormat(text: string) {
  let bytes = 0;
  for (const character of text) {
    if (/^[ -~\n\r]$/.test(character)) bytes++;
    else if (doubleByteCharacters.has(character)) bytes += 2;
    else return null;
  }
  if (!text.trim() || bytes > 2000) return null;
  const channel: "SMS" | "LMS" = bytes <= 90 ? "SMS" : "LMS";
  return { bytes, channel };
}

export function invalidMessage(provider: "fake" | "solapi") {
  return {
    provider,
    status: "FAILED" as const,
    failureStage: "SUBMISSION" as const,
    errorCode: "MESSAGE_BODY_INVALID",
  };
}
