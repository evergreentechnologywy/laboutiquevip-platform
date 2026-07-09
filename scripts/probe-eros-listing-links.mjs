#!/usr/bin/env node
/** Quick probe: profile link counts on hub listing via jina vs direct. */
const JINA = "https://r.jina.ai/http://";

async function fetchText(url, mirror) {
  const target = mirror ? `${JINA}${url.replace(/^https?:\/\//i, "")}` : url;
  const res = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-probe/1.0)" },
  });
  if (!res.ok) return { ok: false, status: res.status, text: "" };
  const text = await res.text();
  return { ok: true, status: res.status, text };
}

function countProfileLinks(text) {
  const re = /https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s)]+\/files\/\d+\.htm/gi;
  return new Set((text.match(re) ?? []).map((u) => u.toLowerCase())).size;
}

const hubs = [
  "https://www.eros.com/florida/miami/miami_escorts.htm",
  "https://www.eros.com/north_carolina/charlotte/charlotte_escorts.htm",
];

for (const hub of hubs) {
  console.log(`\n=== ${hub} ===`);
  for (const mode of ["jina", "direct"]) {
    const { ok, status, text } = await fetchText(hub, mode === "jina");
    const count = countProfileLinks(text);
    console.log(`${mode}: status=${status} ok=${ok} profiles=${count} bytes=${text.length}`);
  }
}
