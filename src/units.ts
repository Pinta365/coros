/**
 * Unit conversion for COROS API values.
 *
 * Scaling is not consistent between endpoints — the same activity reads:
 *
 * | Field       | `activity/query` | `activity/detail/query` |
 * | ----------- | ---------------- | ----------------------- |
 * | `distance`  | `2357.59` (m)    | `235759`                |
 * | `totalTime` | `6915` (s)       | `691549`                |
 * | `startTime` | `1784641430` (s) | `178464143013`          |
 *
 * The activity list and `analyse/query` are unscaled; the detail `summary` is
 * centi-scaled. `calories` is centi-scaled in neither.
 *
 * Conversion is explicit, never applied automatically, so callers always get
 * raw API values back.
 *
 * @module
 */

/** Divisor applied to most numeric fields in a detail `summary`. */
export const DETAIL_SCALE = 100;

/** Convert a centi-scaled detail value to its base unit (metres, seconds, ...). */
export function fromDetailScale(value: number): number {
    return value / DETAIL_SCALE;
}

/** Detail `summary` timestamps are centi-scaled epoch seconds, e.g. `178464143013`. */
export function dateFromDetailTimestamp(value: number): Date {
    return new Date((value / DETAIL_SCALE) * 1000);
}

/** Activity list and `analyse/query` timestamps are plain epoch seconds. */
export function dateFromTimestamp(value: number): Date {
    return new Date(value * 1000);
}

/**
 * Minutes east of UTC. `startTimezone`, `timezone` and the upload `timezone`
 * are all quarter-hours: `8` is UTC+2.
 */
export function timezoneOffsetMinutes(quarterHours: number): number {
    return quarterHours * 15;
}

/** Encode a JS timezone offset as the quarter-hours the API expects. */
export function toApiTimezone(date: Date = new Date()): number {
    return (-date.getTimezoneOffset() / 60) * 4;
}

/** The API reports calories, so a 541 kcal walk comes back as `541449`. */
export function toKilocalories(value: number): number {
    return value / 1000;
}

/**
 * Identity, documenting the trap: despite the name, `avgSpeed` is already a
 * pace in seconds per kilometre.
 */
export function paceSecondsPerKm(avgSpeed: number): number {
    return avgSpeed;
}

/** Scale applied to GPS coordinates in the recorded track. */
export const GPS_SCALE = 1e7;

/** Track coordinates (`frequencyList`, lap start/end) are integers scaled by 1e7. */
export function gpsCoordinate(value: number): number {
    return value / GPS_SCALE;
}

/** Parse a `YYYYMMDD` number (e.g. `20260721`) into a local `Date`. */
export function dateFromYYYYMMDD(value: number | string): Date {
    const s = String(value);
    return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}
