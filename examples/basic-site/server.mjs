import { fileURLToPath } from "node:url";

import express from "express";
import { jsonDirectory, localizedStatic } from "../../dist/index.js";

const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
const localeRoot = fileURLToPath(new URL("./locales", import.meta.url));
const app = express();

app.use(
  localizedStatic({
    root: publicRoot,
    locales: ["en", "ko"],
    defaultLocale: "en",
    catalog: jsonDirectory({ root: localeRoot })
  })
);
app.use(express.static(publicRoot));

app.listen(3000, () => {
  process.stdout.write("Example: http://localhost:3000/?lang=ko\n");
});
