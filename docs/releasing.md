# Release process

Releases target the public GitHub repository
`seoulpro/express-static-l10n` and the unscoped npm package
`express-static-l10n`.

## Release candidate

1. Confirm that the Git author and committer identity are intentional.
2. Start from a clean checkout and run:

   ```sh
   npm ci
   npm run verify
   npm audit --audit-level=high
   npm publish --dry-run
   ```

3. Inspect the complete Git diff and the file list reported by the package
   smoke test.
4. Confirm that the version and changelog agree and that the npm package name
   is still available.

## Initial publication

1. Create an empty public GitHub repository without generated files, connect
   it as `origin`, and push `main`.
2. Wait for the Node.js and minimum-Express CI jobs to pass.
3. Enable private vulnerability reporting, Dependabot alerts, and branch
   protection for `main`.
4. Publish `0.1.0` from a trusted maintainer session with npm two-factor
   authentication:

   ```sh
   npm publish --access public
   ```

5. Read the package back from npm, install it in a clean project, and verify
   its repository metadata before creating the `v0.1.0` GitHub release.

## Later releases

After the initial npm package exists, configure npm trusted publishing for a
dedicated GitHub Actions workflow. Use a protected GitHub environment and
OIDC instead of a long-lived npm write token. Trusted publishing requires the
workflow filename and repository metadata to match the npm configuration.

For each release, move the relevant changelog entries from `Unreleased` to a
dated version, update `package.json`, rerun every release-candidate command,
and publish only from the reviewed version tag.
