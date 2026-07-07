/**
 * Eros source adapter — delegates to canonical import/reconcile scripts.
 * Register in import-orchestrator.config.json; enable only for full refresh windows.
 */
export const SOURCE_ID = "eros";
export const VERIFICATION_PROVIDER = "eros";

export async function run() {
  const { spawnSync } = await import("node:child_process");
  const repo = process.env.REPO_DIR || process.cwd();
  const result = spawnSync("bash", [`${repo}/scripts/run-eros-import.sh`], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export async function reconcile() {
  const { spawnSync } = await import("node:child_process");
  const repo = process.env.REPO_DIR || process.cwd();
  const result = spawnSync("bash", [`${repo}/scripts/run-eros-reconcile.sh`], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
