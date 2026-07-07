#!/usr/bin/env node
/**
 * Parse US verified catalog scan output, update state, notify Hermes on Telegram.
 */

import fs from "fs";
import path from "path";
import { hermesTelegramNotify } from "./lib/hermes-notify.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const logPath = args.get("log");
const status = args.get("status") ?? "unknown";
const exitCode = Number(args.get("exit") ?? "0");
const statePath =
  process.env.CATALOG_SCAN_STATE_FILE ?? "/var/run/lboutiquevip/catalog-scan-state.json";

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {
      firstFullScanNotified: false,
      runCount: 0,
      lastRunAt: null,
      lastStats: null,
    };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function parseImportBlock(text, marker) {
  const idx = text.lastIndexOf(marker);
  if (idx < 0) return null;
  const slice = text.slice(idx);
  const match = slice.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseReviewMatch(text) {
  const m = text.match(/Review match complete scanned=(\d+) matched=(\d+)/);
  if (!m) return null;
  return { scanned: Number(m[1]), matched: Number(m[2]) };
}

function summarizeLog(text) {
  const eros = parseImportBlock(text, "[import-eros] complete");
  const trystLine = text.split("\n").reverse().find((l) => l.includes("skippedNoVerification"));
  let tryst = null;
  if (trystLine) {
    const created = trystLine.match(/created:\s*(\d+)/)?.[1];
    const updated = trystLine.match(/updated:\s*(\d+)/)?.[1];
    const skipped = trystLine.match(/skippedNoVerification:\s*(\d+)/)?.[1];
    tryst = {
      created: created != null ? Number(created) : null,
      updated: updated != null ? Number(updated) : null,
      skippedNoVerification: skipped != null ? Number(skipped) : null,
    };
  }
  return {
    eros,
    tryst,
    review: parseReviewMatch(text),
  };
}

function formatStats(stats) {
  const lines = [];
  if (stats.eros) {
    lines.push(
      `Eros: +${stats.eros.created ?? 0} new, ${stats.eros.updated ?? 0} updated, ${stats.eros.skippedNoVerification ?? 0} gate-skip`,
    );
  }
  if (stats.tryst) {
    lines.push(
      `Tryst: +${stats.tryst.created ?? 0} new, ${stats.tryst.updated ?? 0} updated, ${stats.tryst.skippedNoVerification ?? 0} gate-skip`,
    );
  }
  if (stats.review) {
    lines.push(`Review match: ${stats.review.matched}/${stats.review.scanned} matched`);
  }
  return lines.length ? lines.join("\n") : "Stats unavailable (see VPS log).";
}

async function main() {
  const prior = readState();
  const logText = logPath && fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  const stats = summarizeLog(logText);
  const now = new Date().toISOString();
  const ok = status === "ok" && exitCode === 0;

  const next = {
    ...prior,
    runCount: (prior.runCount ?? 0) + 1,
    lastRunAt: now,
    lastStatus: ok ? "ok" : "failed",
    lastExitCode: exitCode,
    lastStats: stats,
  };

  let headline;
  if (ok && !prior.firstFullScanNotified) {
    headline = "✅ <b>LBV first full US verified catalog scan complete</b>";
    next.firstFullScanNotified = true;
    next.firstFullScanCompletedAt = now;
  } else if (ok) {
    headline = "🔄 <b>LBV catalog scan cycle complete</b>";
  } else {
    headline = "⚠️ <b>LBV catalog scan failed</b>";
  }

  const intervalH = Number(process.env.CATALOG_SCAN_INTERVAL_SEC ?? "14400") / 3600;
  const msg =
    `${headline}\n` +
    `⏱️ ${now.replace("T", " ").slice(0, 19)} UTC\n` +
    `Run #${next.runCount} · exit ${exitCode}\n\n` +
    `${formatStats(stats)}\n\n` +
    (ok ? `Next scan in ~${intervalH}h (incremental verification cache).` : "Check /var/log/laboutiquevip/us-verified-catalog-scan.log");

  writeState(next);
  const sent = await hermesTelegramNotify(msg);
  console.log(`[lbv-catalog-scan-notify] sent=${sent} first=${Boolean(next.firstFullScanNotified)}`);
  if (!sent) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
