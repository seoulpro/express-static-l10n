# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/seoulpro/express-static-l10n/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/seoulpro/express-static-l10n/releases/tag/v0.1.0
