# Contributing to express-static-l10n

Bug reports and focused pull requests are welcome. Open an issue before
changing the HTML attributes, locale negotiation order, catalog-provider
contract, or middleware defaults so compatibility can be discussed first.

## Development

Use Node.js 22 or newer:

```sh
npm install
npm run verify
```

`verify` checks formatting and lint, type-checks, runs the Vitest suite with
coverage, builds the package, and runs the packaging checks.

## Tests

Add a regression test for every behavior change. Use the smallest relevant
layer:

- core tests for locale parsing, message lookup, and HTML transformation;
- catalog tests for filesystem loading, invalidation, and stale snapshots;
- integration tests for request handling, headers, caching, and Express 4/5
  compatibility.

Fixtures must not contain credentials, private URLs, or application data.
Changes affecting path resolution or translated attributes should include a
negative security case.

## Project boundaries

Keep the package focused on server-side localization of existing static HTML.
Browser runtimes, remote translation services, authentication, SEO routing,
and product-specific catalog policy belong in adapters or applications.
New runtime dependencies need a clear correctness or security justification.

Report vulnerabilities using [SECURITY.md](./SECURITY.md). Contributions are
licensed under the repository's [MIT license](./LICENSE).
