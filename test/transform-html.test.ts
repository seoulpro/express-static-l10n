import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { describe, expect, it } from "vitest";

import {
  extractI18nBundles,
  InvalidAttributeBindingError,
  InvalidTextBindingError,
  lookupMessage,
  MissingTranslationError,
  transformHtml
} from "../src/index.js";

describe("transformHtml", () => {
  it("rejects invalid policies and unsafe custom attributes", () => {
    expect(() => transformHtml(null as never, {} as never)).toThrow(
      "html must be a string"
    );
    expect(() => transformHtml("<p>Source</p>", null as never)).toThrow(
      "transform options must be an object"
    );
    expect(() =>
      transformHtml("<p>Source</p>", {
        locale: "",
        messages: {}
      })
    ).toThrow("locale must be a non-empty string");
    expect(() =>
      transformHtml("<p>Source</p>", {
        locale: "en",
        messages: {},
        missingKey: "fallback"
      } as never)
    ).toThrow("missingKey");
    expect(() =>
      transformHtml(`<button data-i18n-attr="onclick:action">Safe</button>`, {
        locale: "en",
        messages: { action: "alert(1)" },
        translatableAttributes: ["OnClick"]
      })
    ).toThrow(InvalidAttributeBindingError);
    expect(() =>
      transformHtml("<p>Source</p>", {
        locale: "en",
        messages: {},
        translatableAttributes: ["not an attribute"]
      })
    ).toThrow("valid attribute names");
  });

  it("localizes text, explicit attributes, and the html lang attribute", () => {
    const result = transformHtml(
      `<!doctype html>
      <html lang="en">
        <body>
          <h1 data-i18n="home.title">Original</h1>
          <input
            placeholder="Search"
            aria-label="Search"
            data-i18n-attr="placeholder:search.placeholder aria-label:search.label"
          >
        </body>
      </html>`,
      {
        locale: "ko",
        messages: {
          home: { title: "환영합니다" },
          search: {
            placeholder: "검색",
            label: "사이트 검색"
          }
        }
      }
    );

    expect(result.html).toContain('<html lang="ko">');
    expect(result.html).toContain('<h1 data-i18n="home.title">환영합니다</h1>');
    expect(result.html).toContain('placeholder="검색"');
    expect(result.html).toContain('aria-label="사이트 검색"');
    expect(result.translatedKeys).toEqual([
      "home.title",
      "search.placeholder",
      "search.label"
    ]);
    expect(result.missingKeys).toEqual([]);
  });

  it("escapes translations as text and attribute values", () => {
    const result = transformHtml(
      `<html><body>
        <p data-i18n="message">Safe</p>
        <input data-i18n-attr="title:tooltip">
      </body></html>`,
      {
        locale: "en",
        messages: {
          message: "<script>alert(1)</script>",
          tooltip: `"quoted" & safe`
        }
      }
    );

    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).toContain('title="&quot;quoted&quot; &amp; safe"');
  });

  it("uses exact flat keys before dotted nested lookup", () => {
    const result = transformHtml(
      `<html><body><p data-i18n="home.title">Original</p></body></html>`,
      {
        locale: "en",
        messages: {
          "home.title": "Flat value",
          home: { title: "Nested value" }
        }
      }
    );

    expect(result.html).toContain(">Flat value</p>");
  });

  it("falls back per key and preserves original content by default", () => {
    const result = transformHtml(
      `<html><body>
        <p data-i18n="shared">Original shared</p>
        <p data-i18n="missing">Original missing</p>
      </body></html>`,
      {
        locale: "ko",
        messages: {},
        fallbackMessages: { shared: "Fallback" }
      }
    );

    expect(result.html).toContain(">Fallback</p>");
    expect(result.html).toContain(">Original missing</p>");
    expect(result.missingKeys).toEqual(["missing"]);
  });

  it("can expose missing keys or fail fast", () => {
    const keyResult = transformHtml(
      `<html><body><p data-i18n="missing">Original</p></body></html>`,
      {
        locale: "en",
        messages: {},
        missingKey: "key"
      }
    );
    expect(keyResult.html).toContain(">missing</p>");

    expect(() =>
      transformHtml(
        `<html><body><p data-i18n="missing">Original</p></body></html>`,
        {
          locale: "en",
          messages: {},
          missingKey: "error"
        }
      )
    ).toThrow(MissingTranslationError);
  });

  it("rejects malformed and unsafe attribute bindings", () => {
    expect(() =>
      transformHtml(
        `<html><body><input data-i18n-attr="placeholder"></body></html>`,
        { locale: "en", messages: {} }
      )
    ).toThrow(InvalidAttributeBindingError);

    expect(() =>
      transformHtml(
        `<html><body><button data-i18n-attr="onclick:action">Go</button></body></html>`,
        { locale: "en", messages: { action: "alert(1)" } }
      )
    ).toThrow(InvalidAttributeBindingError);

    expect(() =>
      transformHtml(
        `<html><body><a data-i18n="link" data-i18n-attr="href">Go</a></body></html>`,
        {
          locale: "en",
          messages: { link: "javascript:alert(1)" },
          translatableAttributes: ["href"]
        }
      )
    ).toThrow(InvalidAttributeBindingError);
  });

  it("permanently rejects URL-bearing custom attributes", () => {
    for (const attribute of [
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
      "usemap",
      "xml:base",
      "xmlns",
      "xmlns:xlink",
      "xlink:href"
    ]) {
      expect(() =>
        transformHtml(`<div data-i18n-attr="${attribute}:target"></div>`, {
          locale: "en",
          messages: { target: "https://example.invalid" },
          translatableAttributes: [attribute]
        })
      ).toThrow(InvalidAttributeBindingError);
    }
  });

  it("rejects text bindings on raw-text elements", () => {
    for (const tagName of [
      "iframe",
      "noembed",
      "noframes",
      "noscript",
      "plaintext",
      "script",
      "style",
      "xmp"
    ]) {
      expect(() =>
        transformHtml(`<${tagName} data-i18n="payload">safe</${tagName}>`, {
          locale: "en",
          messages: {
            payload: `</${tagName}><script>alert(1)</script>`
          }
        })
      ).toThrow(InvalidTextBindingError);
    }
  });

  it("rejects translated content on HTTP-equivalent meta elements", () => {
    expect(() =>
      transformHtml(
        `<meta
          http-equiv="refresh"
          data-i18n-attr="content:redirect"
          content="30"
        >`,
        {
          locale: "en",
          messages: { redirect: "0; url=https://example.invalid" }
        }
      )
    ).toThrow(InvalidAttributeBindingError);

    const description = transformHtml(
      `<meta
        name="description"
        data-i18n-attr="content:description"
        content="Source description"
      >`,
      {
        locale: "en",
        messages: { description: "Translated description" }
      }
    );
    expect(description.html).toContain('name="description"');
    expect(description.html).toContain('content="Translated description"');
  });

  it("translates content inside templates", () => {
    const result = transformHtml(
      `<html><body><template><span data-i18n="later">Later</span></template></body></html>`,
      { locale: "en", messages: { later: "Ready" } }
    );

    expect(result.html).toContain(
      '<template><span data-i18n="later">Ready</span></template>'
    );
  });

  it("applies one key to declared attributes and interpolates parameters", () => {
    const result = transformHtml(
      `<html><body>
        <button
          data-i18n="greeting"
          data-i18n-attr="title aria-label"
          data-i18n-params='{"name":"Kim"}'
        >Original</button>
      </body></html>`,
      {
        locale: "en",
        messages: { greeting: "Hello, {{name}}!" }
      }
    );

    expect(result.html).toContain(">Hello, Kim!</button>");
    expect(result.html).toContain('title="Hello, Kim!"');
    expect(result.html).toContain('aria-label="Hello, Kim!"');
  });

  it("preserves an intentional empty translation", () => {
    const result = transformHtml(
      `<html><body><span data-i18n="optional">Source</span></body></html>`,
      {
        locale: "en",
        messages: { optional: "" }
      }
    );
    expect(result.html).toContain('<span data-i18n="optional"></span>');
    expect(result.missingKeys).toEqual([]);
  });

  it("extracts ordered, deduplicated bundle metadata", () => {
    expect(
      extractI18nBundles(
        `<html><head>
          <meta name="i18n-bundles" content="common, home,common">
        </head></html>`
      )
    ).toEqual(["common", "home"]);
    expect(() => extractI18nBundles(null as never)).toThrow(
      "html must be a string"
    );
  });

  it("rejects malformed interpolation parameters", () => {
    expect(() =>
      transformHtml(
        `<html><body><p data-i18n="hello" data-i18n-params="{bad}">Hi</p></body></html>`,
        { locale: "en", messages: { hello: "Hello" } }
      )
    ).toThrow("valid JSON");
    expect(() =>
      transformHtml(
        `<p
          data-i18n="hello"
          data-i18n-params='{"nested":{"unsafe":true}}'
        >Hi</p>`,
        { locale: "en", messages: { hello: "Hello" } }
      )
    ).toThrow("values must be");
  });

  it("escapes hostile interpolation values as text", () => {
    const result = transformHtml(
      `<html><body>
        <p
          data-i18n="hello"
          data-i18n-params='{"name":"<img src=x onerror=alert(1)>"}'
        >Hello</p>
      </body></html>`,
      {
        locale: "en",
        messages: { hello: "Hello, {{name}}" }
      }
    );

    expect(result.html).toContain("Hello, &lt;img src=x onerror=alert(1)&gt;");
    const document = parse(result.html);
    const countElements = (
      node: DefaultTreeAdapterTypes.Node,
      tagName: string
    ): number => {
      const self = "tagName" in node && node.tagName === tagName ? 1 : 0;
      return (
        self +
        ("childNodes" in node
          ? node.childNodes.reduce(
              (total, child) => total + countElements(child, tagName),
              0
            )
          : 0)
      );
    };
    expect(countElements(document, "img")).toBe(0);
  });

  it("does not traverse prototype-related translation keys", () => {
    expect(lookupMessage({}, "constructor")).toBeUndefined();
    const result = transformHtml(
      `<html><body>
        <p data-i18n="constructor.prototype.polluted">Source</p>
      </body></html>`,
      {
        locale: "en",
        messages: {}
      }
    );
    expect(result.html).toContain(">Source</p>");
    expect(result.missingKeys).toEqual(["constructor.prototype.polluted"]);
  });
});
