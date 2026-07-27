import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repository = dirname(scriptsDirectory);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = { ...process.env };
delete environment.npm_config_dry_run;
delete environment.NPM_CONFIG_DRY_RUN;

function run(arguments_) {
  const result = spawnSync(npmCommand, arguments_, {
    cwd: repository,
    env: environment,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["exec", "--", "publint"]);
run(["exec", "--", "attw", "--pack", "--profile", "esm-only", "."]);
