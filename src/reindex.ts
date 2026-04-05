import { execFile } from "child_process";
import { showHUD, environment } from "@raycast/api";

const QMD_SCRIPT = "/Users/francis/.local/share/mise/installs/node/24.13.1/lib/node_modules/@tobilu/qmd/dist/cli/qmd.js";
const NODE_PATH = "/Users/francis/.local/share/mise/installs/node/24.13.1/bin/node";

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(NODE_PATH, [QMD_SCRIPT, ...args], { timeout: 120000, env: { ...process.env, BUN_INSTALL: "" } }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export default async function Command() {
  const manual = environment.launchType === "userInitiated";

  try {
    await run(["update"]);
    await run(["embed"]);
    if (manual) await showHUD("Knowledge base reindexed");
  } catch (e) {
    if (manual) await showHUD(`Reindex failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}
