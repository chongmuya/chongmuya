export const MAX_ROSTER_MEMBERS = 500;
export const MAX_ROSTER_BYTES = 128 * 1024;
export type RosterRow = {
  name: string;
  phoneLast4: string;
  parseError: string;
};

// Only explicit separators are interpreted. Spaces inside a person's name are preserved.
export function parseRoster(text: string): RosterRow[] {
  if (new TextEncoder().encode(text).length > MAX_ROSTER_BYTES)
    throw new Error("명단은 128KB 이내로 가져와 주세요.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text))
    throw new Error(
      "읽을 수 없는 문자가 있어요. UTF-8 TXT 파일인지 확인해 주세요.",
    );
  const rows: RosterRow[] = [];
  for (const source of text.replace(/^\ufeff/, "").split(/\r?\n/)) {
    // A leading tab is an empty name column, never a name made from the phone digits.
    const line = source
      .replace(/^[^\S\t]+|[^\S\t]+$/g, "")
      .replace(/^(?:[-*•] +|\d+[.)] +)/, "");
    if (!line.trim()) continue;
    const columns = line.split("\t");
    if (columns.length > 1) {
      rows.push({
        name: columns[0].trim(),
        phoneLast4: columns[1].trim(),
        parseError:
          columns.length > 2 ? "이름과 뒤 4자리 두 열만 입력해 주세요." : "",
      });
    } else if (line.includes(",")) {
      const values = line.split(",").map((value) => value.trim());
      if (values.length === 2 && (!values[1] || /^\d+$/.test(values[1])))
        rows.push({ name: values[0], phoneLast4: values[1], parseError: "" });
      else
        for (const value of values)
          rows.push({
            name: value,
            phoneLast4: "",
            parseError: value ? "" : "빈 항목을 수정하거나 제외해 주세요.",
          });
    } else rows.push({ name: line, phoneLast4: "", parseError: "" });
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
    const name = row.name.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
}
