# basic-site example

A minimal Express app that localizes a single static HTML page with
`express-static-l10n`. It shows locale negotiation from `?lang=`, ordered
`common,home` bundles, text interpolation, and translated `placeholder` and
`aria-label` attributes.

The example imports the package by its published name, exactly as an
application would:

```js
import { jsonDirectory, localizedStatic } from "express-static-l10n";
```

## Run it

From a clone of this repository:

```sh
npm install
npm run example
```

`npm run example` builds the package (so the `express-static-l10n` import
resolves to the freshly built `dist/`) and starts the server on
`http://127.0.0.1:3000`.

Then open:

- English (default locale): <http://127.0.0.1:3000/>
- Korean: <http://127.0.0.1:3000/?lang=ko>

The Korean page returns `Content-Language: ko` and renders:

| Element        | English            | Korean (`?lang=ko`)   |
| -------------- | ------------------ | --------------------- |
| Title          | Example catalog    | 예시 카탈로그         |
| Heading        | Hello, Alex!       | Alex님, 안녕하세요!   |
| Search field   | Search the catalog | 카탈로그 검색         |

The heading interpolates the name `Alex`, and the search field's
`placeholder` and `aria-label` are translated from the same key.

## Files

- `server.mjs` — wires `localizedStatic()` ahead of `express.static()`.
- `public/index.html` — the source HTML. It carries `data-i18n` bindings and
  declares its bundles with `<meta name="i18n-bundles" content="common,home">`.
- `locales/en/` and `locales/ko/` — JSON catalogs, one file per bundle
  (`common.json`, `home.json`).

`localizedStatic()` runs first and only handles `GET`/`HEAD` requests that
resolve to `.html` files, localizing them before they are sent.
`express.static(publicRoot)` runs second and serves every other asset
unchanged.

## Port

The server binds to `127.0.0.1` and reads `PORT` (default `3000`). Set `PORT`
to use another port, or `PORT=0` to bind an ephemeral one:

```sh
PORT=8080 npm run example
```

## Automated check

```sh
npm run test:example
```

This builds the package, starts the server on an ephemeral port, requests the
Korean page over HTTP, and asserts the status, `Content-Language`, translated
title and heading, placeholder, and ARIA label. It runs as part of
`npm run verify`.

## Using the package in your own app

This example directory is part of the repository and is not included in the
npm package. In an application, install the package alongside Express:

```sh
npm install express-static-l10n express
```

and use the same package-name import shown in `server.mjs`.
