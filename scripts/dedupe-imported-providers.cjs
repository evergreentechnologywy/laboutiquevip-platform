#!/usr/bin/env node
/**
 * Deactivate duplicate imported Provider rows (Eros/Tryst), keeping best per dedupe key.
 * Entrypoint for run-us-verified-catalog-merge.sh — never deletes rows.
 */
const path = require("node:path");
const { pathToFileURL } = require("node:url");

import(pathToFileURL(path.join(__dirname, "dedupe-providers.mjs")).href).catch((err) => {
  console.error(err);
  process.exit(1);
});
