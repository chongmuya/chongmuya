import { FileStorage } from "../../src/modules/files/file-storage.js";
// Explicit test adapter. Never selected by runtime configuration.
export class MemoryFileStorage extends FileStorage {
  readonly objects = new Map<string, Buffer>();
  failPut = false;
  failDelete = false;
  async put(key: string, body: Buffer) {
    if (this.failPut) throw new Error("test provider unavailable");
    this.objects.set(key, Buffer.from(body));
  }
  async get(key: string) {
    const b = this.objects.get(key);
    if (!b) throw new Error("test missing object");
    return b;
  }
  async delete(key: string) {
    if (this.failDelete) throw new Error("test delete failure");
    this.objects.delete(key);
  }
}
