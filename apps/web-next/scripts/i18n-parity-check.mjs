/**
 * AFG AI i18n parity check.
 * Recursively compares the key sets of fa / ps / ar against en (source of truth)
 * and verifies that interpolation placeholders ({tool}, {count}, …) are preserved.
 *
 * Run: bun scripts/i18n-parity-check.mjs
 */
import { en } from "../src/lib/afg/i18n/en.ts";
import { fa } from "../src/lib/afg/i18n/fa.ts";
import { ps } from "../src/lib/afg/i18n/ps.ts";
import { ar } from "../src/lib/afg/i18n/ar.ts";

/** Flatten a nested dictionary into "section.key" → string leaf map. */
const flatten = (obj, prefix = "") => {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
};

/** Extract interpolation placeholders like {tool} / {count}, sorted. */
const placeholders = (s) => (String(s).match(/\{[A-Za-z_]\w*\}/g) ?? []).sort();

const base = flatten(en);
const dicts = [
  ["fa", flatten(fa)],
  ["ps", flatten(ps)],
  ["ar", flatten(ar)],
];

let totalIssues = 0;

for (const [name, flat] of dicts) {
  const missing = Object.keys(base).filter((k) => !(k in flat));
  const extra = Object.keys(flat).filter((k) => !(k in base));
  const nonString = Object.keys(flat).filter((k) => typeof flat[k] !== "string");
  const interp = Object.keys(base)
    .filter((k) => k in flat)
    .filter(
      (k) => JSON.stringify(placeholders(base[k])) !== JSON.stringify(placeholders(flat[k])),
    );

  if (missing.length || extra.length || nonString.length || interp.length) {
    totalIssues += missing.length + extra.length + nonString.length + interp.length;
    console.log(`\n✗ ${name}:`);
    if (missing.length) console.log(`  missing keys (${missing.length}):`, missing);
    if (extra.length) console.log(`  extra keys (${extra.length}):`, extra);
    if (nonString.length) console.log(`  non-string values (${nonString.length}):`, nonString);
    if (interp.length) console.log(`  placeholder mismatches (${interp.length}):`);
    for (const k of interp) {
      console.log(
        `    - ${k}: en=[${placeholders(base[k]).join(", ") || "—"}] ${name}=[${placeholders(flat[k]).join(", ") || "—"}]`,
      );
    }
  } else {
    console.log(
      `✓ ${name}: ${Object.keys(flat).length}/${Object.keys(base).length} keys — key parity OK, placeholders OK`,
    );
  }
}

console.log(`\nBase dictionary "en": ${Object.keys(base).length} leaf keys.`);
if (totalIssues > 0) {
  console.log(`\nFAILED — ${totalIssues} issue(s) found.`);
  process.exit(1);
} else {
  console.log("SUCCESS — fa, ps, ar all match en with zero differences.");
}
