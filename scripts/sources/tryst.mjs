/**
 * Tryst source adapter — delegates to run-tryst-import.sh (import + reconcile).
 */
export const SOURCE_ID = "tryst";
export const VERIFICATION_PROVIDER = "tryst";

export async function run() {
  const { spawnSync } = await import("node:child_process");
  const repo = process.env.REPO_DIR || process.cwd();
  const result = spawnSync("bash", [`${repo}/scripts/run-tryst-import.sh`], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
