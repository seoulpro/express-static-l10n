import type { Stats } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import type { Request, RequestHandler } from "express";

import { resolveLocale, varyHeadersForDetection } from "../core/locale.js";
import {
  extractI18nBundles,
  transformHtml,
  validateTranslatableAttributes
} from "../core/transform-html.js";
import type {
  CatalogMessages,
  CatalogSnapshot,
  LocalizedStaticMiddleware,
  LocalizedStaticOptions
} from "../types.js";

interface HtmlSource {
  html: string;
  revision: string;
}

interface FileCandidate {
  filePath: string;
  metadata: Stats;
}

class LruCache<T> {
  readonly #entries = new Map<string, { expiresAt: number | null; value: T }>();
  readonly #maxEntries: number;
  readonly #ttlMs: number | undefined;

  constructor(maxEntries: number, ttlMs: number | undefined) {
    this.#maxEntries = maxEntries;
    this.#ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, {
      expiresAt: this.#ttlMs === undefined ? null : Date.now() + this.#ttlMs,
      value
    });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}

function missingPath(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
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

function decodedRequestPath(request: Request): string | null {
  let pathname: string;
  try {
    pathname = new URL(request.url, "http://express-static-l10n.invalid")
      .pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (pathname.includes("\0") || pathname.includes("\\")) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return pathname;
}

async function safeStat(filePath: string): Promise<Stats | null> {
  try {
    return await stat(filePath);
  } catch (error) {
    if (missingPath(error)) {
      return null;
    }
    throw error;
  }
}

async function resolveHtmlCandidate(
  request: Request,
  root: string,
  rootRealPath: string,
  index: string | false,
  allowDotfiles: boolean
): Promise<FileCandidate | null> {
  const pathname = decodedRequestPath(request);
  if (pathname === null) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (!allowDotfiles && segments.some((segment) => segment.startsWith("."))) {
    return null;
  }

  const relativePath = segments.join("/");
  let candidate = resolve(root, relativePath);
  if (!isWithin(root, candidate)) {
    return null;
  }

  let metadata = await safeStat(candidate);
  if (metadata?.isDirectory()) {
    if (index === false) {
      return null;
    }
    candidate = resolve(candidate, index);
    if (!isWithin(root, candidate)) {
      return null;
    }
    metadata = await safeStat(candidate);
  }

  if (!metadata?.isFile() || extname(candidate).toLowerCase() !== ".html") {
    return null;
  }

  let candidateRealPath: string;
  try {
    candidateRealPath = await realpath(candidate);
  } catch (error) {
    if (missingPath(error)) {
      return null;
    }
    throw error;
  }
  if (!isWithin(rootRealPath, candidateRealPath)) {
    return null;
  }

  return { filePath: candidateRealPath, metadata };
}

function asMessages(catalog: CatalogSnapshot | null): CatalogMessages {
  return catalog?.messages ?? {};
}

function catalogRevision(
  locale: string,
  catalog: CatalogSnapshot | null
): string | undefined {
  if (catalog === null) {
    return `missing:${locale}`;
  }
  return catalog.version === undefined
    ? undefined
    : `${locale}:${String(catalog.version)}`;
}

function validateOptions(options: LocalizedStaticOptions): {
  root: string;
  index: string | false;
  maxEntries: number;
  ttlMs: number | undefined;
  cacheEnabled: boolean;
} {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError("localizedStatic options must be an object");
  }
  const allowedOptions = new Set([
    "root",
    "locales",
    "defaultLocale",
    "fallbackLocale",
    "catalog",
    "bundles",
    "detect",
    "persistCookie",
    "index",
    "dotfiles",
    "fallthrough",
    "missingKey",
    "translatableAttributes",
    "cache"
  ]);
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      throw new TypeError(`Unknown localizedStatic option: ${key}`);
    }
  }
  if (typeof options.root !== "string" || options.root.length === 0) {
    throw new TypeError("root must be a non-empty string");
  }
  if (
    !Array.isArray(options.locales) ||
    options.locales.some((locale) => {
      if (typeof locale !== "string" || locale.trim() !== locale) {
        return true;
      }
      try {
        return Intl.getCanonicalLocales(locale).length !== 1;
      } catch {
        return true;
      }
    })
  ) {
    throw new TypeError("locales must contain valid BCP 47 language tags");
  }
  if (options.locales.length === 0) {
    throw new TypeError("locales must contain at least one locale");
  }
  if (!options.locales.includes(options.defaultLocale)) {
    throw new TypeError("defaultLocale must be included in locales");
  }
  if (
    options.fallbackLocale !== undefined &&
    !options.locales.includes(options.fallbackLocale)
  ) {
    throw new TypeError("fallbackLocale must be included in locales");
  }
  if (
    new Set(
      options.locales.map((locale) =>
        Intl.getCanonicalLocales(locale)[0]?.toLowerCase()
      )
    ).size !== options.locales.length
  ) {
    throw new TypeError("locales must not contain canonical duplicates");
  }
  if (
    typeof options.catalog !== "object" ||
    options.catalog === null ||
    typeof options.catalog.load !== "function" ||
    (options.catalog.clearCache !== undefined &&
      typeof options.catalog.clearCache !== "function")
  ) {
    throw new TypeError("catalog must be a catalog provider");
  }
  if (
    options.bundles !== undefined &&
    (!Array.isArray(options.bundles) ||
      options.bundles.some(
        (bundle) =>
          typeof bundle !== "string" ||
          !/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/u.test(bundle)
      ))
  ) {
    throw new TypeError("bundles must contain safe identifiers");
  }
  if (
    options.missingKey !== undefined &&
    options.missingKey !== "source" &&
    options.missingKey !== "key" &&
    options.missingKey !== "error"
  ) {
    throw new TypeError("missingKey is invalid");
  }
  if (
    options.translatableAttributes !== undefined &&
    !Array.isArray(options.translatableAttributes)
  ) {
    throw new TypeError(
      "translatableAttributes must be an array of attribute names"
    );
  }
  if (options.translatableAttributes !== undefined) {
    validateTranslatableAttributes(options.translatableAttributes);
  }
  if (options.detect !== undefined) {
    if (
      typeof options.detect !== "object" ||
      options.detect === null ||
      Array.isArray(options.detect)
    ) {
      throw new TypeError("detect must be an options object");
    }
    for (const key of Object.keys(options.detect)) {
      if (
        key !== "query" &&
        key !== "cookie" &&
        key !== "header" &&
        key !== "order"
      ) {
        throw new TypeError(`Unknown locale detection option: ${key}`);
      }
    }
    for (const name of ["query", "cookie"] as const) {
      const value = options.detect[name];
      if (
        value !== undefined &&
        value !== false &&
        (!Array.isArray(value) ||
          value.some(
            (entry) => typeof entry !== "string" || entry.length === 0
          ))
      ) {
        throw new TypeError(`detect.${name} must be false or string names`);
      }
    }
    if (
      options.detect.header !== undefined &&
      typeof options.detect.header !== "boolean"
    ) {
      throw new TypeError("detect.header must be a boolean");
    }
    if (
      options.detect.order !== undefined &&
      (!Array.isArray(options.detect.order) ||
        options.detect.order.some(
          (source) =>
            source !== "query" && source !== "cookie" && source !== "header"
        ) ||
        new Set(options.detect.order).size !== options.detect.order.length)
    ) {
      throw new TypeError(
        "detect.order must contain unique query, cookie, or header sources"
      );
    }
  }
  for (const name of ["dotfiles", "fallthrough"] as const) {
    if (options[name] !== undefined && typeof options[name] !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }

  const index = options.index === undefined ? "index.html" : options.index;
  if (
    index !== false &&
    (typeof index !== "string" ||
      index.includes("/") ||
      index.includes("\\") ||
      index === "." ||
      index === ".." ||
      extname(index).toLowerCase() !== ".html")
  ) {
    throw new TypeError("index must be a local .html file name or false");
  }

  const cacheEnabled = options.cache !== false;
  if (
    options.cache !== undefined &&
    options.cache !== false &&
    options.cache !== true &&
    (typeof options.cache !== "object" ||
      options.cache === null ||
      Array.isArray(options.cache))
  ) {
    throw new TypeError("cache must be a boolean or an options object");
  }
  if (typeof options.cache === "object" && options.cache !== null) {
    for (const key of Object.keys(options.cache)) {
      if (key !== "maxEntries" && key !== "ttlMs") {
        throw new TypeError(`Unknown cache option: ${key}`);
      }
    }
  }
  const configuredMax =
    typeof options.cache === "object" ? options.cache.maxEntries : undefined;
  const maxEntries = configuredMax ?? 100;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError("cache.maxEntries must be a positive integer");
  }
  const ttlMs =
    typeof options.cache === "object" ? options.cache.ttlMs : undefined;
  if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs < 0)) {
    throw new TypeError("cache.ttlMs must be a non-negative number");
  }
  if (options.persistCookie !== undefined && options.persistCookie !== false) {
    if (
      typeof options.persistCookie !== "object" ||
      options.persistCookie === null ||
      Array.isArray(options.persistCookie) ||
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(options.persistCookie.name) ||
      (options.persistCookie.maxAgeSeconds !== undefined &&
        (!Number.isSafeInteger(options.persistCookie.maxAgeSeconds) ||
          options.persistCookie.maxAgeSeconds < 0))
    ) {
      throw new TypeError("persistCookie contains invalid values");
    }
    for (const key of Object.keys(options.persistCookie)) {
      if (key !== "name" && key !== "maxAgeSeconds") {
        throw new TypeError(`Unknown persistCookie option: ${key}`);
      }
    }
  }

  return {
    root: resolve(options.root),
    index,
    maxEntries,
    ttlMs,
    cacheEnabled
  };
}

