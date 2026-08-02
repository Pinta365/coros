import { test } from "@cross/test";
import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { AuthError, CorosClient } from "../mod.ts";
import { crc32 } from "../src/zip.ts";
import { md5Hex } from "../src/md5.ts";

/**
 * `uploadActivity()` orchestration: the S3 object key, the ZIP entry name and
 * the `jsonParameter` field set.
 *
 * Each piece is tested elsewhere; only the wiring is checked here. Getting it
 * wrong produces an import that fails, or silently never becomes an activity,
 * with no type error.
 */

const STS_CREDENTIALS = {
    AccessKeyId: "ASIAEXAMPLE",
    SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    SessionToken: "session-token",
    Expiration: "2026-08-02T15:41:02.000Z",
    Region: "eu-central-1",
    Bucket: "eu-coros",
};

interface Captured {
    sts?: URL;
    put?: { url: string; body: Uint8Array };
    import?: { url: string; json: Record<string, unknown> };
}

/** Stub the three requests uploadActivity makes, in order. */
function stubUpload(): { captured: Captured; restore: () => void } {
    const captured: Captured = {};
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("openapi/oss/sts")) {
            captured.sts = new URL(url);
            return Promise.resolve(
                new Response(
                    JSON.stringify({ code: 200, msg: "success", data: { credentials: btoa(JSON.stringify(STS_CREDENTIALS)) } }),
                    { headers: { "content-type": "application/json" } },
                ),
            );
        }
        if (init?.method === "PUT") {
            captured.put = { url, body: new Uint8Array(init.body as ArrayBuffer) };
            return Promise.resolve(new Response("", { status: 200 }));
        }
        // activity/fit/import — multipart form with a jsonParameter field.
        const form = init?.body as FormData;
        captured.import = { url, json: JSON.parse(form.get("jsonParameter") as string) };
        return Promise.resolve(
            new Response(
                JSON.stringify({ result: "0000", message: "OK", data: { id: "1", status: 2 } }),
                { headers: { "content-type": "application/json" } },
            ),
        );
    }) as typeof globalThis.fetch;
    return { captured, restore: () => (globalThis.fetch = original) };
}

function makeClient() {
    return new CorosClient(
        { email: "a@example.com", password: "pw" },
        { region: "eu", accessToken: "test-token" },
    );
}

const FILE = new TextEncoder().encode("fake fit content");
const USER_ID = "478692955022966784";

test("uploadActivity uses the object key and ZIP entry name the backend expects", async () => {
    const { captured, restore } = stubUpload();
    try {
        await makeClient().uploadActivity(FILE, "479061123914563695.fit", USER_ID);
    } finally {
        restore();
    }

    const md5 = md5Hex(FILE);

    // Object key: fit_zip/{userId}/{md5}.zip, uploaded to the region's bucket.
    assertEquals(captured.put?.url, `https://eu-coros.s3.eu-central-1.amazonaws.com/fit_zip/${USER_ID}/${md5}.zip`);

    // ZIP entry: {md5}/{originalFilename}, with a directory entry ahead of it.
    const zip = captured.put!.body;
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const dec = new TextDecoder();
    const dirLen = dv.getUint16(26, true);
    assertEquals(dec.decode(zip.subarray(30, 30 + dirLen)), `${md5}/`);
    const fileHeader = 30 + dirLen;
    const fileLen = dv.getUint16(fileHeader + 26, true);
    assertEquals(dec.decode(zip.subarray(fileHeader + 30, fileHeader + 30 + fileLen)), `${md5}/479061123914563695.fit`);

    // The stored bytes are the file, unmodified.
    const dataStart = fileHeader + 30 + fileLen;
    assertEquals(zip.subarray(dataStart, dataStart + FILE.length), FILE);
    assertEquals(dv.getUint32(fileHeader + 14, true), crc32(FILE));
});

test("uploadActivity sends the jsonParameter fields the import endpoint reads", async () => {
    const { captured, restore } = stubUpload();
    try {
        await makeClient().uploadActivity(FILE, "walk.fit", USER_ID);
    } finally {
        restore();
    }

    const md5 = md5Hex(FILE);
    const json = captured.import!.json;
    assertStringIncludes(captured.import!.url, "/activity/fit/import");
    assertEquals(json.bucket, "eu-coros", "must name the bucket the object went to");
    assertEquals(json.object, `fit_zip/${USER_ID}/${md5}.zip`, "must match the S3 key exactly");
    assertEquals(json.md5, md5);
    assertEquals(json.oriFileName, "walk.fit");
    assertEquals(json.serviceName, "aws");
    assertEquals(json.source, 1);
    assertEquals(json.size, captured.put!.body.byteLength, "size is the ZIP length, not the file length");
    assert(typeof json.timezone === "number");
});

test("uploadActivity requests credentials for the account's own region", async () => {
    // The backend only imports from its own region's bucket.
    const { captured, restore } = stubUpload();
    try {
        await makeClient().uploadActivity(FILE, "walk.fit", USER_ID);
    } finally {
        restore();
    }
    assertEquals(captured.sts?.searchParams.get("bucket"), "eu-coros");
    assertEquals(captured.sts?.searchParams.get("service"), "aws");
    assert(captured.sts?.searchParams.get("sign"), "a bucket-bound signature must be sent");
});

test("uploadRegion overrides the account region when set", async () => {
    const { captured, restore } = stubUpload();
    try {
        const client = new CorosClient(
            { email: "a@example.com", password: "pw" },
            { region: "eu", uploadRegion: "en", accessToken: "test-token" },
        );
        await client.uploadActivity(FILE, "walk.fit", USER_ID);
    } finally {
        restore();
    }
    assertEquals(captured.sts?.searchParams.get("bucket"), "coros-s3");
});

test("uploadActivity rejects unsupported file types and missing auth", async () => {
    const client = makeClient();
    await assertRejects(() => client.uploadActivity(FILE, "activity.gpx", USER_ID), Error, "Only .fit or .tcx");
    await assertRejects(() => client.uploadActivity(FILE, "noextension", USER_ID), Error, "Only .fit or .tcx");

    const anonymous = new CorosClient({ email: "a@example.com", password: "pw" }, { region: "eu" });
    await assertRejects(() => anonymous.uploadActivity(FILE, "walk.fit", USER_ID), AuthError);
});

test("uploadActivity accepts .tcx and is case-insensitive about the extension", async () => {
    const { captured, restore } = stubUpload();
    try {
        await makeClient().uploadActivity(FILE, "Ride.TCX", USER_ID);
    } finally {
        restore();
    }
    assertEquals(captured.import!.json.oriFileName, "Ride.TCX");
});
