import { inflateRawSync } from "node:zlib";

// Inspect the directory and only two bounded XML entries. Never inflate the
// entire archive: attacker-controlled ZIP size declarations are not a limit.
export function validateXlsx(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    return false;
  const entries = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (
    !entries ||
    entries > 1000 ||
    entries !== bytes.readUInt16LE(end + 8) ||
    offset + bytes.readUInt32LE(end + 12) !== end
  )
    return false;
  let cursor = offset,
    total = 0;
  const found = new Set<string>(),
    names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      return false;
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      compressed = bytes.readUInt32LE(cursor + 20),
      expanded = bytes.readUInt32LE(cursor + 24),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32),
      local = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      compressed > bytes.length ||
      local + 30 > offset ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      return false;
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8")
      .toLowerCase();
    if (names.has(name) || /vba|macros|\.\.|^\/|\\/.test(name)) return false;
    names.add(name);
    total += expanded;
    if (total > 50 * 1024 * 1024) return false;
    const localNameLength = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28),
      start = local + 30 + localNameLength + localExtra;
    if (
      start + compressed > offset ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes
        .subarray(local + 30, local + 30 + localNameLength)
        .toString("utf8")
        .toLowerCase() !== name
    )
      return false;
    if (name === "xl/workbook.xml" || name === "[content_types].xml") {
      if (expanded > 1048576) return false;
      const compressedBytes = bytes.subarray(start, start + compressed);
      const xml =
        method === 0
          ? compressedBytes
          : inflateRawSync(compressedBytes, { maxOutputLength: 1048576 });
      if (xml.length !== expanded) return false;
      const text = xml.toString("utf8");
      if (
        /<!DOCTYPE/i.test(text) ||
        !(
          name === "xl/workbook.xml"
            ? /<(?:\w+:)?workbook[\s/>]/
            : /<(?:\w+:)?Types[\s/>]/
        ).test(text)
      )
        return false;
      found.add(name);
    }
    cursor = next;
  }
  return cursor === end && found.size === 2;
}
