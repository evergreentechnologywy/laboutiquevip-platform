#!/usr/bin/env node
/**
 * Send HTML messages to the operator Telegram chat (Hermes / Aura fleet pattern).
 * Loads /root/.hermes/.env and calendar-coordinator .env on VPS.
 */

import fs from "fs";

const ENV_FILES = [
  "/root/calendar-coordinator/.env",
  "/root/.hermes/.env",
  process.env.HERMES_ENV,
].filter(Boolean);

function loadEnv() {
  for (const file of ENV_FILES) {
    if (!file || !fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i);
      if (process.env[k] === undefined) process.env[k] = t.slice(i + 1);
    }
  }
}

export async function hermesTelegramNotify(text) {
  loadEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.JARVIS_TELEGRAM_BOT_TOKEN;
  const chatId =
    process.env.TELEGRAM_HOME_CHAT_ID ||
    process.env.TELEGRAM_OPERATOR_CHAT_ID ||
    process.env.TELEGRAM_HOME_CHANNEL;
  if (!token || !chatId) {
    console.error("[hermes-notify] missing TELEGRAM_BOT_TOKEN or TELEGRAM_HOME_CHAT_ID");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) console.error("[hermes-notify] send failed:", body);
  return Boolean(body.ok);
}

if (process.argv[1]?.endsWith("hermes-notify.mjs")) {
  const msg = process.argv.slice(2).join(" ") || "✅ Hermes notify test OK";
  hermesTelegramNotify(msg).then((ok) => process.exit(ok ? 0 : 1));
}
