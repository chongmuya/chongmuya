import { validateXlsx } from "./validate-xlsx.js";
import { fileTypeFromBuffer } from "file-type";
import * as CFB from "cfb";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export async function validateFile(bytes: Buffer, name: string, mime: string) {
  if (
    !bytes.length ||
    bytes.length > MAX_FILE_BYTES ||
    name.length > 200 ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    /[/\\]/.test(name)
  )
    return false;
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (!ext || types[ext] !== mime) return false;
  try {
    if (ext === "xls" || ext === "xlsx") {
      // Inspect bounded container directory, never evaluate spreadsheet content.
      if (
        ext === "xls" &&
        !bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))
      )
        return false;
      if (ext === "xlsx" && bytes.readUInt32LE(0) !== 0x04034b50) return false;
      if (ext === "xlsx") return validateXlsx(bytes);
      const container = CFB.read(bytes, { type: "buffer" });
      const names = container.FullPaths.map((p) => p.toLowerCase());
      if (names.some((p) => /vba|macros|_vba_project/.test(p))) return false;
      return names.some((p) => /\/(workbook|book)$/.test(p));
    }
    const detected = await fileTypeFromBuffer(bytes);
    return detected?.mime === mime;
  } catch {
    return false;
  }
}
