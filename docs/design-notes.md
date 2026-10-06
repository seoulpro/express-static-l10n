# Design notes

The API favors predictable request behavior and explicit failure policy.
These choices define the contract:

- query, cookie, header, and default locale resolution are ordered;
- exact and progressively shortened locale tags precede base-language fallback;
- malformed percent-encoded cookies do not fail an entire request;
- an empty string is a valid translation;
- source HTML is retained for missing keys unless another policy is selected;
- missing locale files can fall back, while malformed JSON is an error;
- last-known-good catalog reuse is opt-in with `onError: "stale"`;
- attributes must be declared, and translated markup is never interpreted;
- prototype-related catalog keys, raw-text element contents,
  executable/URL-bearing attributes, and HTTP-equivalent meta content are
  rejected;
- HTML and catalog symlinks cannot escape their configured roots;
- contained HTML directory indexes redirect to a trailing-slash URL;
- locale and bundle versions participate in cache keys;
- file revisions include identity and change time as well as mtime and size;
- HTML and response caches are bounded and can be cleared;
- HTML and catalog reads have configurable per-file byte ceilings, and bundle
  fan-out is bounded independently;
- language and cookie response headers are appended, not replaced;
- product-specific domains, headers, authentication, data, and SEO policy do
  not belong in the package.

The test matrix covers locale negotiation, bundle precedence, interpolation,
escaping, fallback, catalog corruption, metadata-preserving file replacement,
in-place cache refresh, script variants, Express 4 and 5,
header preservation, concurrent locales, path traversal, symlink containment,
cache clearing, byte and bundle-count boundaries, stale reuse after an
oversized catalog, GET, HEAD, mounted directory redirects, relative assets,
fallthrough, and explicit 404 behavior.
