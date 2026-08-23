import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

export const DEFAULT_MAX_HTML_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_CATALOG_BYTES = 1024 * 1024;
export const DEFAULT_MAX_BUNDLES = 32;

export type FileSizeLimitKind = "html" | "catalog";

export class FileSizeLimitError extends Error {
  readonly code = "ERR_FILE_SIZE_LIMIT";
  readonly kind: FileSizeLimitKind;
  readonly byteLength: number;
  readonly limit: number;

  constructor(kind: FileSizeLimitKind, byteLength: number, limit: number) {
    super(
      `${kind === "html" ? "HTML" : "Catalog"} file is ${byteLength} bytes, ` +
        `exceeding the configured limit of ${limit} bytes`
    );
    this.name = "FileSizeLimitError";
    this.kind = kind;
    this.byteLength = byteLength;
    this.limit = limit;
  }
}

export function positiveSafeInteger(
  name: string,
  value: number | undefined,
  fallback: number
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

export function assertFileSize(
  kind: FileSizeLimitKind,
  byteLength: number,
  limit: number
): void {
  if (byteLength > limit) {
    throw new FileSizeLimitError(kind, byteLength, limit);
  }
}

export async function readBoundedUtf8(
  handle: FileHandle,
  kind: FileSizeLimitKind,
  limit: number,
  initialMetadata: Stats
): Promise<{ metadata: Stats; source: string }> {
  assertFileSize(kind, initialMetadata.size, limit);

  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, limit));
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset <= limit) {
    const length = Math.min(buffer.length, limit - offset + 1);
    const { bytesRead } = await handle.read(buffer, 0, length, null);
    if (bytesRead === 0) {
      break;
    }
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    offset += bytesRead;
  }

  const metadata = await handle.stat();
  if (offset > limit || metadata.size > limit) {
    throw new FileSizeLimitError(kind, Math.max(offset, metadata.size), limit);
  }
  if (
    metadata.dev !== initialMetadata.dev ||
    metadata.ino !== initialMetadata.ino ||
    metadata.size !== initialMetadata.size ||
    metadata.mtimeMs !== initialMetadata.mtimeMs ||
    offset !== metadata.size
  ) {
    throw new Error(
      `${kind === "html" ? "HTML" : "Catalog"} file changed while reading`
    );
  }

  return {
    metadata,
    source: Buffer.concat(chunks, offset).toString("utf8")
  };
}
