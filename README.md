# @pinta365/coros

Unofficial TypeScript wrapper for the backend API that powers **COROS Training Hub** (teamapi.coros.com). Deno-first; works on Deno, Node 18+, Bun,
and browser (read-only + optional upload).

> **Unofficial.** The COROS API is private and unsupported. It can change or break at any time — see [Upload status](#upload-status) for the parts
> that are known to be most fragile. Use at your own risk.

## Installation

**Deno (JSR or import map):**

```ts
import { CorosClient } from "jsr:@pinta365/coros";
// or with deno.json imports: import { CorosClient } from "@pinta365/coros";
```

**Node / Bun:** Use a JSR-compatible loader or copy the source; `deno.json` imports can be resolved with appropriate tooling.

## Quick start

```ts
import { CorosClient } from "@pinta365/coros";

const client = new CorosClient(
    { email: "you@example.com", password: "your-password" },
    { region: "eu" }, // "en" (Americas, default) | "eu" | "cn"
);

await client.login();
const account = await client.getAccount();

// One page, or every page.
const page = await client.getActivities({ page: 1, size: 20, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
const runs = await client.getAllActivities({ modeList: ["run", "trailRun"] });

// Download the FIT file for the most recent activity.
const latest = runs[0];
const fit = await client.downloadActivityFile(latest.labelId, "fit", latest.sportType);
```

Pick the `region` that matches where your COROS account lives — a token from one region is not valid on another.

## Features

- **Auth:** Login (MD5 password), token in memory, optional token file persistence (`saveTokenToFile` / `loadTokenFromFile`).
- **Account:** Get profile (`getAccount`).
- **Activities:** List one page (`getActivities`) or follow pagination automatically (`getAllActivities`), detail (`getActivityDetail`), download URL
  (`getActivityDownloadUrl`), download file bytes (`downloadActivityFile`), delete (`deleteActivity`).
- **Training:** Training schedule for date range (`getTrainingSchedule`).
- **Activity notes:** `getActivityDetail` exposes `sportFeelInfo` — the free-text note (`sportNote`), perceived exertion (`feelType`, via
  `perceivedExertionName()`) and any voice note. Detail-only; the activity list does not include it.
- **EvoLab:** Daily analytics for a date range (`getAnalyse`) — training load, Base Fitness, resting HR, HRV, fatigue and load-ratio zones, weekly
  records. Dashboard layout preferences (`getPrivateProfile`).
- **Upload:** Upload FIT/TCX (`uploadActivity`), list import jobs (`getImportList`), remove from import list (`removeFromImportList`).
- **Sport types:** `SPORT_TYPE_API_VALUES` (key to API value) and `sportTypeName()` (API value back to key, for the numeric `sportType` on list
  items). Covers all 60 modes the Training Hub knows.

### A note on `sportType`

`getActivityDetail`, `getActivityDownloadUrl`, and `downloadActivityFile` all take a `sportType`. It defaults to `100` (running), which is wrong for
every other sport — pass the `sportType` from the activity list item instead.

### `deleteActivity` succeeds whether or not the activity existed

`activity/delete` is idempotent and barely validates its input. An already-deleted `labelId`, one that never existed, and an empty one all return the
same 53-byte envelope, byte for byte:

```json
{ "apiCode": "8D2DB17A", "message": "OK", "result": "0000" }
```

Only a non-numeric id fails, and then with a generic `1001 Service exceptions` that looks like a parse error rather than a check.

Retries are therefore safe, but a successful call is **not** evidence the activity was there, and no field in the response distinguishes the cases. If
you need to know something was really removed, check the activity list afterwards.

### Activity notes and perceived exertion

The note written in the app lives on the detail response, not the activity list:

```ts
import { PERCEIVED_EXERTION_LABELS, perceivedExertionName } from "@pinta365/coros";

const detail = await client.getActivityDetail(labelId, sportType);
detail.sportFeelInfo?.sportNote; // "Lätt promenad"

const key = perceivedExertionName(detail.sportFeelInfo?.feelType ?? 0);
key ? PERCEIVED_EXERTION_LABELS[key] : "not rated"; // "Light"
```

`feelType` runs 1..5 — Very Light, Light, Moderate, Hard, Max Effort — and is `0` when the activity was never rated, so `perceivedExertionName()`
returns `undefined` for it rather than the lowest rating. An unset `sportNote` is `""` rather than absent, so test for a non-empty string.

### Units: the detail endpoint is centi-scaled

The API is not internally consistent about scaling. Reading the same activity from both endpoints:

| Field       | `getActivities` (list) | `getActivityDetail` (`summary`) |
| ----------- | ---------------------- | ------------------------------- |
| `distance`  | `2357.59` (metres)     | `235759`                        |
| `totalTime` | `6915` (seconds)       | `691549`                        |
| `startTime` | `1784641430` (epoch s) | `178464143013`                  |

The activity list and `getAnalyse` are unscaled; the detail `summary` is centi-scaled. `calories` is an exception and is not centi-scaled in either.

Conversion is explicit rather than automatic, so raw API values are always what you get back:

```ts
import { dateFromDetailTimestamp, fromDetailScale, timezoneOffsetMinutes, toKilocalories } from "@pinta365/coros";

fromDetailScale(summary.distance); //         235759 -> 2357.59 metres
dateFromDetailTimestamp(summary.startTimestamp); // -> Date
timezoneOffsetMinutes(item.startTimezone); //        8 -> 120 (quarter-hours -> minutes)
toKilocalories(summary.calories); //            541449 -> 541.4 kcal
```

Two more traps worth knowing: `startTimezone` / `timezone` are **quarter-hours** (`8` = UTC+2), and `avgSpeed` is a **pace in seconds per kilometre**,
not a speed.

## Options

- `baseUrl` — Override API base URL (default: Americas).
- `region` — `"en"` | `"eu"` | `"cn"` to set base URL by region.
- `uploadRegion` — Region for upload/STS. Defaults to `region` — see [Upload status](#upload-status).
- `accessToken` — Pre-set token (skip login).
- `requestTimeoutMs` — Request timeout in milliseconds.

## Error handling

- `ApiError` — The request reached the API and it answered with `result !== '0000'` (includes `result`, `message`, `apiCode`, optional `tlogId`).
- `HttpError` — Transport-level failure: a non-JSON body (rate-limit or gateway HTML), a non-2xx response with no API envelope, or a timeout
  (`status === 0`). Check `isRateLimited` for HTTP 429.
- `AuthError` — Operation requires authentication and no token is set locally.

The API rate-limits aggressively, and logging into the Training Hub web app or the phone app can invalidate a token you are holding. Persist the token
with `saveTokenToFile` and reuse it rather than calling `login()` on every run, and be ready to re-login when a call starts failing:

```ts
try {
    await client.getActivities();
} catch (err) {
    if (err instanceof HttpError && err.isRateLimited) {
        // back off and retry later
    } else if (err instanceof ApiError) {
        // token may have been invalidated elsewhere — call login() again
    }
}
```

## Upload status

Upload is **verified end to end on `eu`** — STS, ZIP, S3 PUT, `activity/fit/import`, and an activity appearing in the account. `en` uses the same code
path and its STS credentials are confirmed, but no `en` account was available to test the import against. CN (Aliyun) is not implemented.

The STS endpoint's `sign` parameter is bound to the bucket it requests — `coros-s3` (`us-west-1`) for Americas, `eu-coros` (`eu-central-1`) for Europe
— and a signature sent with the wrong bucket answers `401 signature error`.

Both signatures are hardcoded in `src/constants.ts`, alongside an `app_id`. They are opaque values belonging to COROS, taken from its own clients, and
the scheme that produces them is not public. **If COROS rotates them, upload stops working and cannot be fixed from here** — `getStsCredentials()`
throws an `HttpError` with `status: 401` and `signature error` in the message. Reads are unaffected. The same applies in principle to the endpoint
URLs, which are equally undocumented.

`uploadRegion` defaults to `region`, which is what you want: the backend only imports objects from its own region's bucket. Uploading an EU account's
file to `coros-s3` registers an import that settles at `status: -2` with `size: -1` and never creates an activity.

## Runtime matrix

| Runtime  | Login, account, activities, training | Token file helpers | Upload (FIT/TCX)                  |
| -------- | ------------------------------------ | ------------------ | --------------------------------- |
| Deno     | Yes                                  | Yes                | Verified (`eu`), same path (`en`) |
| Node 18+ | Yes                                  | Yes                | Untested live, same code path     |
| Bun      | Yes                                  | Yes                | Untested live, same code path     |
| Browser  | Yes (token in memory or app storage) | No                 | Provide buffer, no CN             |

The suite is verified green on Deno 2.9, Node 24 and Bun 1.3, including the platform-dependent surface — MD5, ZIP, WebCrypto SigV4 signing and
filesystem token storage (`test/runtime.test.ts`). Browser is a documented subset, not a tested one, but the API does permit it: a CORS preflight from
an arbitrary origin is answered with that origin in `Access-Control-Allow-Origin` and `accesstoken` in `Access-Control-Allow-Headers`.

The library therefore avoids `node:crypto` and other Node built-ins. MD5 in particular has no Web Crypto equivalent — the spec excludes it — so
`src/md5.ts` vendors the `deno_std` implementation (MIT, see `NOTICE`) rather than calling a platform API.

Two different Node requirements, worth separating:

- **Runtime:** Node 18+. The library only needs `fetch`, `crypto.subtle`, `AbortController` and `TextEncoder`, all available from 18.
- **Consuming the `.ts` sources without a build step:** Node 22.6+ with `--experimental-strip-types`, or 23.6+ where it is on by default. Below that,
  compile or bundle first.

Install the dependencies with `npx jsr add @cross/test @std/assert @cross/fs`. They are all JSR packages, and only `@cross/fs` is needed at runtime —
the other two are for the test suite. Verified on Node 24; 18–21 is inferred from the API surface, not tested.

## Development

```bash
deno task pre:push     # format, lint, type-check, test
deno test -A           # run tests
deno task sport:check  # diff the sport type map against COROS's published list
```

`sport:check` fetches the Training Hub's own public profile and locale assets — no account needed — and exits non-zero if COROS has added a sport type
we do not declare. It is not part of `pre:push`, which stays offline.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development notes.
