import type { Stats } from "node:fs";

export function fileRevision(metadata: Stats): string {
  return [
    metadata.dev,
    metadata.ino,
    metadata.ctimeMs,
    metadata.mtimeMs,
    metadata.size
  ].join(":");
}
