import { describe, expect, it } from "vitest";

import {
  parseAcceptLanguage,
  parseCookieHeader,
  resolveLocale,
  varyHeadersForDetection
} from "../src/index.js";

describe("locale negotiation", () => {
  it("uses query, cookie, then Accept-Language by default", () => {
    const result = resolveLocale(
      {
        query: { lang: "ko-KR" },
        headers: {
          cookie: "locale=fr",
          "accept-language": "en-US,en;q=0.8"
        }
      },
      ["en", "ko", "fr"],
      "en"
    );

    expect(result).toEqual({
      locale: "ko",
      requested: "ko-KR",
      source: "query"
    });
  });

  it("honors quality values and stable ordering", () => {
    expect(
      parseAcceptLanguage("fr;q=0.4, ko-KR;q=0.9, en;q=0.9, de;q=0, *;q=1")
    ).toEqual(["ko-KR", "en", "fr"]);

    const result = resolveLocale(
      {
        headers: {
          "accept-language": "fr;q=0.4, ko-KR;q=0.9, en;q=0.8"
        }
      },
      ["en", "ko", "fr"],
      "en",
      { query: false, cookie: false }
    );
    expect(result.locale).toBe("ko");
    expect(result.source).toBe("header");
    expect(parseAcceptLanguage("ko;q=invalid, en;q=0.5")).toEqual(["en"]);
  });

  it("keeps malformed cookie values non-fatal", () => {
    const cookies = parseCookieHeader(
      "locale=%E0%A4%A; theme=dark; malformed; encoded=hello%20world"
    );
    expect(cookies.get("locale")).toBe("%E0%A4%A");
    expect(cookies.get("theme")).toBe("dark");
    expect(cookies.get("encoded")).toBe("hello world");
  });

  it("supports a custom source order and disabled detectors", () => {
    const result = resolveLocale(
      {
        query: { language: "ko" },
        headers: {
          cookie: "language=fr",
          "accept-language": "en"
        }
      },
      ["en", "ko", "fr"],
      "en",
      {
        query: ["language"],
        cookie: ["language"],
        header: false,
        order: ["cookie", "query"]
      }
    );
    expect(result.locale).toBe("fr");
    expect(varyHeadersForDetection({ cookie: false })).toEqual([
      "Accept-Language"
    ]);
  });

  it("returns the default for invalid and unsupported input", () => {
    const result = resolveLocale(
      {
        query: { lang: "../../etc/passwd" },
        headers: { "accept-language": "zz-ZZ" }
      },
      ["en", "ko"],
      "en"
    );
    expect(result).toEqual({ locale: "en", source: "default" });
  });

  it("matches header names case-insensitively for direct API callers", () => {
    const result = resolveLocale(
      {
        headers: {
          "Accept-Language": "ko",
          Cookie: "locale=en"
        }
      },
      ["en", "ko"],
      "en",
      { query: false, cookie: false }
    );
    expect(result).toEqual({
      locale: "ko",
      requested: "ko",
      source: "header"
    });
  });

  it("joins repeated header values for direct API callers", () => {
    const result = resolveLocale(
      {
        headers: {
          "accept-language": ["fr;q=0.5", "ko;q=0.9"]
        }
      },
      ["en", "fr", "ko"],
      "en",
      { query: false, cookie: false }
    );
    expect(result.locale).toBe("ko");
  });

  it("validates the locale set", () => {
    expect(() => resolveLocale({ headers: {} }, [], "en")).toThrow(
      "at least one"
    );
    expect(() => resolveLocale({ headers: {} }, ["ko"], "en")).toThrow(
      "included"
    );
  });
});
