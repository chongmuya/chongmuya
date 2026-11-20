import { MAX_FILE_BYTES } from "./lib/validate-file.js";
import { Readable } from "node:stream";
import { Injectable } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { ConfigService } from "../../config/config.service.js";
export abstract class FileStorage {
  abstract put(key: string, body: Buffer, mime: string): Promise<void>;
  abstract get(key: string): Promise<Uint8Array>;
  abstract delete(key: string): Promise<void>;
}
@Injectable()
export class S3FileStorage extends FileStorage {
  private readonly client: S3Client;
  constructor(private readonly config: ConfigService) {
    super();
    this.client = new S3Client({
      region: config.environment.filesRegion,
      maxAttempts: 1,
    });
  }
  private bucket() {
    const b = this.config.environment.filesBucket;
    if (!b) throw new Error("FILE_STORAGE_UNCONFIGURED");
    return b;
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: mime,
        ServerSideEncryption: "AES256",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  }
  async get(key: string) {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!r.Body) throw new Error("FILE_MISSING");
    if (!(r.Body instanceof Readable)) throw new Error("FILE_STREAM_INVALID");
    return readFileBody(r.Body, r.ContentLength);
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  }
}

export async function readFileBody(body: Readable, contentLength?: number) {
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    if (
      contentLength !== undefined &&
      (contentLength < 0 || contentLength > MAX_FILE_BYTES)
    )
      throw new Error("FILE_TOO_LARGE");
    for await (const chunk of body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
      chunks.push(bytes);
    }
    if (contentLength !== undefined && length !== contentLength)
      throw new Error("FILE_LENGTH_MISMATCH");
    return Buffer.concat(chunks, length);
  } finally {
    body.destroy();
  }
}
