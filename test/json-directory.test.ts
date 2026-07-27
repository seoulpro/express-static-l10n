import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { jsonDirectory } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "express-static-l10n-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("jsonDirectory", () => {
  it("rejects malformed provider options at construction", () => {
    expect(() => jsonDirectory({ root: "" })).toThrow("root");
    expect(() =>
      jsonDirectory({ root: "/tmp", onError: "ignore" } as never)
    ).toThrow("onError");
    expect(() =>
      jsonDirectory({
        root: "/tmp",
        fileName: "catalog.json"
      } as never)
    ).toThrow("fileName");
  });

  it("loads and refreshes versioned JSON catalogs", async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, "en.json");
    await writeFile(file, JSON.stringify({ greeting: "Hello" }));
    const source = jsonDirectory({ root: directory });

    const first = await source.load("en");
    expect(first?.messages).toEqual({ greeting: "Hello" });
    expect(first?.version).toBeTypeOf("string");

    await writeFile(
      file,
      JSON.stringify({ greeting: "Hello again", extra: "value" })
    );
    const second = await source.load("en");
    expect(second?.messages).toEqual({
      greeting: "Hello again",
      extra: "value"
    });
    expect(second?.version).not.toBe(first?.version);
  });

  it("returns null for a missing catalog", async () => {
    const directory = await temporaryDirectory();
    expect(await jsonDirectory({ root: directory }).load("ko")).toBeNull();
  });

  it("supports a custom contained file layout", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, "catalogs"));
    await writeFile(
      join(directory, "catalogs", "en-common.json"),
      JSON.stringify({ greeting: "Hello" })
    );
    const source = jsonDirectory({
      root: directory,
      fileName: (locale, bundle) =>
        `catalogs/${locale}-${bundle ?? "default"}.json`
    });

    expect((await source.load("en", ["common"]))?.messages).toEqual({
      greeting: "Hello"
    });
  });

  it("can retain the last known good catalog after corruption", async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, "en.json");
    await writeFile(file, JSON.stringify({ greeting: "Hello" }));
    const source = jsonDirectory({ root: directory, onError: "stale" });
    const good = await source.load("en");

    await writeFile(file, "{ this is invalid JSON and a different size }");
    expect(await source.load("en")).toEqual(good);
  });

  it("throws for an initial or fail-fast parse error", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "en.json"), "[]");
    const source = jsonDirectory({ root: directory });

    await expect(source.load("en")).rejects.toThrow("JSON object");
  });

  it("rejects locale identifiers that could escape the directory", async () => {
    const directory = await temporaryDirectory();
    const source = jsonDirectory({ root: directory });
    await expect(source.load("../secret")).rejects.toThrow("Unsafe locale");
    await expect(source.load(null as never)).rejects.toThrow("Unsafe locale");
    await expect(source.load("en", "common" as never)).rejects.toThrow(
      "bundles must be an array"
    );
    await expect(source.load("en", ["../secret"])).rejects.toThrow(
      "Unsafe bundle"
    );
  });

  it("does not follow catalog symlinks outside the configured root", async () => {
    const directory = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const secret = join(outside, "secret.json");
    await writeFile(secret, JSON.stringify({ secret: "outside" }));
    await symlink(secret, join(directory, "en.json"));

    const source = jsonDirectory({ root: directory });
    await expect(source.load("en")).rejects.toThrow(
      "Catalog path escapes root"
    );
  });

  it("deep-merges bundles in declaration order", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, "en"));
    await writeFile(
      join(directory, "en", "common.json"),
      JSON.stringify({
        navigation: { home: "Home", account: "Account" },
        title: "Common title"
      })
    );
    await writeFile(
      join(directory, "en", "home.json"),
      JSON.stringify({
        navigation: { home: "Start" },
        title: "Home title"
      })
    );
    const source = jsonDirectory({ root: directory });

    const result = await source.load("en", ["common", "home"]);
    expect(result?.messages).toEqual({
      navigation: { home: "Start", account: "Account" },
      title: "Home title"
    });
    expect(result?.version).toContain("common:");
    expect(result?.version).toContain("home:");
  });

  it("rejects prototype-related keys at every catalog depth", async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      join(directory, "en.json"),
      `{"safe":{"constructor":{"polluted":"yes"}}}`
    );
    const source = jsonDirectory({ root: directory });

    await expect(source.load("en")).rejects.toThrow("Catalog must");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    await writeFile(
      join(directory, "en.json"),
      `{"__proto__":{"polluted":"yes"}}`
    );
    source.clearCache?.();
    await expect(source.load("en")).rejects.toThrow("Catalog must");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps stale snapshots isolated by locale and bundle", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, "en"));
    await mkdir(join(directory, "ko"));
    await writeFile(
      join(directory, "en", "common.json"),
      JSON.stringify({ label: "English" })
    );
    await writeFile(
      join(directory, "ko", "common.json"),
      JSON.stringify({ label: "한국어" })
    );
    await writeFile(
      join(directory, "en", "other.json"),
      JSON.stringify({ label: "Other bundle" })
    );
    const source = jsonDirectory({
      root: directory,
      onError: "stale"
    });
    const english = await source.load("en", ["common"]);
    const korean = await source.load("ko", ["common"]);
    const other = await source.load("en", ["other"]);

    await writeFile(
      join(directory, "en", "common.json"),
      "{ broken common catalog"
    );

    expect(await source.load("en", ["common"])).toEqual(english);
    expect(await source.load("ko", ["common"])).toEqual(korean);
    expect(await source.load("en", ["other"])).toEqual(other);
  });
});
