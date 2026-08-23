import { performance } from "node:perf_hooks";

import { transformHtml } from "../dist/index.js";

const quick = process.argv.includes("--quick");
const json = process.argv.includes("--json");
const elementCounts = quick ? [100, 1_000] : [100, 1_000, 10_000];
const runs = quick ? 3 : 7;

const percentile = (values, ratio) => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[
    Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))
  ];
};

const fixture = (elementCount) => {
  const messages = {};
  const elements = [];
  for (let index = 0; index < elementCount; index += 1) {
    const key = `message_${index}`;
    messages[key] = `Translated value ${index}`;
    elements.push(`<p data-i18n="${key}">Source value ${index}</p>`);
  }
  return {
    html: `<!doctype html><html><body>${elements.join("")}</body></html>`,
    messages
  };
};

const measure = (elementCount) => {
  const input = fixture(elementCount);
  const operation = () =>
    transformHtml(input.html, {
      locale: "en",
      messages: input.messages
    });
  operation();
  const samplesMs = [];
  let checksum = 0;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    const result = operation();
    samplesMs.push(performance.now() - startedAt);
    checksum += result.html.length + result.translatedKeys.length;
  }
  const medianMs = percentile(samplesMs, 0.5);
  return {
    elements: elementCount,
    inputBytes: Buffer.byteLength(input.html),
    medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(percentile(samplesMs, 0.95).toFixed(3)),
    elementsPerSecond: Math.round((elementCount / medianMs) * 1_000),
    checksum
  };
};

const report = {
  schemaVersion: 1,
  suite: "express-static-l10n-transform",
  mode: quick ? "quick" : "full",
  runs,
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch
  },
  results: elementCounts.map(measure)
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.table(report.results);
  console.log(
    "Transform-only local observations; file and catalog I/O are excluded."
  );
}
