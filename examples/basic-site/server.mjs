import { fileURLToPath } from "node:url";

import express from "express";
import { jsonDirectory, localizedStatic } from "express-static-l10n";

const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
const localeRoot = fileURLToPath(new URL("./locales", import.meta.url));
const port = Number(process.env.PORT ?? "3000");
const app = express();

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new RangeError("PORT must be an integer between 0 and 65535.");
}

app.use(
  localizedStatic({
    root: publicRoot,
    locales: ["en", "ko"],
    defaultLocale: "en",
    catalog: jsonDirectory({ root: localeRoot })
  })
);
app.use(express.static(publicRoot));

const server = app.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The example server did not bind to a TCP port.");
  }
  process.stdout.write(`Example: http://127.0.0.1:${address.port}/?lang=ko\n`);
});
