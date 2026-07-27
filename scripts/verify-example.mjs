import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repository = dirname(scriptsDirectory);
const child = spawn(process.execPath, ["examples/basic-site/server.mjs"], {
  cwd: repository,
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

function waitForExampleUrl() {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Example server did not start within 10 seconds.${stderr}`)
      );
    }, 10_000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    function onData(chunk) {
      stdout += chunk;
      const match = stdout.match(
        /Example: (http:\/\/127\.0\.0\.1:\d+\/\?lang=ko)/
      );
      if (match) {
        cleanup();
        resolve(match[1]);
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(
        new Error(
          `Example server exited before startup (code ${code}, signal ${signal}).${stderr}`
        )
      );
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    child.stdout.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

try {
  const exampleUrl = await waitForExampleUrl();
  const response = await fetch(exampleUrl);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-language"), "ko");
  assert.match(html, /예시 카탈로그/);
  assert.match(html, /Alex님, 안녕하세요!/);
  assert.match(html, /placeholder="카탈로그 검색"/);
  assert.match(html, /aria-label="카탈로그 검색"/);

  process.stdout.write("Verified the basic-site example over HTTP.\n");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
