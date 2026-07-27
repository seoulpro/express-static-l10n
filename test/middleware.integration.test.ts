import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express5, { type Express } from "express";
import express4 from "express4";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonDirectory, localizedStatic } from "../src/index.js";

const temporaryDirectories: string[] = [];
let siteRoot: string;
let catalogRoot: string;

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(async () => {
  siteRoot = await makeTemporaryDirectory("express-static-site-");
  catalogRoot = await makeTemporaryDirectory("express-static-catalog-");
  await mkdir(join(siteRoot, "docs"));
  await writeFile(
    join(siteRoot, "index.html"),
    `<!doctype html>
    <html lang="en">
      <head><title data-i18n="site.title">Example</title></head>
      <body>
        <main>
          <h1 data-i18n="home.title">Welcome</h1>
          <p data-i18n="shared">Shared fallback</p>
          <input
            placeholder="Search"
            data-i18n-attr="placeholder:search.placeholder aria-label:search.label"
          >
        </main>
      </body>
    </html>`
  );
  await writeFile(
    join(siteRoot, "docs", "index.html"),
    `<html><body><h1 data-i18n="docs.title">Docs</h1></body></html>`
  );
  await writeFile(join(siteRoot, "app.js"), "console.log('asset');");
  await writeFile(
    join(catalogRoot, "en.json"),
    JSON.stringify({
      site: { title: "Example" },
      home: { title: "Welcome" },
      shared: "Shared fallback",
      docs: { title: "Documentation" },
      search: { placeholder: "Search", label: "Search site" }
    })
  );
  await writeFile(
    join(catalogRoot, "ko.json"),
    JSON.stringify({
      site: { title: "예시" },
      home: { title: "환영합니다" },
      docs: { title: "문서" },
      search: { placeholder: "검색", label: "사이트 검색" }
    })
  );
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

function addLocalizedMiddleware(app: Express): Express {
  app.use(
    localizedStatic({
      root: siteRoot,
      locales: ["en", "ko"],
      defaultLocale: "en",
      catalog: jsonDirectory({ root: catalogRoot })
    })
  );
  app.use((_request, response) => {
    response.status(418).send("fallthrough");
  });
  return app;
}

describe.each([
  ["Express 5", () => express5()],
  ["Express 4", () => express4()]
] as const)("%s integration", (_name, createApp) => {
  it("serves localized static HTML", async () => {
    const response = await request(addLocalizedMiddleware(createApp()))
      .get("/")
      .set("Accept-Language", "ko-KR, en;q=0.8")
      .expect(200);

    expect(response.headers["content-language"]).toBe("ko");
    expect(response.headers.vary).toContain("Cookie");
    expect(response.headers.vary).toContain("Accept-Language");
    expect(response.text).toContain('<html lang="ko">');
    expect(response.text).toContain(">환영합니다</h1>");
    expect(response.text).toContain(">Shared fallback</p>");
    expect(response.text).toContain('placeholder="검색"');
  });
});

describe("localizedStatic behavior", () => {
  it("rejects misspelled and malformed options at construction", () => {
    const base = {
      root: siteRoot,
      locales: ["en"],
      defaultLocale: "en",
      catalog: jsonDirectory({ root: catalogRoot })
    };
    expect(() =>
      localizedStatic({ ...base, fallThrough: false } as never)
    ).toThrow("Unknown localizedStatic option");
    expect(() =>
      localizedStatic({
        ...base,
        detect: { order: ["headers"] }
      } as never)
    ).toThrow("detect.order");
    expect(() =>
      localizedStatic({
        ...base,
        cache: { maxEntires: 10 }
      } as never)
    ).toThrow("Unknown cache option");
    expect(() =>
      localizedStatic({
        ...base,
        locales: ["en-US", "en-us"],
        defaultLocale: "en-US"
      })
    ).toThrow("canonical duplicates");
    expect(() =>
      localizedStatic({
        ...base,
        locales: ["en_US"],
        defaultLocale: "en_US"
      })
    ).toThrow("BCP 47");
    expect(() =>
      localizedStatic({
        ...base,
        translatableAttributes: ["background"]
      })
    ).toThrow("Invalid data-i18n-attr");
    expect(() =>
      localizedStatic({
        ...base,
        persistCookie: {
          name: "locale",
          maxAgeSeconds: Number.MAX_VALUE
        }
      })
    ).toThrow("persistCookie");
    expect(() =>
      localizedStatic({
        ...base,
        cache: { maxEntries: 0 }
      })
    ).toThrow("positive integer");
    expect(() =>
      localizedStatic({
        ...base,
        cache: { ttlMs: -1 }
      })
    ).toThrow("non-negative");
    expect(() =>
      localizedStatic({
        ...base,
        persistCookie: {
          name: "locale",
          domain: "example.invalid"
        }
      } as never)
    ).toThrow("Unknown persistCookie option");
  });

  it("lets the query override cookie and header detection", async () => {
    const response = await request(addLocalizedMiddleware(express5()))
      .get("/?lang=en")
      .set("Cookie", "locale=ko")
      .set("Accept-Language", "ko")
      .expect(200);

    expect(response.headers["content-language"]).toBe("en");
    expect(response.text).toContain(">Welcome</h1>");
  });

  it("serves directory indexes but falls through for assets", async () => {
    const app = addLocalizedMiddleware(express5());
    const docs = await request(app)
      .get("/docs/")
      .set("Accept-Language", "ko")
      .expect(200);
    expect(docs.text).toContain(">문서</h1>");

    const asset = await request(app).get("/app.js").expect(418);
    expect(asset.text).toBe("fallthrough");
  });

  it("ignores methods other than GET and HEAD", async () => {
    const response = await request(addLocalizedMiddleware(express5()))
      .post("/")
      .expect(418);
    expect(response.text).toBe("fallthrough");
  });

  it("honors disabled indexes and explicitly enabled dotfiles", async () => {
    await writeFile(
      join(siteRoot, ".hidden.html"),
      `<html><body><p data-i18n="home.title">Source</p></body></html>`
    );
    const app = express5();
    app.use(
      localizedStatic({
        root: siteRoot,
        locales: ["en"],
        defaultLocale: "en",
        catalog: jsonDirectory({ root: catalogRoot }),
        dotfiles: true,
        index: false
      })
    );
    app.use((_request, response) => {
      response.status(418).send("fallthrough");
    });

    await request(app).get("/").expect(418);
    const hidden = await request(app).get("/.hidden.html").expect(200);
    expect(hidden.text).toContain(">Welcome</p>");
  });

  it("supports HEAD without returning a response body", async () => {
    const response = await request(addLocalizedMiddleware(express5()))
      .head("/")
      .set("Accept-Language", "en")
      .expect(200);
    expect(response.text).toBeUndefined();
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("does not follow a symlink outside the configured root", async () => {
    const outside = await makeTemporaryDirectory("express-static-outside-");
    await writeFile(join(outside, "secret.html"), "<p>secret</p>");
    await symlink(join(outside, "secret.html"), join(siteRoot, "escape.html"));

    const response = await request(addLocalizedMiddleware(express5()))
      .get("/escape.html")
      .expect(418);
    expect(response.text).toBe("fallthrough");
  });

  it("hides dotfiles and malformed paths", async () => {
    await writeFile(join(siteRoot, ".hidden.html"), "<p>hidden</p>");
    const app = addLocalizedMiddleware(express5());

    await request(app).get("/.hidden.html").expect(418);
    await request(app).get("/%5C..%5Csecret.html").expect(418);
  });

  it("can terminate misses with a neutral 404", async () => {
    const app = express5();
    app.use(
      localizedStatic({
        root: siteRoot,
        locales: ["en"],
        defaultLocale: "en",
        catalog: jsonDirectory({ root: catalogRoot }),
        fallthrough: false
      })
    );

    const response = await request(app).get("/missing.html").expect(404);
    expect(response.text).toBe("Not Found");
  });

  it("passes catalog failures to Express error handling", async () => {
    await writeFile(join(catalogRoot, "en.json"), "{ broken");
    const app = express5();
    app.use(
      localizedStatic({
        root: siteRoot,
        locales: ["en"],
        defaultLocale: "en",
        catalog: jsonDirectory({ root: catalogRoot })
      })
    );
    app.use(
      (
        error: unknown,
        _request: express5.Request,
        response: express5.Response,
        _next: express5.NextFunction
      ) => {
        response.status(503).json({
          error: error instanceof Error ? error.name : "UnknownError"
        });
      }
    );

    const response = await request(app).get("/").expect(503);
    expect(response.body.error).toBe("SyntaxError");
  });

  it("loads page-declared bundles and lets later bundles override", async () => {
    await writeFile(
      join(siteRoot, "bundled.html"),
      `<html><head>
        <meta name="i18n-bundles" content="common,home">
      </head><body><h1 data-i18n="title">Source</h1></body></html>`
    );
    await mkdir(join(catalogRoot, "en"));
    await writeFile(
      join(catalogRoot, "en", "common.json"),
      JSON.stringify({ title: "Common" })
    );
    await writeFile(
      join(catalogRoot, "en", "home.json"),
      JSON.stringify({ title: "Home" })
    );

    const response = await request(addLocalizedMiddleware(express5()))
      .get("/bundled.html")
      .expect(200);
    expect(response.text).toContain(">Home</h1>");
  });

  it("falls back per key to the configured fallback locale", async () => {
    await writeFile(
      join(catalogRoot, "en.json"),
      JSON.stringify({
        site: { title: "Example" },
        home: { title: "Welcome" },
        shared: "Translated fallback",
        search: { placeholder: "Search", label: "Search site" }
      })
    );

    const response = await request(addLocalizedMiddleware(express5()))
      .get("/?lang=ko")
      .expect(200);
    expect(response.text).toContain(">Translated fallback</p>");
  });

  it("rejects unsafe page-declared bundle identifiers", async () => {
    await writeFile(
      join(siteRoot, "unsafe.html"),
      `<html><head><meta name="i18n-bundles" content="../private"></head>
      <body>Source</body></html>`
    );
    const app = express5();
    app.use(
      localizedStatic({
        root: siteRoot,
        locales: ["en"],
        defaultLocale: "en",
        catalog: jsonDirectory({ root: catalogRoot })
      })
    );
    app.use(
      (
        error: unknown,
        _request: express5.Request,
        response: express5.Response,
        _next: express5.NextFunction
      ) => {
        response
          .status(400)
          .send(error instanceof Error ? error.message : "Unknown error");
      }
    );

    const response = await request(app).get("/unsafe.html").expect(400);
    expect(response.text).toContain("Page bundles");
  });

  it("appends Vary and Set-Cookie instead of overwriting headers", async () => {
    const app = express5();
    app.use((_request, response, next) => {
      response.vary("Origin");
      response.append("Set-Cookie", "session=kept; Path=/; HttpOnly");
      next();
    });
    const middleware = localizedStatic({
      root: siteRoot,
      locales: ["en", "ko"],
      defaultLocale: "en",
      catalog: jsonDirectory({ root: catalogRoot }),
      persistCookie: { name: "preferred-locale", maxAgeSeconds: 3600 }
    });
    app.use(middleware);

    const response = await request(app).get("/?lang=ko").expect(200);
    expect(response.headers.vary).toContain("Origin");
    expect(response.headers.vary).toContain("Cookie");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("session=kept"),
        expect.stringContaining("preferred-locale=ko")
      ])
    );
  });

  it("clears bounded response and catalog caches on demand", async () => {
    let greeting = "First";
    const catalog = {
      async load() {
        return { messages: { home: { title: greeting } }, version: "fixed" };
      },
      clearCache: vi.fn()
    };
    const middleware = localizedStatic({
      root: siteRoot,
      locales: ["en"],
      defaultLocale: "en",
      catalog,
      cache: { maxEntries: 2 }
    });
    const app = express5().use(middleware);

    expect((await request(app).get("/")).text).toContain(">First</h1>");
    greeting = "Second";
    expect((await request(app).get("/")).text).toContain(">First</h1>");
    middleware.clearCache();
    expect((await request(app).get("/")).text).toContain(">Second</h1>");
    expect(catalog.clearCache).toHaveBeenCalledOnce();
  });

  it("reloads unversioned catalogs when response caching is disabled", async () => {
    let greeting = "First";
    const catalog = {
      async load() {
        return { messages: { home: { title: greeting } } };
      }
    };
    const app = express5().use(
      localizedStatic({
        root: siteRoot,
        locales: ["en"],
        defaultLocale: "en",
        catalog,
        cache: false
      })
    );

    expect((await request(app).get("/")).text).toContain(">First</h1>");
    greeting = "Second";
    expect((await request(app).get("/")).text).toContain(">Second</h1>");
  });

  it("keeps concurrent locale responses isolated", async () => {
    const app = addLocalizedMiddleware(express5());
    const [english, korean] = await Promise.all([
      request(app).get("/?lang=en"),
      request(app).get("/?lang=ko")
    ]);

    expect(english.text).toContain(">Welcome</h1>");
    expect(korean.text).toContain(">환영합니다</h1>");
  });

  it("isolates cached output by real path, locale, and ordered bundles", async () => {
    await writeFile(
      join(siteRoot, "common.html"),
      `<html><head><meta name="i18n-bundles" content="common"></head>
      <body><h1 data-i18n="title">Source</h1></body></html>`
    );
    await writeFile(
      join(siteRoot, "home.html"),
      `<html><head><meta name="i18n-bundles" content="common,home"></head>
      <body><h1 data-i18n="title">Source</h1></body></html>`
    );
    const catalog = {
      async load(locale: string, bundles: readonly string[] = []) {
        return {
          messages: {
            title: `${locale}:${bundles.join(">")}`
          },
          version: "same-provider-version"
        };
      }
    };
    const app = express5().use(
      localizedStatic({
        root: siteRoot,
        locales: ["en", "ko"],
        defaultLocale: "en",
        catalog
      })
    );

    const common = await request(app).get("/common.html?lang=en");
    const home = await request(app).get("/home.html?lang=en");
    const korean = await request(app).get("/home.html?lang=ko");
    expect(common.text).toContain(">en:common</h1>");
    expect(home.text).toContain(">en:common&gt;home</h1>");
    expect(korean.text).toContain(">ko:common&gt;home</h1>");
  });
});
