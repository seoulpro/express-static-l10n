# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-10-06

### Fixed

- Redirect existing HTML directory indexes to trailing-slash URLs before
  localization, preserving mount prefixes, encoded paths, and query strings
  so relative assets resolve correctly.
- Refresh HTML and catalog caches after equal-size file replacements or
  in-place edits that preserve modification time, and reject metadata changes
  during bounded reads.
- Prefer progressively shortened locale tags before base-language fallback,
  preserving script matches such as `zh-Hant-TW` to `zh-Hant`.
- Update locked development dependencies to `proxy-addr` 2.0.8 and
  `source-map-js` 1.2.2 to address their published security advisories.

## [0.2.0] - 2026-09-06

### Added

- Bounded request inputs: HTML defaults to 2 MiB per file, JSON catalogs to
  1 MiB per file, and bundle fan-out to 32. All limits are configurable.
- `FileSizeLimitError` with stable code `ERR_FILE_SIZE_LIMIT`, byte count, and
  configured limit so applications can map oversized input to HTTP 413.
- A reproducible transform benchmark covering 100, 1,000, and 10,000 bound
  elements with fixed synthetic input.

### Changed

- `jsonDirectory({ onError: "stale" })` now serves its last good snapshot when
  a later catalog exceeds the configured byte limit.

## [0.1.0] - 2026-07-28

### Added

- Initial release of request-time localization of existing static HTML for
  Express.
- Locale negotiation through query parameters, cookies, and
  `Accept-Language`.
- JSON catalog loading, ordered bundles, per-key fallback, and bounded caches.
- Express 4.22.2+ and 5.2.1+ middleware support with GET, HEAD, index, and
  fallthrough behavior.
- Text-only HTML transformation with explicit attribute bindings,
  interpolation, and missing-key policies.
- Path, symbolic-link, raw-text, URL-attribute, document-directive, and
  prototype-key safety checks.

[Unreleased]: https://github.com/seoulpro/express-static-l10n/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/seoulpro/express-static-l10n/compare/062578b2f176713b73b9aff68cba93d44258ae7b...v0.2.1
[0.2.0]: https://github.com/seoulpro/express-static-l10n/compare/v0.1.0...062578b2f176713b73b9aff68cba93d44258ae7b
[0.1.0]: https://github.com/seoulpro/express-static-l10n/releases/tag/v0.1.0
