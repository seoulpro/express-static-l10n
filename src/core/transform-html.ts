import { parse, serialize, type DefaultTreeAdapterTypes } from "parse5";

import { resolveMessage } from "./messages.js";
import type {
  MissingKeyPolicy,
  TransformHtmlOptions,
  TransformHtmlResult
} from "../types.js";

const DEFAULT_ATTRIBUTES = [
  "alt",
  "aria-label",
  "content",
  "placeholder",
  "title",
  "value"
] as const;

const UNSAFE_ATTRIBUTES = new Set([
  "action",
  "archive",
  "background",
  "charset",
  "cite",
  "classid",
  "codebase",
  "data",
  "dynsrc",
  "formaction",
  "href",
  "http-equiv",
  "itemid",
  "longdesc",
  "lowsrc",
  "manifest",
  "ping",
  "poster",
  "profile",
  "src",
  "srcdoc",
  "srcset",
  "style",
  "usemap",
  "xml:base",
  "xmlns",
  "xmlns:xlink",
  "xlink:href"
]);

const RAW_TEXT_ELEMENTS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "xmp"
]);

function isUnsafeAttribute(attribute: string): boolean {
  const normalized = attribute.toLowerCase();
  return normalized.startsWith("on") || UNSAFE_ATTRIBUTES.has(normalized);
}

export function validateTranslatableAttributes(
  attributes: readonly string[]
): void {
  if (
    !Array.isArray(attributes) ||
    attributes.some(
      (attribute) =>
        typeof attribute !== "string" ||
        !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/u.test(attribute)
    )
  ) {
    throw new TypeError(
      "translatableAttributes must contain valid attribute names"
    );
  }
  for (const attribute of attributes) {
    if (isUnsafeAttribute(attribute)) {
      throw new InvalidAttributeBindingError(attribute);
    }
  }
}

