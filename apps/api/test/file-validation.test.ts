import { test } from "node:test";
import assert from "node:assert/strict";
import * as CFB from "cfb";
import { validateFile } from "../src/modules/files/lib/validate-file.js";
test("signature, MIME, filename, bounded office container and macro rejection", async () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de",
    "hex",
  );
  assert.equal(await validateFile(png, "receipt.png", "image/png"), true);
  assert.equal(await validateFile(png, "receipt.jpg", "image/jpeg"), false);
  assert.equal(await validateFile(png, "../receipt.png", "image/png"), false);
  assert.equal(
    await validateFile(Buffer.alloc(10485761), "huge.png", "image/png"),
    false,
  );
  assert.equal(
    await validateFile(Buffer.from("<svg/>"), "image.svg", "image/svg+xml"),
    false,
  );
  assert.equal(
    await validateFile(
      Buffer.from("%PDF-1.7\n"),
      "receipt.pdf",
      "application/pdf",
    ),
    true,
  );
  const xls = CFB.utils.cfb_new();
  CFB.utils.cfb_add(xls, "Workbook", Buffer.from([9, 8, 0, 0]));
  assert.equal(
    await validateFile(
      Buffer.from(CFB.write(xls, { type: "buffer" })),
      "sheet.xls",
      "application/vnd.ms-excel",
    ),
    true,
  );
  CFB.utils.cfb_add(xls, "_VBA_PROJECT", Buffer.from("macro"));
  assert.equal(
    await validateFile(
      Buffer.from(CFB.write(xls, { type: "buffer" })),
      "sheet.xls",
      "application/vnd.ms-excel",
    ),
    false,
  );
  const xlsx = CFB.utils.cfb_new();
  CFB.utils.cfb_add(xlsx, "xl/workbook.xml", Buffer.from("<workbook/>"));
  CFB.utils.cfb_add(xlsx, "[Content_Types].xml", Buffer.from("<Types/>"));
  const zipped = Buffer.from(
    CFB.write(xlsx, { type: "buffer", fileType: "zip" }),
  );
  assert.equal(
    await validateFile(
      zipped,
      "sheet.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    true,
  );
  const central = zipped.indexOf(Buffer.from("504b0102", "hex"));
  zipped.writeUInt32LE(100 * 1024 * 1024, central + 24);
  assert.equal(
    await validateFile(
      zipped,
      "bomb.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    false,
  );
  const bomb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(
    bomb,
    "xl/workbook.xml",
    Buffer.from("<workbook>" + "a".repeat(2 * 1024 * 1024) + "</workbook>"),
  );
  CFB.utils.cfb_add(bomb, "[Content_Types].xml", Buffer.from("<Types/>"));
  const forged = Buffer.from(
    CFB.write(bomb, { type: "buffer", fileType: "zip", compression: true }),
  );
  // A small dishonest declaration must not bypass the actual inflate output cap.
  for (let i = 0; i < forged.length - 46; i++)
    if (
      forged.readUInt32LE(i) === 0x02014b50 &&
      forged.readUInt32LE(i + 24) > 1048576
    )
      forged.writeUInt32LE(100, i + 24);
  assert.equal(
    await validateFile(
      forged,
      "forged.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    false,
  );
});

test("unconfigured real S3 adapter fails instead of fabricating a stored file", async () => {
  const { S3FileStorage } =
    await import("../src/modules/files/file-storage.js");
  const storage = new S3FileStorage({
    environment: { filesRegion: "ap-northeast-2" },
  } as import("../src/config/config.service.js").ConfigService);
  await assert.rejects(
    storage.put("test", Buffer.from("x"), "image/png"),
    /FILE_STORAGE_UNCONFIGURED/,
  );
  await assert.rejects(storage.get("test"), /FILE_STORAGE_UNCONFIGURED/);
  await assert.rejects(storage.delete("test"), /FILE_STORAGE_UNCONFIGURED/);
});
