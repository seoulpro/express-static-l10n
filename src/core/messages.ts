import type { CatalogMessages } from "../types.js";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function own(object: object, key: string): boolean {
  return Object.hasOwn(object, key);
}

export function lookupMessage(
  messages: CatalogMessages | undefined,
  key: string
): string | undefined {
  if (!messages) {
    return undefined;
  }
  if (UNSAFE_KEYS.has(key)) {
    return undefined;
  }

  const direct = messages[key];
  if (own(messages, key) && typeof direct === "string") {
    return direct;
  }

  let current: unknown = messages;
  for (const part of key.split(".")) {
    if (UNSAFE_KEYS.has(part)) {
      return undefined;
    }
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !own(current, part)
    ) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

export function resolveMessage(
  key: string,
  messages: CatalogMessages,
  fallbackMessages?: CatalogMessages
): string | undefined {
  return lookupMessage(messages, key) ?? lookupMessage(fallbackMessages, key);
}
