import { appendFile, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { readBoundedUtf8 } from "../src/core/limits.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

it("bounds a file that grows after its descriptor is inspected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "static-l10n-limit-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "catalog.json");
  await writeFile(file, "{}", "utf8");

  const handle = await open(file, "r");
  try {
    const metadata = await handle.stat();
    await appendFile(file, "0123456789", "utf8");

    await expect(
      readBoundedUtf8(handle, "catalog", metadata.size, metadata)
    ).rejects.toMatchObject({
      code: "ERR_FILE_SIZE_LIMIT",
      kind: "catalog",
      byteLength: 12,
      limit: 2
    });
  } finally {
    await handle.close();
  }
});