export function localizedStatic(
  options: LocalizedStaticOptions
): LocalizedStaticMiddleware {
  const normalized = validateOptions(options);
  let rootRealPath: Promise<string> | undefined;
  const getRootRealPath = (): Promise<string> => {
    rootRealPath ??= realpath(normalized.root);
    return rootRealPath;
  };
  const sourceCache = new LruCache<HtmlSource>(
    normalized.maxEntries,
    normalized.ttlMs
  );
  const responseCache = new LruCache<string>(
    normalized.maxEntries,
    normalized.ttlMs
  );
  const varyHeaders = varyHeadersForDetection(options.detect);

  const readHtml = async (candidate: FileCandidate): Promise<HtmlSource> => {
    const revision = `${candidate.metadata.mtimeMs}:${candidate.metadata.size}`;
    const cached = sourceCache.get(candidate.filePath);
    if (normalized.cacheEnabled && cached && cached.revision === revision) {
      return cached;
    }

    const value = {
      html: await readFile(candidate.filePath, "utf8"),
      revision
    };
    if (normalized.cacheEnabled) {
      sourceCache.set(candidate.filePath, value);
    }
    return value;
  };

  const middleware: RequestHandler = async (
    request,
    response,
    next
  ): Promise<void> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }

    try {
      const candidate = await resolveHtmlCandidate(
        request,
        normalized.root,
        await getRootRealPath(),
        normalized.index,
        options.dotfiles ?? false
      );

      if (!candidate) {
        if (options.fallthrough === false) {
          response.status(404).type("text/plain").send("Not Found");
        } else {
          next();
        }
        return;
      }

      const resolved = resolveLocale(
        {
          query: request.query as Readonly<Record<string, unknown>>,
          headers: request.headers
        },
        options.locales,
        options.defaultLocale,
        options.detect
      );

      const source = await readHtml(candidate);
      const bundles = [
        ...(options.bundles ?? []),
        ...extractI18nBundles(source.html)
      ].filter((bundle, index, values) => values.indexOf(bundle) === index);
      if (
        bundles.some(
          (bundle) =>
            !/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/u.test(bundle)
        )
      ) {
        throw new TypeError("Page bundles must contain safe identifiers");
      }
      const fallbackLocale = options.fallbackLocale ?? options.defaultLocale;
      const [selectedCatalog, fallbackCatalog] = await Promise.all([
        options.catalog.load(resolved.locale, bundles),
        resolved.locale === fallbackLocale
          ? Promise.resolve(null)
          : options.catalog.load(fallbackLocale, bundles)
      ]);

      const selectedRevision = catalogRevision(
        resolved.locale,
        selectedCatalog
      );
      const fallbackRevision =
        resolved.locale === fallbackLocale
          ? "same-as-selected"
          : catalogRevision(fallbackLocale, fallbackCatalog);
      const canCache =
        normalized.cacheEnabled &&
        selectedRevision !== undefined &&
        fallbackRevision !== undefined;
      const cacheKey = [
        candidate.filePath,
        source.revision,
        resolved.locale,
        bundles.join(","),
        selectedRevision ?? "unversioned",
        fallbackRevision ?? "unversioned",
        options.missingKey ?? "source",
        (options.translatableAttributes ?? []).join(",")
      ].join("\0");

      let output = canCache ? responseCache.get(cacheKey) : undefined;
      if (output === undefined) {
        output = transformHtml(source.html, {
          locale: resolved.locale,
          messages: asMessages(selectedCatalog),
          ...(resolved.locale === fallbackLocale
            ? {}
            : { fallbackMessages: asMessages(fallbackCatalog) }),
          ...(options.missingKey === undefined
            ? {}
            : { missingKey: options.missingKey }),
          ...(options.translatableAttributes === undefined
            ? {}
            : { translatableAttributes: options.translatableAttributes })
        }).html;
        if (canCache) {
          responseCache.set(cacheKey, output);
        }
      }

      response.set("Content-Language", resolved.locale);
      for (const header of varyHeaders) {
        response.vary(header);
      }
      if (options.persistCookie) {
        const cookie = [
          `${options.persistCookie.name}=${encodeURIComponent(resolved.locale)}`,
          "Path=/",
          "SameSite=Lax",
          ...(options.persistCookie.maxAgeSeconds === undefined
            ? []
            : [`Max-Age=${Math.floor(options.persistCookie.maxAgeSeconds)}`])
        ].join("; ");
        response.append("Set-Cookie", cookie);
      }
      response.status(200).type("html").send(output);
    } catch (error) {
      next(error);
    }
  };

  return Object.assign(middleware, {
    clearCache(): void {
      sourceCache.clear();
      responseCache.clear();
      options.catalog.clearCache?.();
    }
  });
}
