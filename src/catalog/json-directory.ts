import type { Stats } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  CatalogMessages,
  CatalogProvider,
  CatalogSnapshot,
  JsonDirectoryOptions
} from "../types.js";

interface FileSnapshot {
  messages: CatalogMessages;
  version: string;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: FileSnapshot;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeIdentifier(kind: "locale" | "bundle", value: string): void {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/u.test(value)
  ) {
    throw new TypeError(`Unsafe ${kind} identifier: ${value}`);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

function asCatalog(value: unknown, filePath: string): CatalogMessages {
  const isMessageTree = (candidate: unknown): boolean =>
    isPlainObject(candidate) &&
    Object.entries(candidate).every(
      ([key, entry]) =>
        !UNSAFE_KEYS.has(key) &&
        (typeof entry === "string" || isMessageTree(entry))
    );

  if (!isMessageTree(value)) {
    throw new TypeError(`Catalog must be a JSON object: ${filePath}`);
  }
  return value as CatalogMessages;
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ((error as NodeJS.ErrnoException).code === "ENOENT" ||
      (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}

function mergeCatalogs(
  earlier: CatalogMessages,
  later: CatalogMessages
): CatalogMessages {
  const merged: Record<string, unknown> = { ...earlier };
  for (const [key, value] of Object.entries(later)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new TypeError(`Unsafe catalog key: ${key}`);
    }
    const previous = merged[key];
    merged[key] =
      isPlainObject(previous) && isPlainObject(value)
        ? mergeCatalogs(previous as CatalogMessages, value as CatalogMessages)
        : value;
  }
  return merged as CatalogMessages;
}

export function jsonDirectory(options: JsonDirectoryOptions): CatalogProvider {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError("jsonDirectory options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (key !== "root" && key !== "onError" && key !== "fileName") {
      throw new TypeError(`Unknown jsonDirectory option: ${key}`);
    }
  }
  if (typeof options.root !== "string" || options.root.length === 0) {
    throw new TypeError("jsonDirectory root must be a non-empty string");
  }
  if (
    options.onError !== undefined &&
    options.onError !== "throw" &&
    options.onError !== "stale"
  ) {
    throw new TypeError('jsonDirectory onError must be "throw" or "stale"');
  }
  if (
    options.fileName !== undefined &&
    typeof options.fileName !== "function"
  ) {
    throw new TypeError("jsonDirectory fileName must be a function");
  }
  const root = resolve(options.root);
  let rootRealPath: Promise<string> | undefined;
  const getRootRealPath = (): Promise<string> => {
    rootRealPath ??= realpath(root);
    return rootRealPath;
  };
  const onError = options.onError ?? "throw";
  const fileName =
    options.fileName ??
    ((locale: string, bundle?: string) =>
      bundle ? `${locale}/${bundle}.json` : `${locale}.json`);
  const cache = new Map<string, CacheEntry>();

  const loadFile = async (
    locale: string,
    bundle?: string
  ): Promise<FileSnapshot | null> => {
    assertSafeIdentifier("locale", locale);
    if (bundle !== undefined) {
      assertSafeIdentifier("bundle", bundle);
    }

    const requestedName = fileName(locale, bundle);
    if (typeof requestedName !== "string" || requestedName.length === 0) {
      throw new TypeError("Catalog fileName must return a non-empty string");
    }
    const requestedPath = resolve(root, requestedName);
    if (!isWithin(root, requestedPath)) {
      throw new TypeError(`Catalog path escapes root: ${requestedPath}`);
    }
    const previous = cache.get(requestedPath);

    let metadata: Stats;
    try {
      metadata = await stat(requestedPath);
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      if (onError === "stale" && previous) {
        return previous.value;
      }
      throw error;
    }

    if (!metadata.isFile()) {
      return null;
    }

    const filePath = await realpath(requestedPath);
    if (!isWithin(await getRootRealPath(), filePath)) {
      throw new TypeError(`Catalog path escapes root: ${requestedPath}`);
    }
    if (
      previous &&
      previous.mtimeMs === metadata.mtimeMs &&
      previous.size === metadata.size
    ) {
      return previous.value;
    }

    try {
      const source = await readFile(filePath, "utf8");
      const messages = asCatalog(JSON.parse(source), filePath);
      const value: FileSnapshot = {
        messages,
        version: `${metadata.mtimeMs}:${metadata.size}`
      };
      cache.set(requestedPath, {
        mtimeMs: metadata.mtimeMs,
        size: metadata.size,
        value
      });
      return value;
    } catch (error) {
      if (onError === "stale" && previous) {
        return previous.value;
      }
      throw error;
    }
  };

  return {
    async load(
      locale: string,
      bundles: readonly string[] = []
    ): Promise<CatalogSnapshot | null> {
      if (!Array.isArray(bundles)) {
        throw new TypeError("bundles must be an array");
      }
      assertSafeIdentifier("locale", locale);
      for (const bundle of bundles) {
        assertSafeIdentifier("bundle", bundle);
      }
      const requestedBundles = [...new Set(bundles)];
      const snapshots =
        requestedBundles.length === 0
          ? [await loadFile(locale)]
          : await Promise.all(
              requestedBundles.map((bundle) => loadFile(locale, bundle))
            );

      let messages: CatalogMessages = {};
      const versions: string[] = [];
      let loaded = false;
      for (const [index, snapshot] of snapshots.entries()) {
        if (!snapshot) {
          continue;
        }
        loaded = true;
        messages = mergeCatalogs(messages, snapshot.messages);
        versions.push(
          `${requestedBundles[index] ?? "default"}:${snapshot.version}`
        );
      }

      return loaded
        ? {
            messages,
            version: versions.join("|")
          }
        : null;
    },
    clearCache(): void {
      cache.clear();
    }
  };
}
