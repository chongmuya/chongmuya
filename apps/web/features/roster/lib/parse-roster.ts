export const MAX_ROSTER_MEMBERS = 500;
export const MAX_ROSTER_BYTES = 128 * 1024;
export type RosterRow = {
  name: string;
  phoneLast4: string;
  parseError: string;
  label: string;
  match: string;
};
export type ExistingPerson = {
  id: string;
  name: string;
  phoneLast4: string | null;
  label: string | null;
};
export type ColumnSelection = {
  name: number;
  phone: number | null;
  header: boolean;
};
export const normalizeName = (name: string) => name.trim().normalize("NFC");
// Sheets can drop the leading zero when an 010 number is stored as a number.
const mobileSource = "(?:01[016789][ -]*\\d{3,4}[ -]*\\d{4}|10\\d{8})";
export const isPersonName = (name: string) =>
  /\p{L}/u.test(name) &&
  !new RegExp(mobileSource).test(name) &&
  !/[\u0000-\u001f\u007f]/.test(name);
export function phoneSuffix(value: string) {
  const phone = value.trim();
  return new RegExp(`^${mobileSource}$`).test(phone)
    ? phone.replace(/[ -]/g, "").slice(-4)
    : phone;
}
export const emptyRosterRow = (): RosterRow => ({
  name: "",
  phoneLast4: "",
  label: "",
  match: "",
  parseError: "",
});
function sourceLines(text: string) {
  if (new TextEncoder().encode(text).length > MAX_ROSTER_BYTES)
    throw new Error("명단은 128KB 이내로 가져와 주세요.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text))
    throw new Error(
      "읽을 수 없는 문자가 있어요. UTF-8 TXT 파일인지 확인해 주세요.",
    );
  return text
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) =>
      line
        .replace(/^[^\S\t]+|[^\S\t]+$/g, "")
        .replace(/^(?:[-*•] +|\d+[.)] +)/, ""),
    );
}
export function rosterTable(text: string) {
  const lines = sourceLines(text);
  if (!lines.some((line) => line.includes("\t"))) return null;
  const cells = lines.map((line) =>
    line.split("\t").map((cell) => cell.trim()),
  );
  const heading = cells[0];
  const names = heading.flatMap((cell, i) =>
    /^(이름|성명)$/.test(cell) ? [i] : [],
  );
  const phones = heading.flatMap((cell, i) =>
    /^(휴대폰|휴대전화|전화번호|연락처|핸드폰)(\s*번호)?$/.test(cell)
      ? [i]
      : [],
  );
  const inferred: ColumnSelection | null =
    names.length === 1 && phones.length === 1
      ? { name: names[0], phone: phones[0], header: true }
      : cells.every((row) => row.length <= 2 && !row[0].includes(",")) &&
          !heading.some((cell) =>
            /^(학번|이름|성명|연락처|휴대폰)$/.test(cell),
          ) &&
          cells.every((row) => !row[0] || isPersonName(row[0])) &&
          cells.every(
            (row) => !row[1] || /^[0-9]{4}$/.test(phoneSuffix(row[1])),
          )
        ? { name: 0, phone: 1, header: false }
        : null;
  return {
    cells,
    columns: Math.max(...cells.map((row) => row.length)),
    inferred,
  };
}
function fromFields(name: string, phone: string, error = ""): RosterRow {
  const full = new RegExp(`(?<!\\d)${mobileSource}(?!\\d)`, "g");
  const contained = name.match(full) ?? [];
  const cleanName = normalizeName(name.replace(full, ""));
  const suffix = phoneSuffix(
    phone || (contained.length === 1 ? contained[0] : ""),
  );
  return {
    ...emptyRosterRow(),
    name: cleanName,
    phoneLast4: suffix,
    parseError:
      error ||
      (contained.length > 1 || (contained.length && phone)
        ? "한 사람의 번호가 두 개예요. 수정하거나 행을 나눠 주세요."
        : !isPersonName(cleanName)
          ? "이름을 입력해 주세요. 번호만 있는 항목은 저장할 수 없어요."
          : /\d{4,}/.test(cleanName)
            ? "출처를 알 수 없는 숫자가 있어요. 이름과 연락처를 확인해 주세요."
            : /^(?:[가-힣]{3,4}\s+)+[가-힣]{3,4}$/.test(cleanName)
              ? "여러 이름인지 확인하고 수정·분리해 주세요."
              : ""),
  };
}
export function parseRoster(
  text: string,
  selection?: ColumnSelection,
): RosterRow[] {
  const table = rosterTable(text);
  const columns = selection ?? table?.inferred;
  let rows: RosterRow[];
  if (table && columns) {
    rows = table.cells
      .slice(columns.header ? 1 : 0)
      .map((cells) =>
        fromFields(
          cells[columns.name] ?? "",
          columns.phone === null ? "" : (cells[columns.phone] ?? ""),
        ),
      );
  } else {
    rows = sourceLines(text).flatMap((line) => {
      if (line.includes("\t")) {
        const cells = line.split("\t");
        return [
          fromFields(
            cells[0],
            cells[1] ?? "",
            cells.length === 2
              ? ""
              : "이름 열과 연락처 열을 선택하거나 행을 직접 수정해 주세요.",
          ),
        ];
      }
      const parts = line.split(",").map((part) => part.trim());
      const result: RosterRow[] = [];
      for (let index = 0; index < parts.length; index++) {
        const next = parts[index + 1];
        if (next !== undefined && (!next || /^[\d -]+$/.test(next))) {
          result.push(fromFields(parts[index], next));
          index++;
        } else result.push(fromFields(parts[index], ""));
      }
      return result;
    });
  }
  if (rows.length > MAX_ROSTER_MEMBERS)
    throw new Error("명단은 한 번에 500명까지 등록할 수 있어요.");
  return rows;
}
export function duplicateNames(
  rows: readonly Pick<RosterRow, "name">[],
): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
}
