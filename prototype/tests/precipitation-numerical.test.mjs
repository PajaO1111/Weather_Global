import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("Python precipitation numerical safeguards remain in the canonical test command", () => {
  const command = process.env.WEATHER_GLOBAL_PYTHON || (process.platform === "win32" ? "py" : "python3");
  const launcher = !process.env.WEATHER_GLOBAL_PYTHON && process.platform === "win32" ? ["-3.10"] : [];
  const run = spawnSync(command, [...launcher, "-B", "-m", "unittest", "discover",
    "-s", join("prototype", "scripts"),
    "-p", "test_precipitation.py"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 60000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stderr, /Ran 4 tests/);
});
