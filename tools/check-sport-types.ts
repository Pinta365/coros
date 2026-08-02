/**
 * Diff `SPORT_TYPE_API_VALUES` against the sport list the Training Hub web app
 * loads. Run with `deno task sport:check`; exits non-zero when a sport is
 * missing.
 *
 * Reports and proposes only — key names are not derivable from COROS's labels
 * (`"E-Bike"` is `roadEbike`, `"Floor Climb"` is `climbStairs`), so a suggested
 * name needs checking by hand.
 *
 * @module
 */

import { SPORT_TYPE_API_VALUES, type SportTypeKey } from "../src/constants.ts";

/** Every sport type the web app knows, as i18n keys plus numeric values. */
const MODE_PROFILE_URL = "https://static.coros.com/coros-traininghub-v2/static/profile/activityModeProfileList_prod.json";
/** `window.en_US = {...}`, resolving those i18n keys to English labels. */
const LOCALE_URL = "https://static.coros.com/locale/coros-traininghub-v2/en-US.prod.js";

interface ProfileEntry {
    value: number;
    /** i18n key, e.g. `H1243`. */
    key: string;
    label: string;
    /** Other sport type values declared by the same entry. */
    siblings: number[];
}

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.text();
}

/** Collect every non-negative `sportType` in the profile tree. */
function collect(node: unknown, locale: Record<string, string>, into: Map<number, ProfileEntry>): void {
    if (Array.isArray(node)) {
        for (const child of node) collect(child, locale, into);
        return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const values = record.sportType;
    if (Array.isArray(values) && typeof record.key === "string") {
        const numeric = values.filter((v): v is number => typeof v === "number");
        for (const value of numeric) {
            // Negative values are UI groupings in the sport picker, not sports.
            if (value < 0 || into.has(value)) continue;
            into.set(value, {
                value,
                key: record.key,
                label: locale[record.key] ?? "(no label)",
                siblings: numeric.filter((v) => v !== value && v >= 0),
            });
        }
    }
    for (const child of Object.values(record)) collect(child, locale, into);
}

/** A starting point for a key name; COROS labels do not map cleanly, so check it. */
function suggestKey(label: string): string {
    const words = label.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
    return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join("");
}

const [profileJson, localeJs] = await Promise.all([fetchText(MODE_PROFILE_URL), fetchText(LOCALE_URL)]);
const locale = JSON.parse(localeJs.replace(/^\s*window\.\w+\s*=\s*/, "").replace(/;\s*$/, "")) as Record<string, string>;
const profile = new Map<number, ProfileEntry>();
collect(JSON.parse(profileJson), locale, profile);

const declared = new Map<number, SportTypeKey>();
for (const [key, value] of Object.entries(SPORT_TYPE_API_VALUES)) declared.set(Number(value), key as SportTypeKey);

const entries = [...profile.values()].sort((a, b) => a.value - b.value);
const missing = entries.filter((e) => !declared.has(e.value));
const extra = [...declared.entries()].filter(([value]) => !profile.has(value)).sort((a, b) => a[0] - b[0]);

console.log(`\nprofile lists ${entries.length} sport types; SPORT_TYPE_API_VALUES declares ${declared.size}\n`);

if (missing.length > 0) {
    console.log(`%cmissing ${missing.length} sport type(s) — add to SportTypeKey and SPORT_TYPE_API_VALUES:`, "font-weight: bold");
    for (const entry of missing) {
        const also = entry.siblings.length ? `  // also declared as ${entry.siblings.join(", ")}` : "";
        console.log(`    ${suggestKey(entry.label)}: "${entry.value}",${also}  // ${entry.label} [${entry.key}]`);
    }
    console.log("\n  Key names are suggestions only — check them against the existing naming.\n");
} else {
    console.log("no missing sport types");
}

if (extra.length > 0) {
    // Not a failure: a value the web app omits may still appear on older activities.
    console.log(`\ndeclared but absent from the profile (${extra.length}) — legacy until seen on a real activity:`);
    for (const [value, key] of extra) console.log(`    ${key} = ${value}`);
}

// Our key names intentionally diverge from COROS's labels for a dozen entries,
// so this cross-check is noise on a normal run and would train people to ignore
// the output. Behind a flag, it is useful when a value looks mislabelled.
if (Deno.args.includes("--labels")) {
    console.log("\nlabel cross-check:");
    for (const e of entries) {
        if (!declared.has(e.value)) continue;
        console.log(`    ${String(e.value).padStart(6)}  ${declared.get(e.value)?.padEnd(18)} <- ${e.label}`);
    }
}

console.log();
if (missing.length > 0) Deno.exit(1);