export class MissingTranslationError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Missing translation: ${key}`);
    this.name = "MissingTranslationError";
    this.key = key;
  }
}

export class InvalidAttributeBindingError extends Error {
  constructor(binding: string) {
    super(
      `Invalid data-i18n-attr binding "${binding}". Use an allowed attribute name or attribute:translation.key.`
    );
    this.name = "InvalidAttributeBindingError";
  }
}

export class InvalidTextBindingError extends Error {
  constructor(tagName: string) {
    super(`data-i18n cannot translate the contents of <${tagName}>`);
    this.name = "InvalidTextBindingError";
  }
}

function isElement(
  node: DefaultTreeAdapterTypes.Node
): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node;
}

function getAttribute(
  element: DefaultTreeAdapterTypes.Element,
  name: string
): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(
  element: DefaultTreeAdapterTypes.Element,
  name: string,
  value: string
): void {
  const existing = element.attrs.find((attribute) => attribute.name === name);
  if (existing) {
    existing.value = value;
  } else {
    element.attrs.push({ name, value });
  }
}

function replaceText(
  element: DefaultTreeAdapterTypes.Element,
  value: string
): void {
  const text: DefaultTreeAdapterTypes.TextNode = {
    nodeName: "#text",
    parentNode: element,
    value
  };
  element.childNodes = [text];
}

interface AttributeBinding {
  attribute: string;
  key?: string;
}

function parseAttributeBindings(value: string): AttributeBinding[] {
  const bindings: AttributeBinding[] = [];
  for (const token of value.split(/[\s,;]+/u).filter(Boolean)) {
    const separator = token.indexOf(":");
    if (separator === -1) {
      bindings.push({ attribute: token.toLowerCase() });
      continue;
    }
    if (separator === 0 || separator === token.length - 1) {
      throw new InvalidAttributeBindingError(token);
    }
    bindings.push({
      attribute: token.slice(0, separator).toLowerCase(),
      key: token.slice(separator + 1)
    });
  }
  return bindings;
}

function missingValue(
  key: string,
  behavior: MissingKeyPolicy
): string | undefined {
  if (behavior === "key") {
    return key;
  }
  if (behavior === "error") {
    throw new MissingTranslationError(key);
  }
  return undefined;
}

export function transformHtml(
  html: string,
  options: TransformHtmlOptions
): TransformHtmlResult {
  if (typeof html !== "string") {
    throw new TypeError("html must be a string");
  }
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError("transform options must be an object");
  }
  if (typeof options.locale !== "string" || options.locale.length === 0) {
    throw new TypeError("locale must be a non-empty string");
  }
  if (
    options.missingKey !== undefined &&
    options.missingKey !== "source" &&
    options.missingKey !== "key" &&
    options.missingKey !== "error"
  ) {
    throw new TypeError('missingKey must be "source", "key", or "error"');
  }
  const document = parse(html);
  const translatedKeys = new Set<string>();
  const missingKeys = new Set<string>();
  const missingBehavior = options.missingKey ?? "source";
  const configuredAttributes =
    options.translatableAttributes ?? DEFAULT_ATTRIBUTES;
  validateTranslatableAttributes(configuredAttributes);
  const allowedAttributes = new Set(
    configuredAttributes.map((attribute) => attribute.toLowerCase())
  );

  const interpolate = (
    message: string,
    parameters: Readonly<Record<string, string | number | boolean | null>>
  ): string =>
    message.replace(
      /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu,
      (placeholder, name: string) =>
        Object.hasOwn(parameters, name)
          ? String(parameters[name] ?? "")
          : placeholder
    );

  const translate = (
    key: string,
    parameters: Readonly<Record<string, string | number | boolean | null>>
  ): string | undefined => {
    const message = resolveMessage(
      key,
      options.messages,
      options.fallbackMessages
    );
    if (message !== undefined) {
      translatedKeys.add(key);
      return interpolate(message, parameters);
    }
    missingKeys.add(key);
    return missingValue(key, missingBehavior);
  };

  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if (isElement(node)) {
      if (node.tagName === "html") {
        setAttribute(node, "lang", options.locale);
      }

      const textKey = getAttribute(node, "data-i18n");
      const rawParameters = getAttribute(node, "data-i18n-params");
      let parameters: Readonly<
        Record<string, string | number | boolean | null>
      > = {};
      if (rawParameters) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawParameters);
        } catch {
          throw new TypeError("data-i18n-params must contain valid JSON");
        }
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed) ||
          Object.values(parsed).some(
            (value) =>
              value !== null &&
              typeof value !== "string" &&
              typeof value !== "number" &&
              typeof value !== "boolean"
          )
        ) {
          throw new TypeError(
            "data-i18n-params values must be strings, numbers, booleans, or null"
          );
        }
        parameters = parsed as Readonly<
          Record<string, string | number | boolean | null>
        >;
      }
      if (textKey) {
        if (RAW_TEXT_ELEMENTS.has(node.tagName)) {
          throw new InvalidTextBindingError(node.tagName);
        }
        const translated = translate(textKey, parameters);
        if (translated !== undefined) {
          replaceText(node, translated);
        }
      }

      const attributeSpec = getAttribute(node, "data-i18n-attr");
      if (attributeSpec) {
        for (const binding of parseAttributeBindings(attributeSpec)) {
          const isHttpEquivalentContent =
            node.tagName === "meta" &&
            binding.attribute === "content" &&
            getAttribute(node, "http-equiv") !== undefined;
          if (
            isHttpEquivalentContent ||
            isUnsafeAttribute(binding.attribute) ||
            !allowedAttributes.has(binding.attribute)
          ) {
            throw new InvalidAttributeBindingError(
              binding.key
                ? `${binding.attribute}:${binding.key}`
                : binding.attribute
            );
          }
          const key = binding.key ?? textKey;
          if (!key) {
            throw new InvalidAttributeBindingError(binding.attribute);
          }
          const translated = translate(key, parameters);
          if (translated !== undefined) {
            setAttribute(node, binding.attribute, translated);
          }
        }
      }

      if (node.tagName === "template" && "content" in node) {
        visit(node.content);
      }
    }

    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  };

  visit(document);

  return {
    html: serialize(document),
    translatedKeys: [...translatedKeys],
    missingKeys: [...missingKeys]
  };
}

export function extractI18nBundles(html: string): string[] {
  if (typeof html !== "string") {
    throw new TypeError("html must be a string");
  }
  const document = parse(html);
  const bundles: string[] = [];

  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if (
      isElement(node) &&
      node.tagName === "meta" &&
      getAttribute(node, "name")?.toLowerCase() === "i18n-bundles"
    ) {
      const content = getAttribute(node, "content") ?? "";
      for (const bundle of content.split(",").map((value) => value.trim())) {
        if (bundle && !bundles.includes(bundle)) {
          bundles.push(bundle);
        }
      }
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  };

  visit(document);
  return bundles;
}
