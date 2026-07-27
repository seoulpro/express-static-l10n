import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repository = dirname(scriptsDirectory);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = { ...process.env };
delete environment.npm_config_dry_run;
delete environment.NPM_CONFIG_DRY_RUN;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "express-static-l10n-package-")
);

function run(command, arguments_, cwd) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "inherit"]
  });
}

async function packageVersion(path) {
  return JSON.parse(await readFile(path, "utf8")).version;
}

function parsePackResult(output) {
  const result = /(\[\s*\{[\s\S]*\}\s*\])\s*$/u.exec(output);
  assert(result?.[1], "npm pack did not return JSON metadata");
  return JSON.parse(result[1]);
}

try {
  const packed = parsePackResult(
    run(
      npmCommand,
      ["pack", "--silent", "--json", "--pack-destination", temporaryDirectory],
      repository
    )
  )[0];
  assert(packed, "npm pack did not describe an artifact");

  const expectedFiles = new Set([
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs/design-notes.md",
    "package.json"
  ]);
  for (const file of packed.files) {
    const allowed =
      expectedFiles.has(file.path) || file.path.startsWith("dist/");
    assert(allowed, `unexpected package file: ${file.path}`);
  }
  for (const expected of expectedFiles) {
    assert(
      packed.files.some((file) => file.path === expected),
      `missing package file: ${expected}`
    );
  }

  const archive = join(temporaryDirectory, packed.filename);
  const consumer = join(temporaryDirectory, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`
  );

  const expressVersion = await packageVersion(
    join(repository, "node_modules", "express", "package.json")
  );
  const expressTypesVersion = await packageVersion(
    join(repository, "node_modules", "@types", "express", "package.json")
  );
  const nodeTypesVersion = await packageVersion(
    join(repository, "node_modules", "@types", "node", "package.json")
  );
  const typescriptVersion = await packageVersion(
    join(repository, "node_modules", "typescript", "package.json")
  );

  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      archive,
      `express@${expressVersion}`,
      `@types/express@${expressTypesVersion}`,
      `@types/node@${nodeTypesVersion}`,
      `typescript@${typescriptVersion}`
    ],
    consumer
  );

  await writeFile(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          noUncheckedIndexedAccess: true,
          strict: true,
          target: "ES2022",
          types: ["node"]
        },
        include: ["*.ts"]
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(consumer, "smoke.ts"),
    `import express from "express";
import {
  extractI18nBundles,
  jsonDirectory,
  localizedStatic,
  lookupMessage,
  parseAcceptLanguage,
  parseCookieHeader,
  resolveLocale,
  resolveMessage,
  transformHtml,
  varyHeadersForDetection,
  type CatalogMessages,
  type CatalogProvider,
  type LocalizedStaticMiddleware,
  type TransformHtmlResult
} from "express-static-l10n";

const messages: CatalogMessages = { greeting: "Hello" };
const provider: CatalogProvider = jsonDirectory({ root: "./locales" });
const middleware: LocalizedStaticMiddleware = localizedStatic({
  root: "./public",
  locales: ["en"],
  defaultLocale: "en",
  catalog: provider
});
const result: TransformHtmlResult = transformHtml(
  '<p data-i18n="greeting">Source</p>',
  { locale: "en", messages }
);

express().use(middleware);
extractI18nBundles("<html></html>");
lookupMessage(messages, "greeting");
parseAcceptLanguage("en");
parseCookieHeader("locale=en");
resolveLocale({ headers: {} }, ["en"], "en");
resolveMessage("greeting", messages);
varyHeadersForDetection();
void result;
`
  );
  await writeFile(
    join(consumer, "runtime-smoke.mjs"),
    `import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import {
  InvalidAttributeBindingError,
  InvalidTextBindingError,
  MissingTranslationError,
  jsonDirectory,
  localizedStatic,
  transformHtml
} from "express-static-l10n";

assert.equal(typeof InvalidAttributeBindingError, "function");
assert.equal(typeof InvalidTextBindingError, "function");
assert.equal(typeof MissingTranslationError, "function");

const root = await mkdtemp(join(tmpdir(), "express-static-l10n-consumer-"));
const publicRoot = join(root, "public");
const catalogRoot = join(root, "locales");
await mkdir(publicRoot);
await mkdir(catalogRoot);
await writeFile(
  join(publicRoot, "index.html"),
  '<!doctype html><html lang="en"><body><h1 data-i18n="greeting">Source</h1></body></html>'
);
await writeFile(
  join(catalogRoot, "ko.json"),
  JSON.stringify({ greeting: "안녕하세요" })
);

const transformed = transformHtml(
  '<p data-i18n="greeting">Source</p>',
  { locale: "ko", messages: { greeting: "안녕하세요" } }
);
assert.match(transformed.html, /안녕하세요/u);

const app = express();
app.use(
  localizedStatic({
    root: publicRoot,
    locales: ["en", "ko"],
    defaultLocale: "en",
    catalog: jsonDirectory({ root: catalogRoot })
  })
);
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const response = await fetch(
    \`http://127.0.0.1:\${address.port}/?lang=ko\`
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-language"), "ko");
  assert.match(await response.text(), /안녕하세요/u);
} finally {
  server.close();
  await once(server, "close");
  await rm(root, { recursive: true, force: true });
}
`
  );

  run(npmCommand, ["exec", "--", "tsc", "--noEmit"], consumer);
  run(process.execPath, ["runtime-smoke.mjs"], consumer);

  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "express@4.22.2",
      "@types/express@4.17.25"
    ],
    consumer
  );
  run(npmCommand, ["exec", "--", "tsc", "--noEmit"], consumer);
  run(process.execPath, ["runtime-smoke.mjs"], consumer);

  console.log(
    `Verified ${packed.id}: ${packed.entryCount} files, ${packed.size} bytes, both supported Express majors`
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
