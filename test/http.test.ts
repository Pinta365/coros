import { test } from "@cross/test";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { ApiError, buildUrl, HttpError } from "../mod.ts";
import { getJson, getVoid, postJson } from "../src/http.ts";

const OPTIONS = { baseUrl: "https://teamapi.coros.com", accessToken: "t" };

/** Swap in a stub fetch for the duration of `fn`. */
async function withFetch(
    stub: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
    fn: () => Promise<void>,
): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = stub as typeof globalThis.fetch;
    try {
        await fn();
    } finally {
        globalThis.fetch = original;
    }
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

test("buildUrl resolves paths against the origin, with or without a leading slash", () => {
    assertEquals(buildUrl("https://teamapi.coros.com", "activity/query"), "https://teamapi.coros.com/activity/query");
    assertEquals(buildUrl("https://teamapi.coros.com", "/activity/query"), "https://teamapi.coros.com/activity/query");
    assertEquals(buildUrl("https://teamapi.coros.com/", "activity/query"), "https://teamapi.coros.com/activity/query");
});

test("buildUrl appends params and drops undefined and empty values", () => {
    const url = buildUrl("https://teamapi.coros.com", "activity/query", {
        pageNumber: 1,
        size: 20,
        modeList: undefined,
        startDay: "",
    });
    assertEquals(url, "https://teamapi.coros.com/activity/query?pageNumber=1&size=20");
});

test("getJson returns the envelope data on result 0000", async () => {
    await withFetch(
        () => Promise.resolve(json({ result: "0000", message: "OK", apiCode: "", data: { count: 2 } })),
        async () => {
            const data = await getJson<{ count: number }>("https://teamapi.coros.com/activity/query", OPTIONS);
            assertEquals(data.count, 2);
        },
    );
});

test("getJson sends the accessToken header", async () => {
    let seen: string | null = null;
    await withFetch(
        (_input, init) => {
            seen = new Headers(init?.headers).get("accessToken");
            return Promise.resolve(json({ result: "0000", message: "OK", data: {} }));
        },
        async () => {
            await getJson("https://teamapi.coros.com/account/query", OPTIONS);
        },
    );
    assertEquals(seen, "t");
});

test("a non-0000 result becomes an ApiError carrying result and tlogId", async () => {
    await withFetch(
        () => Promise.resolve(json({ result: "1030", message: "Wrong password", apiCode: "x", tlogId: "abc" })),
        async () => {
            const err = await assertRejects(
                () => getJson("https://teamapi.coros.com/account/login", OPTIONS),
                ApiError,
                "Wrong password",
            );
            assertEquals(err.result, "1030");
            assertEquals(err.tlogId, "abc");
        },
    );
});

test("an HTML rate-limit page becomes an HttpError, not a SyntaxError", async () => {
    await withFetch(
        () =>
            Promise.resolve(
                new Response("<html>429 Too Many Requests</html>", {
                    status: 429,
                    headers: { "content-type": "text/html" },
                }),
            ),
        async () => {
            const err = await assertRejects(
                () => getJson("https://teamapi.coros.com/activity/query", OPTIONS),
                HttpError,
            );
            assertEquals(err.status, 429);
            assert(err.isRateLimited);
            assert(err.bodyText?.includes("429"));
        },
    );
});

test("getVoid accepts a success envelope with no data field", async () => {
    await withFetch(
        () => Promise.resolve(json({ result: "0000", message: "OK", apiCode: "" })),
        async () => {
            await getVoid("https://teamapi.coros.com/activity/delete?labelId=1", OPTIONS);
        },
    );
});

test("getJson still rejects when data is required but absent", async () => {
    await withFetch(
        () => Promise.resolve(json({ result: "0000", message: "OK", apiCode: "" })),
        async () => {
            await assertRejects(
                () => getJson("https://teamapi.coros.com/account/query", OPTIONS),
                ApiError,
                "Response missing data",
            );
        },
    );
});

test("a timeout surfaces as HttpError with status 0", async () => {
    await withFetch(
        (_input, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            }),
        async () => {
            const err = await assertRejects(
                () => postJson("https://teamapi.coros.com/activity/detail/query", {}, { ...OPTIONS, timeoutMs: 10 }),
                HttpError,
                "timed out",
            );
            assertEquals(err.status, 0);
        },
    );
});
