import fs from "fs";
import { r2PhotoProxyHandler } from "./backend/dist/routes/r2-photo-proxy.js";

if (fs.existsSync(".env")) {
  const content = fs.readFileSync(".env", "utf8");
  content.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
}

async function test() {
  const req = {
    pathname: "/api/r2-photo/82b03dff-2999-4662-acdb-179a16c72170/00-4a4cffce.jpeg",
    method: "GET",
  };
  console.log("Starting test-proxy...");
  try {
    const res = await r2PhotoProxyHandler(req);
    console.log("Result:", {
      statusCode: res.statusCode,
      headers: res.headers,
      bodyLength: res.body ? res.body.length : 0,
      isBase64Encoded: res.isBase64Encoded,
    });
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

test();
