import type { RequestHandler } from "express";

export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

export type CatalogMessages = MessageTree;

export interface CatalogSnapshot {
  messages: CatalogMessages;
  /**
   * Changes whenever the underlying catalog changes. Sources that omit a
   * version remain correct, but transformed-response caching is disabled.
   */
  version?: string | number;
}

export interface CatalogProvider {
  load(
    locale: string,
    bundles?: readonly string[]
  ): Promise<CatalogSnapshot | null>;
  clearCache?(): void;
}

export type CatalogErrorStrategy = "throw" | "stale";

export interface JsonDirectoryOptions {
  root: string;
  /**
   * `stale` serves the last successfully parsed catalog after a later read or
   * parse failure. The first failure still throws because no safe value exists.
   */
  onError?: CatalogErrorStrategy;
  /**
   * With bundles, the default layout is `<root>/<locale>/<bundle>.json`.
   * Without bundles, it is `<root>/<locale>.json`.
   */
  fileName?: (locale: string, bundle?: string) => string;
}

export type LocaleDetectionSource = "query" | "cookie" | "header";

export interface LocaleDetectionOptions {
  query?: readonly string[] | false;
  cookie?: readonly string[] | false;
  header?: boolean;
  order?: readonly LocaleDetectionSource[];
}

export interface LocaleRequest {
  query?: Readonly<Record<string, unknown>>;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

export interface ResolvedLocale {
  locale: string;
  source: LocaleDetectionSource | "default";
  requested?: string;
}

export type MissingKeyPolicy = "source" | "key" | "error";

export interface TransformHtmlOptions {
  locale: string;
  messages: CatalogMessages;
  fallbackMessages?: CatalogMessages;
  missingKey?: MissingKeyPolicy;
  translatableAttributes?: readonly string[];
}

export interface TransformHtmlResult {
  html: string;
  translatedKeys: string[];
  missingKeys: string[];
}

export interface ResponseCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export interface PersistCookieOptions {
  name: string;
  maxAgeSeconds?: number;
}

export interface LocalizedStaticOptions {
  root: string;
  locales: readonly string[];
  defaultLocale: string;
  fallbackLocale?: string;
  catalog: CatalogProvider;
  bundles?: readonly string[];
  detect?: LocaleDetectionOptions;
  persistCookie?: false | PersistCookieOptions;
  index?: string | false;
  dotfiles?: boolean;
  fallthrough?: boolean;
  missingKey?: MissingKeyPolicy;
  translatableAttributes?: readonly string[];
  cache?: boolean | ResponseCacheOptions;
}

export type LocalizedStaticMiddleware = RequestHandler & {
  clearCache(): void;
};

/** @deprecated Use CatalogSnapshot. */
export type LoadedCatalog = CatalogSnapshot;
/** @deprecated Use CatalogProvider. */
export type CatalogSource = CatalogProvider;
/** @deprecated Use MissingKeyPolicy. */
export type MissingTranslationBehavior = MissingKeyPolicy;
