import { test } from "@cross/test";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { HttpError, STS_CONFIG_BY_REGION } from "../mod.ts";
import { getStsCredentials } from "../src/api/upload.ts";

const CREDENTIALS = {
    AccessKeyId: "ASIAEXAMPLE",
    SecretAccessKey: "secret",
    SessionToken: "token",
    Expiration: "2026-08-01T15:41:02.000Z",
    Region: "us-west-1",
    Bucket: "coros-s3",
};

async function withFetch(
    stub: (input: string | URL | Request) => Promise<Response>,
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

test("each AWS bucket carries its own STS signature", () => {
    // The signature is bound to the bucket — sending EN's signature with the EU
    // bucket answers 401, so the two must stay distinct.
    assert(STS_CONFIG_BY_REGION.en.sign);
    assert(STS_CONFIG_BY_REGION.eu.sign);
    assert(STS_CONFIG_BY_REGION.en.sign !== STS_CONFIG_BY_REGION.eu.sign);
    assertEquals(STS_CONFIG_BY_REGION.en.bucket, "coros-s3");
    assertEquals(STS_CONFIG_BY_REGION.eu.bucket, "eu-coros");
});

test("getStsCredentials refuses the unimplemented Aliyun flow", async () => {
    await assertRejects(() => getStsCredentials("cn"), Error, "Aliyun (CN) STS upload not implemented");
});

test("getStsCredentials parses the FAQ envelope, not the COROS envelope", async () => {
    // faq.coros.com answers {code, msg, data} — not {result, message, data}.
    await withFetch(
        () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        msg: "success",
                        code: 200,
                        data: { credentials: btoa(JSON.stringify(CREDENTIALS)), v: "2" },
                        module: null,
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            ),
        async () => {
            const creds = await getStsCredentials("en");
            assertEquals(creds.Bucket, "coros-s3");
            assertEquals(creds.Region, "us-west-1");
            assertEquals(creds.AccessKeyId, "ASIAEXAMPLE");
        },
    );
});

test("getStsCredentials surfaces a signature rejection as HttpError", async () => {
    await withFetch(
        () =>
            Promise.resolve(
                new Response(JSON.stringify({ msg: "signature error", code: 401, data: {}, module: null }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                }),
            ),
        async () => {
            const err = await assertRejects(() => getStsCredentials("en"), HttpError, "signature error");
            assertEquals(err.status, 401);
        },
    );
});

test("getStsCredentials tolerates a salt-prefixed credentials blob", async () => {
    await withFetch(
        () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        code: 200,
                        data: { credentials: "9y78gpoERW4lBNYL" + btoa(JSON.stringify(CREDENTIALS)) },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            ),
        async () => {
            assertEquals((await getStsCredentials("en")).Bucket, "coros-s3");
        },
    );
});
