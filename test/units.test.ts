import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import {
    dateFromDetailTimestamp,
    dateFromTimestamp,
    dateFromYYYYMMDD,
    fromDetailScale,
    gpsCoordinate,
    timezoneOffsetMinutes,
    toApiTimezone,
    toKilocalories,
} from "../mod.ts";

// One activity read from both endpoints: the list is unscaled, the detail
// summary centi-scaled.
const LIVE = {
    list: { distance: 2357.59, totalTime: 6915, startTime: 1784641430, startTimezone: 8 },
    detail: { distance: 235759, totalTime: 691549, startTimestamp: 178464143013, calories: 541449 },
};

test("detail values scale back to the list values", () => {
    assertEquals(fromDetailScale(LIVE.detail.distance), LIVE.list.distance);
    // The detail endpoint keeps sub-second precision the list rounds away.
    assertEquals(Math.floor(fromDetailScale(LIVE.detail.totalTime)), LIVE.list.totalTime);
});

test("both timestamp forms resolve to the same instant", () => {
    const fromList = dateFromTimestamp(LIVE.list.startTime);
    const fromDetail = dateFromDetailTimestamp(LIVE.detail.startTimestamp);
    assertEquals(fromList.toISOString(), "2026-07-21T13:43:50.000Z");
    assertEquals(Math.floor(fromDetail.getTime() / 1000), Math.floor(fromList.getTime() / 1000));
});

test("timezone fields are quarter-hours", () => {
    assertEquals(timezoneOffsetMinutes(LIVE.list.startTimezone), 120); // UTC+2
    assertEquals(timezoneOffsetMinutes(0), 0);
    assertEquals(timezoneOffsetMinutes(-20), -300); // UTC-5
});

test("toApiTimezone encodes an offset the way the API expects", () => {
    // getTimezoneOffset is minutes *behind* UTC, so UTC+2 reports -120.
    const utcPlus2 = { getTimezoneOffset: () => -120 } as Date;
    assertEquals(toApiTimezone(utcPlus2), 8);
    const utcMinus5 = { getTimezoneOffset: () => 300 } as Date;
    assertEquals(toApiTimezone(utcMinus5), -20);
});

test("calories convert to kilocalories", () => {
    assertEquals(Number(toKilocalories(LIVE.detail.calories).toFixed(1)), 541.4);
});

test("GPS coordinates are degrees scaled by 1e7", () => {
    assertEquals(gpsCoordinate(577528390), 57.752839);
    assertEquals(gpsCoordinate(121831582), 12.1831582);
    // Southern/western hemispheres stay negative.
    assertEquals(gpsCoordinate(-337528390), -33.752839);
});

test("dateFromYYYYMMDD parses the API's day format", () => {
    const d = dateFromYYYYMMDD(20260721);
    assertEquals(d.getFullYear(), 2026);
    assertEquals(d.getMonth(), 6);
    assertEquals(d.getDate(), 21);
    assertEquals(dateFromYYYYMMDD("20260101").getMonth(), 0);
});
