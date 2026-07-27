import type {
  LocaleDetectionOptions,
  LocaleDetectionSource,
  LocaleRequest,
  ResolvedLocale
} from "../types.js";

const DEFAULT_ORDER: readonly LocaleDetectionSource[] = [
  "query",
  "cookie",
  "header"
];

interface NormalizedDetection {
  query: readonly string[] | false;
  cookie: readonly string[] | false;
  header: boolean;
  order: readonly LocaleDetectionSource[];
}

function normalizeDetection(
  options: LocaleDetectionOptions | undefined
): NormalizedDetection {
  return {
    query: options?.query === undefined ? ["lang", "locale"] : options.query,
    cookie: options?.cookie === undefined ? ["locale"] : options.cookie,
    header: options?.header ?? true,
    order: options?.order ?? DEFAULT_ORDER
  };
}

function canonicalLocale(locale: string): string | undefined {
  const value = locale.trim();
  if (!value) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function supportedLocale(
  candidate: string,
  locales: readonly string[]
): string | undefined {
  const canonicalCandidate = canonicalLocale(candidate);
  if (!canonicalCandidate) {
    return undefined;
  }

  const normalized = locales.map((locale) => ({
    original: locale,
    canonical: canonicalLocale(locale) ?? locale
  }));

  const exact = normalized.find(
    ({ canonical }) =>
      canonical.toLowerCase() === canonicalCandidate.toLowerCase()
  );
  if (exact) {
    return exact.original;
  }

  const candidateLanguage = canonicalCandidate.split("-")[0]?.toLowerCase();
  if (!candidateLanguage) {
    return undefined;
  }

  const languageMatch = normalized.find(
    ({ canonical }) =>
      canonical.split("-")[0]?.toLowerCase() === candidateLanguage
  );
  return languageMatch?.original;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === "string");
  }
  return undefined;
}

export function parseCookieHeader(
  header: string | undefined
): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }

  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = segment.slice(0, separator).trim();
    const rawValue = segment.slice(separator + 1).trim();
    if (!name) {
      continue;
    }
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return cookies;
}

interface LanguagePreference {
  tag: string;
  quality: number;
  order: number;
}

export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) {
    return [];
  }

  const preferences: LanguagePreference[] = [];
  for (const [order, entry] of header.split(",").entries()) {
    const [rawTag, ...parameters] = entry.trim().split(";");
    const tag = rawTag?.trim();
    if (!tag || tag === "*") {
      continue;
    }

    let quality = 1;
    for (const parameter of parameters) {
      if (!/^\s*q\s*=/iu.test(parameter)) {
        continue;
      }
      const match = /^\s*q\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*$/i.exec(parameter);
      quality = match?.[1] ? Number(match[1]) : 0;
    }
    if (quality > 0) {
      preferences.push({ tag, quality, order });
    }
  }

  return preferences
    .sort(
      (left, right) => right.quality - left.quality || left.order - right.order
    )
    .map(({ tag }) => tag);
}

function headerValue(request: LocaleRequest, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  const value =
    request.headers[name] ??
    request.headers[normalizedName] ??
    Object.entries(request.headers).find(
      ([headerName]) => headerName.toLowerCase() === normalizedName
    )?.[1];
  if (typeof value === "string" || value === undefined) {
    return value;
  }
  return value.join(",");
}

function candidatesForSource(
  source: LocaleDetectionSource,
  request: LocaleRequest,
  detection: NormalizedDetection
): string[] {
  if (source === "query") {
    if (detection.query === false) {
      return [];
    }
    return detection.query.flatMap((name) => {
      const value = firstString(request.query?.[name]);
      return value ? [value] : [];
    });
  }

  if (source === "cookie") {
    if (detection.cookie === false) {
      return [];
    }
    const cookies = parseCookieHeader(headerValue(request, "cookie"));
    return detection.cookie.flatMap((name) => {
      const value = cookies.get(name);
      return value ? [value] : [];
    });
  }

  if (!detection.header) {
    return [];
  }
  return parseAcceptLanguage(headerValue(request, "accept-language"));
}

export function resolveLocale(
  request: LocaleRequest,
  locales: readonly string[],
  defaultLocale: string,
  options?: LocaleDetectionOptions
): ResolvedLocale {
  if (locales.length === 0) {
    throw new TypeError("locales must contain at least one locale");
  }
  if (!locales.includes(defaultLocale)) {
    throw new TypeError("defaultLocale must be included in locales");
  }

  const detection = normalizeDetection(options);
  const enabled = new Set<LocaleDetectionSource>([
    ...(detection.query === false ? [] : ["query" as const]),
    ...(detection.cookie === false ? [] : ["cookie" as const]),
    ...(detection.header ? ["header" as const] : [])
  ]);

  for (const source of detection.order) {
    if (!enabled.has(source)) {
      continue;
    }
    for (const requested of candidatesForSource(source, request, detection)) {
      const locale = supportedLocale(requested, locales);
      if (locale) {
        return { locale, source, requested };
      }
    }
  }

  return { locale: defaultLocale, source: "default" };
}

export function varyHeadersForDetection(
  options?: LocaleDetectionOptions
): string[] {
  const detection = normalizeDetection(options);
  const vary: string[] = [];
  if (detection.cookie !== false) {
    vary.push("Cookie");
  }
  if (detection.header) {
    vary.push("Accept-Language");
  }
  return vary;
}
