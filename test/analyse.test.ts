import { test } from "@cross/test";
import { assertEquals, assertRejects } from "@std/assert";
import { CorosClient } from "../mod.ts";

/** Capture request method and URL, answering with `data`. */
async function capture(data: unknown, fn: (c: CorosClient) => Promise<unknown>): Promise<{ method: string; url: string }[]> {
    const seen: { method: string; url: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
        seen.push({ method: init?.method ?? "GET", url: String(input) });
        return Promise.resolve(
            new Response(JSON.stringify({ result: "0000", message: "OK", apiCode: "", data }), {
                headers: { "content-type": "application/json" },
            }),
        );
    }) as typeof globalThis.fetch;
    try {
        await fn(new CorosClient({ email: "u@example.com", password: "p" }, { region: "eu", accessToken: "t" }));
    } finally {
        globalThis.fetch = original;
    }
    return seen;
}

test("getAnalyse is a GET using startDay/endDay", async () => {
    // POST answers 1001; the params are startDay/endDay, not startDate/endDate.
    const seen = await capture(
        { dayList: [], sportDataSummary: { count: 0, modelValidState: false } },
        (c) => c.getAnalyse({ startDate: new Date(2026, 6, 1), endDate: new Date(2026, 7, 1) }),
    );
    assertEquals(seen.length, 1);
    assertEquals(seen[0].method, "GET");
    const params = new URL(seen[0].url).searchParams;
    assertEquals(new URL(seen[0].url).pathname, "/analyse/query");
    assertEquals(params.get("startDay"), "20260701");
    assertEquals(params.get("endDay"), "20260801");
    assertEquals(params.get("startDate"), null);
});

test("getAnalyse returns the EvoLab payload", async () => {
    let result: unknown;
    await capture(
        {
            dayList: [{ happenDay: 20260801, timestamp: 1785542400, distance: 0, duration: 0, rhr: 59, t28d: 26, tib: 30 }],
            sportDataSummary: { count: 2, modelValidState: false },
        },
        async (c) => {
            result = await c.getAnalyse({ startDate: new Date(2026, 6, 1), endDate: new Date(2026, 7, 1) });
        },
    );
    const data = result as { dayList: { t28d: number }[]; sportDataSummary: { modelValidState: boolean } };
    assertEquals(data.dayList[0].t28d, 26);
    assertEquals(data.sportDataSummary.modelValidState, false);
});

test("getPrivateProfile is a GET", async () => {
    const seen = await capture({ dashboardProfileList: [] }, (c) => c.getPrivateProfile());
    assertEquals(seen[0].method, "GET");
    assertEquals(new URL(seen[0].url).pathname, "/profile/private/query");
});

test("analyse calls reject without a token", async () => {
    const anon = new CorosClient({ email: "u@example.com", password: "p" }, { region: "eu" });
    await assertRejects(() => anon.getAnalyse({ startDate: new Date(), endDate: new Date() }), Error, "Not authenticated");
    await assertRejects(() => anon.getPrivateProfile(), Error, "Not authenticated");
});
