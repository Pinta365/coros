import { test } from "@cross/test";
import { assertEquals, assertRejects } from "@std/assert";
import {
    CorosClient,
    formatYYYYMMDD,
    MAX_PAGE_SIZE,
    PERCEIVED_EXERTION_LABELS,
    perceivedExertionName,
    SPORT_TYPE_API_VALUES,
    sportTypeName,
} from "../mod.ts";

function client(): CorosClient {
    return new CorosClient({ email: "u@example.com", password: "p" }, { region: "eu", accessToken: "t" });
}

/** Capture the URLs an operation requests, answering each with `bodies` in order. */
async function captureUrls(bodies: unknown[], fn: (c: CorosClient) => Promise<unknown>): Promise<string[]> {
    const urls: string[] = [];
    const original = globalThis.fetch;
    let i = 0;
    globalThis.fetch = ((input: string | URL | Request) => {
        urls.push(String(input));
        const body = bodies[Math.min(i++, bodies.length - 1)];
        return Promise.resolve(
            new Response(JSON.stringify({ result: "0000", message: "OK", apiCode: "", data: body }), {
                headers: { "content-type": "application/json" },
            }),
        );
    }) as typeof globalThis.fetch;
    try {
        await fn(client());
    } finally {
        globalThis.fetch = original;
    }
    return urls;
}

test("formatYYYYMMDD uses local calendar components", () => {
    assertEquals(formatYYYYMMDD(new Date(2026, 0, 5)), "20260105");
    assertEquals(formatYYYYMMDD(new Date(2026, 11, 31)), "20261231");
});

test("getActivities maps endDay from `to`, not `from`", async () => {
    const urls = await captureUrls(
        [{ count: 0, dataList: [] }],
        (c) => c.getActivities({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) }),
    );
    const params = new URL(urls[0]).searchParams;
    assertEquals(params.get("startDay"), "20260101");
    assertEquals(params.get("endDay"), "20260131");
});

test("getActivities converts sport keys into API values", async () => {
    const urls = await captureUrls(
        [{ count: 0, dataList: [] }],
        (c) => c.getActivities({ modeList: ["run", "trailRun"] }),
    );
    assertEquals(new URL(urls[0]).searchParams.get("modeList"), "100,102");
});

test("getActivities passes a raw modeList string through unchanged", async () => {
    const urls = await captureUrls([{ count: 0 }], (c) => c.getActivities({ modeList: "100,999" }));
    assertEquals(new URL(urls[0]).searchParams.get("modeList"), "100,999");
});

test("getActivities rejects a page size the API would refuse", async () => {
    await assertRejects(() => client().getActivities({ size: 438 }), RangeError);
    await assertRejects(() => client().getActivities({ size: 0 }), RangeError);
    await assertRejects(() => client().getActivities({ page: 0 }), RangeError);
});

test("getAllActivities follows pagination and concatenates pages", async () => {
    const page = (n: number) => ({
        count: 3,
        totalPage: 2,
        pageNumber: n,
        dataList: [{ date: 20260101, labelId: `a${n}`, sportType: 100 }],
    });
    const urls = await captureUrls([page(1), page(2)], async (c) => {
        const all = await c.getAllActivities();
        assertEquals(all.length, 2);
        assertEquals(all.map((a) => a.labelId), ["a1", "a2"]);
    });
    assertEquals(urls.length, 2);
    assertEquals(new URL(urls[0]).searchParams.get("size"), String(MAX_PAGE_SIZE));
    assertEquals(new URL(urls[1]).searchParams.get("pageNumber"), "2");
});

test("getAllActivities stops on an empty page even if totalPage overreports", async () => {
    const urls = await captureUrls([{ count: 0, totalPage: 99, dataList: [] }], async (c) => {
        assertEquals((await c.getAllActivities()).length, 0);
    });
    assertEquals(urls.length, 1);
});

test("perceivedExertionName maps the five-point scale, with 0 meaning unrated", () => {
    // 1-based, so 0 is "never rated" rather than the lowest rating.
    assertEquals(perceivedExertionName(1), "veryLight");
    assertEquals(perceivedExertionName(2), "light");
    assertEquals(perceivedExertionName(3), "moderate");
    assertEquals(perceivedExertionName(4), "hard");
    assertEquals(perceivedExertionName(5), "maxEffort");
    assertEquals(perceivedExertionName(0), undefined, "0 is unrated, not the lowest rating");
    assertEquals(perceivedExertionName(6), undefined);
    assertEquals(PERCEIVED_EXERTION_LABELS[perceivedExertionName(2)!], "Light");
});

test("sportTypeName round-trips the sport type map", () => {
    assertEquals(sportTypeName(100), "run");
    assertEquals(sportTypeName("301"), "openWater");
    assertEquals(sportTypeName(123456), undefined);
    for (const [key, value] of Object.entries(SPORT_TYPE_API_VALUES)) {
        assertEquals(sportTypeName(value), key);
    }
});

test("sport type values are unique", () => {
    // Two keys sharing a value would silently collapse in SPORT_TYPE_BY_VALUE.
    const seen = new Map<string, string>();
    for (const [key, value] of Object.entries(SPORT_TYPE_API_VALUES)) {
        const clash = seen.get(value);
        assertEquals(clash, undefined, `${key} and ${clash} both map to ${value}`);
        seen.set(value, key);
    }
});

test("sport types cover the modes the watches actually record", () => {
    // Re-check against COROS's list with `deno task sport:check`.
    assertEquals(sportTypeName(707), "boatFishing");
    assertEquals(sportTypeName(714), "shoreFlyFishing");
    assertEquals(sportTypeName(1006), "padel");
    assertEquals(sportTypeName(1200), "hybridFitness");
    assertEquals(sportTypeName(904), "yoga");
    // 709 sits inside the fishing range but no mode uses it.
    assertEquals(sportTypeName(709), undefined);
});

test("authenticated calls reject without a token", async () => {
    const anon = new CorosClient({ email: "u@example.com", password: "p" }, { region: "eu" });
    await assertRejects(() => anon.getActivities(), Error, "Not authenticated");
    await assertRejects(() => anon.getAccount(), Error, "Not authenticated");
    await assertRejects(() => anon.deleteActivity("x"), Error, "Not authenticated");
});
