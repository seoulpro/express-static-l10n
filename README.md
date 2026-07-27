# express-static-l10n

[![npm version](https://img.shields.io/npm/v/express-static-l10n.svg)](https://www.npmjs.com/package/express-static-l10n)

Localize existing static HTML at request time with Express—without moving the
site into a template engine or shipping a browser translation runtime.

```html
<h1 data-i18n="home.title">Welcome</h1>
```

The middleware negotiates a locale, loads JSON catalogs, safely replaces text
and explicitly selected attributes, sets the HTTP language metadata, and then
sends the HTML. Other files continue to be served by `express.static()`.

## Install

```sh
npm install express-static-l10n express
```

Node.js 22 or newer, Express 4.22.2+, and Express 5.2.1+ are supported. The
package is ESM-only.

## Quick start

```js
import { fileURLToPath } from "node:url";

import express from "express";
import {
  jsonDirectory,
  localizedStatic
} from "express-static-l10n";

const app = express();
const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
const localeRoot = fileURLToPath(new URL("./locales", import.meta.url));

app.use(localizedStatic({
  root: publicRoot,
  locales: ["en", "ko"],
  defaultLocale: "en",
  catalog: jsonDirectory({
    root: localeRoot
  })
}));

// The localization middleware deliberately ignores non-HTML assets.
app.use(express.static(publicRoot));

app.listen(3000);
```

With no bundles, catalogs are stored as one file per locale:

```text
locales/
  en.json
  ko.json
```

```json
{
  "home": {
    "title": "Welcome"
  }
}
```

Locale detection is `?lang=` / `?locale=`, then the `locale` cookie, then
`Accept-Language`, then `defaultLocale`. The order and names are configurable.

A runnable version of this setup, with English and Korean catalogs, lives in
[`examples/basic-site`](./examples/basic-site/README.md).

## HTML contract

Text is replaced by `data-i18n`:

```html
<h1 data-i18n="home.title">Source-language fallback</h1>
```

Attributes are opt-in. A bare attribute name uses the element's `data-i18n`
key; `attribute:key` selects a different key.

```html
<input
  data-i18n="search.placeholder"
  data-i18n-attr="placeholder aria-label"
  placeholder="Search"
  aria-label="Search"
>

<img
  data-i18n-attr="alt:hero.description title:hero.tooltip"
  alt="Source description"
>
```

Only `alt`, `aria-label`, `content`, `placeholder`, `title`, and `value` are
translatable by default. Translation values are always serialized as text or
attribute values; HTML injection is not supported. Text bindings are rejected
on raw-text elements such as `script`, `style`, and `iframe`, and `content`
cannot be translated on a `meta` element with `http-equiv`.

Small, explicit interpolation uses JSON parameters:

```html
<p
  data-i18n="hello"
  data-i18n-params='{"name":"Kim"}'
>Hello</p>
```

```json
{ "hello": "Hello, {{name}}!" }
```

Malformed parameter JSON is an error. ICU messages, plural rules, and HTML
translations are intentionally outside v0.1.

## Bundles

A page can declare ordered bundles:

```html
<meta name="i18n-bundles" content="common,home">
```

The default directory layout becomes:

```text
locales/
  en/
    common.json
    home.json
  ko/
    common.json
    home.json
```

Objects are merged deeply in declaration order; a later bundle replaces an
earlier string or subtree. Programmatic `bundles` are loaded before page
bundles. Missing locale bundles fall back per key to `fallbackLocale` (or
`defaultLocale`).

## Options

```ts
localizedStatic({
  root: "./public",
  locales: ["en", "ko", "fr"],
  defaultLocale: "en",
  fallbackLocale: "en",
  catalog: jsonDirectory({ root: "./locales", onError: "throw" }),
  bundles: ["common"],
  detect: {
    order: ["query", "cookie", "header"],
    query: ["lang"],
    cookie: ["locale"]
  },
  persistCookie: { name: "locale", maxAgeSeconds: 2_592_000 },
  missingKey: "source",
  cache: { maxEntries: 100, ttlMs: 60_000 },
  fallthrough: true
});
```

- `missingKey: "source"` keeps the original HTML; `"key"` displays the key;
  `"error"` fails the request.
- `locales` must contain unique, valid BCP 47 language tags.
- `jsonDirectory({ onError: "throw" })` surfaces invalid JSON and permission
  errors. `"stale"` keeps the last successfully parsed snapshot after a later
  failure. A first failure still throws.
- `cache: false` disables HTML/response caching. Otherwise both caches are
  bounded LRUs. Catalog versions and HTML mtimes invalidate transformed output.
- The returned middleware has `clearCache()`, which also clears a catalog
  provider that exposes the same method.
- `persistCookie` appends a `Path=/; SameSite=Lax` cookie. Existing `Set-Cookie`
  and `Vary` headers are preserved. `maxAgeSeconds` must be a non-negative safe
  integer.
- `fallthrough: false` returns a neutral 404 for missing HTML. The default calls
  the next middleware.
- `translatableAttributes` replaces the default attribute allowlist; unsafe and
  URL-bearing attributes are still rejected.
- `index` sets the directory index file name (default `index.html`) or `false`
  to disable index resolution. `dotfiles: true` serves paths whose segments
  begin with a dot, which are hidden by default.

## HTTP and filesystem behavior

Only `GET` and `HEAD` requests resolving to `.html` files are handled.
Directory requests may resolve to `index.html`. Dotfiles are hidden by default,
decoded traversal is rejected, and HTML or catalog symlinks cannot escape their
configured roots.

Responses include `Content-Language`. `Vary: Cookie, Accept-Language` is
appended when those detectors are enabled.

## Non-goals

v0.1 does not provide a client runtime, template engine, remote translation
API, build-time generator, authentication integration, automatic translation,
SEO URL generation, canonical/hreflang rewriting, ICU/plural rules, or
`data-i18n-html`.

## Development

```sh
npm install
npm run verify
```

The integration suite runs the same middleware against Express 4 and 5.

Implementation rationale and the full behavior matrix are recorded in the
[design notes](./docs/design-notes.md).

See [CONTRIBUTING.md](./CONTRIBUTING.md) before changing the HTML or middleware
contract. Report vulnerabilities privately as described in
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
