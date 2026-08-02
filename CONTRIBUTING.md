# Contributing

## Layout

- `src/` — the library; `mod.ts` re-exports its public surface
- `test/` — test suite, run on Deno, Node and Bun
- `tools/` — maintenance scripts, checked in but not published

## Development

```bash
deno task pre:push     # fmt --check, lint, check mod.ts, test -A
deno task sport:check  # diff the sport type map against COROS's published list
```

`sport:check` needs network, so it is not part of `pre:push`.

### Running the tests on Node and Bun

The suite uses `@cross/test` and runs unchanged on all three runtimes. Copy `mod.ts`, `src/` and `test/` to a scratch directory, keeping the layout so
`../mod.ts` resolves, then:

```bash
npx jsr add @cross/test @std/assert @cross/fs
bun test                    # Bun
node --test test/*.test.ts  # Node 23.6+, or 22.6+ with --experimental-strip-types
```

Do not do this in the project directory — it creates `package.json`, `.npmrc` and `node_modules`, none of which belong in a Deno-first repo. Last
verified green on Deno 2.9.4, Node 24.7.0 and Bun 1.3.13.

## Discovering API constants without probing

The Training Hub serves its own reference data as unauthenticated static assets. Prefer these over guessing values or creating throwaway activities:

- `https://static.coros.com/coros-traininghub-v2/static/profile/activityModeProfileList_prod.json` — every sport type the web app knows, as i18n keys
  plus `sportType` / `mode` / `subMode`. Negative `sportType` values are UI groupings, not sports.
- `https://static.coros.com/locale/coros-traininghub-v2/en-US.prod.js` — `window.en_US = {...}`, resolving those i18n keys to English labels. Swap the
  locale in the path for other languages.
- Sibling profiles worth checking when an unfamiliar field appears: `activitySourceDataProfile_prod.json`, `activityStrengthProfile_prod.json`,
  `activityExportFileTypes_prod.json`.

`deno task sport:check` joins the first two and diffs them against `SPORT_TYPE_API_VALUES`, exiting non-zero when the profile lists a sport we do not
declare. It reports and proposes only — key names are not derivable from COROS's labels (`"E-Bike"` is `roadEbike`, `"Floor Climb"` is `climbStairs`),
so a suggested name needs checking by hand.

For anything the static assets do not cover, capture a HAR of the web app rather than probing the API. `training/schedule/query`, `analyse/query` and
`profile/private/query` are GET and answer `1001 Service exceptions` to POST, so confirm a method against the live API before trusting any external
description of it.

## API behaviour worth knowing

Confirmed against a live account; the user-facing subset is in the README.

- **`account/query` echoes a live `accessToken` in its response.** Never log or dump that payload verbatim; redact it with a `JSON.stringify` replacer
  before writing it anywhere.
- GPS coordinates in `frequencyList` and lap start/end are degrees scaled by 1e7 — `577528390` is `57.752839`.
- `lapList` is a list of lap _groupings_ (by distance, by manual lap, ...) each holding its own `lapItemList`, not a flat list of laps.
- The API returns the same field set for every sport, zero-filled where irrelevant, so a walk carries `swolf` and `totalFishingTime`.
  `ActivityListItem` names ~15 of 56 returned fields; `summary` returns ~150.
- Upload: bucket and key are `{region bucket}` and `fit_zip/{userId}/{md5}.zip`, ZIP entry `{md5}/{originalFilename}`, import settling at `status: 2`
  with `errorSize: 0`. Re-uploading a file already in the account creates a duplicate rather than deduplicating.
- Import jobs are keyed by md5 and reused: re-uploading the same file updates the existing job, leaving `createTime` at the first attempt.
- `activity/delete` is idempotent and barely validates input — see the README. Do not build an existence check on it.
