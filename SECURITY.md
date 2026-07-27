# Security policy

Security fixes are made against the latest published release.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature. If it is not
available, open a public issue without exploit details and ask for a private
contact channel.

Include the affected version, impact, request or fixture needed to reproduce
the issue, and any known mitigation. Do not place credentials, private
catalogs, or vulnerable deployment URLs in a public issue.

## Security model

Path traversal, symbolic-link escape, HTML or attribute injection, prototype
pollution through catalogs, locale spoofing, and unintended file disclosure
are in scope. The package treats translation values as text, rejects text
bindings on raw-text elements, restricts translatable attributes, rejects
executable and URL-bearing attributes, blocks HTTP-equivalent meta content,
and serves only HTML. HTML and catalog symlinks must remain within their
configured roots.

Catalog authors and middleware configuration are trusted inputs. The package
does not authenticate requests, authorize locales, set a complete HTTP
security-header policy, or protect credentials used elsewhere in an
application. Deployments remain responsible for those controls.
