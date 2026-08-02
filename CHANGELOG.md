# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of `@pinta365/coros` (Coros Training Hub API wrapper).
- `CorosClient` with constructor (credentials + options: baseUrl, region, uploadRegion, accessToken, requestTimeoutMs).
- Auth: `login()`, `getAccount()`, `getAccessToken()`, `setAccessToken()`, optional `saveTokenToFile()` / `loadTokenFromFile()` (server runtimes).
- Activities: `getActivities()` (pagination, date range, correct endDay), `getActivityDetail()`, `getActivityDownloadUrl()`, `deleteActivity()`.
- Training: `getTrainingSchedule()` (startDate, endDate, supportRestExercise).
- Upload: `uploadActivity()` (FIT/TCX via STS + S3 + import), `getImportList()`, `removeFromImportList()`.
- Types: credentials, user, activity list/detail/download, file/sport type maps, STS/upload types.
- Errors: `ApiError` (result, message, apiCode, tlogId), `AuthError`.
- Native `fetch` only; cross-runtime (Deno, Node 18+, Bun, browser subset).
- Constants: base URLs by region (en/eu/cn), file type and sport type API values, STS config.
- README and CONTRIBUTING.md; pre-push: fmt, lint, check, test.
- `getAllActivities()` — follows pagination to the last page.
- `downloadActivityFile()` — resolves the signed URL and returns the file bytes.
- `HttpError` — transport-level failures (non-JSON bodies, non-2xx without an envelope, timeouts), with `status` and `isRateLimited`.
- `SPORT_TYPE_BY_VALUE` and `sportTypeName()` — reverse lookup for the numeric `sportType` on activity list items.
- 22 sport types the map was missing, taking it from 40 to 62: the seven NOMAD fishing modes (boat, shore, kayak, inshore, offshore, boat fly, shore
  fly), the racket and ball sports (badminton, table tennis, basketball, soccer, pickleball, tennis, padel), studio modes (elliptical, yoga, pilates,
  boxing), frisbee, skateboard, hybrid fitness and outdoor climb (802). Recovered from the Training Hub's own public `activityModeProfileList` and
  locale bundle rather than by probing the API — see CONTRIBUTING.md. Every sport type the profile lists is now declared.
- `tools/check-sport-types.ts` and the `sport:check` task — re-runs that diff against COROS's published assets and exits non-zero when a sport type is
  missing, so the map can be refreshed on a release instead of drifting. Checked in, excluded from publish, and kept out of `pre:push` because it
  needs network.
- `MAX_PAGE_SIZE`, exported `formatYYYYMMDD`, and the `ActivityQueryOptions` / `TrainingScheduleData` types.
- Tests for URL building, envelope and error mapping, timeouts, pagination, date params, and sport type mapping.
- EvoLab: `getAnalyse()` (`analyse/query`) — daily training load, Base Fitness (`t28d`), resting HR, sleep HRV, fatigue and load-ratio zones, weekly
  records and distribution summaries. Both it and `getPrivateProfile()` (`profile/private/query`) are GET; they answer `1001 Service exceptions` to
  POST.
- `src/units.ts` — `fromDetailScale`, `dateFromDetailTimestamp`, `dateFromTimestamp`, `dateFromYYYYMMDD`, `timezoneOffsetMinutes`, `toApiTimezone`,
  `toKilocalories`, `paceSecondsPerKm`. Conversion is explicit; raw API values are still what the client returns.
- Types modelled on live responses: `AnalyseData` and friends, `ActivityDetailSummary`, and an `ActivityListItem` covering the fields the API actually
  returns (it declared ~15 of 56).
- `ActivitySportFeelInfo` on `ActivityDetailData` — the activity note (`sportNote`), the subjective feel rating (`feelType`) and the voice-note
  fields. Detail-only; the activity list does not carry them. An activity with no note returns `""` and `feelType: 0` rather than omitting the field.
- `LICENSE` (MIT) and `NOTICE`.
- `src/zip.ts` — a minimal STORED-only ZIP writer plus `crc32()`, replacing jszip. Uploads were never compressed (the web app stores too), so the
  dependency was doing container framing only. Output was checked byte-for-byte against jszip for a real 180 KB FIT — identical apart from jszip
  stamping auto-created folder entries with `new Date()`, which made its output non-reproducible. Verified by extracting with Windows `Expand-Archive`
  (MD5 of the extracted FIT matches) and by a live EU upload that COROS unzipped into a real activity.

### Known limitations

- `deleteActivity()` cannot report whether the activity existed. An already-deleted id, a non-existent one and an empty one all return an identical
  `0000` envelope; only a non-numeric id fails, with a generic `1001`. Verified live against the raw response. Retries are safe; existence checks are
  not.
- CN (Aliyun) upload is not implemented; `getStsCredentials("cn")` throws.
- `en` upload is unverified end to end. The code path is identical to the verified `eu` one and the STS credentials come back fine, but no Americas
  account was available to confirm the import actually creates an activity.
- The two STS signatures are static constants captured from live sessions. If COROS rotates them, upload breaks with `401 signature error` until they
  are re-captured — there is no way to derive one.
- Detail `summary` values are centi-scaled while list and analyse values are not. Conversion is left to the caller via `src/units.ts` rather than
  applied automatically, because the exceptions (`calories`, and anything not yet observed) are not fully mapped.

[Unreleased]: https://github.com/pinta365/coros/compare/v0.0.1...HEAD
