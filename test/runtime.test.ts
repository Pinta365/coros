import { test } from "@cross/test";
import { assert, assertEquals, assertNotEquals, assertStringIncludes } from "@std/assert";
import { md5Hex } from "../src/md5.ts";
import { s3Put } from "../src/api/upload.ts";
import { crc32, createZipBuffer } from "../src/zip.ts";
import { loadTokenFromFile, saveTokenToFile } from "../src/token-storage.ts";
import type { BucketCredentials } from "../mod.ts";

/**
 * The pieces that go through a platform API rather than plain logic, and so
 * differ between Deno, Node, Bun and the browser.
 */

test("md5Hex matches the full RFC 1321 vector set", () => {
    // Vendored implementation; the login password hash depends on it.
    assertEquals(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e");
    assertEquals(md5Hex("a"), "0cc175b9c0f1b6a831c399e269772661");
    assertEquals(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
    assertEquals(md5Hex("message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
    assertEquals(md5Hex("abcdefghijklmnopqrstuvwxyz"), "c3fcd3d76192e4007dfb496cca67e13b");
    assertEquals(
        md5Hex("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"),
        "d174ab98d277d9f5a5611c2c9f419d9f",
    );
    assertEquals(
        md5Hex("12345678901234567890123456789012345678901234567890123456789012345678901234567890"),
        "57edf4a22be3c955ac49da2e2107b67a",
    );
    // Byte input must agree with the equivalent string input.
    assertEquals(md5Hex(new TextEncoder().encode("abc")), md5Hex("abc"));
});

test("md5Hex pads correctly around the 64-byte block boundary", () => {
    // Where padding either fits the final block or forces an extra one.
    const expected: Record<number, string> = {
        55: "ef1772b6dff9a122358552954ad0df65",
        56: "3b0c8ac703f828b04c6c197006d17218",
        57: "652b906d60af96844ebd21b674f35e93",
        63: "b06521f39153d618550606be297466d5",
        64: "014842d480b571495a4a0363793f7367",
        65: "c743a45e0d2e6a95cb859adae0248435",
    };
    for (const [len, digest] of Object.entries(expected)) {
        assertEquals(md5Hex("a".repeat(Number(len))), digest, `length ${len}`);
    }
});

test("md5Hex hashes strings as UTF-8, not Latin-1", () => {
    // A non-ASCII password would fail to log in if the string path narrowed
    // code points to bytes. Byte sequences are spelled out so the assertion
    // holds whatever encoding this file is saved in.
    const utf8 = new Uint8Array([0xc3, 0xa5, 0xc3, 0xa4, 0xc3, 0xb6]); // å ä ö
    const latin1 = new Uint8Array([0xe5, 0xe4, 0xf6]); // the same characters, narrowed

    // From code points, not a literal, for the same reason.
    const aao = String.fromCharCode(0xe5, 0xe4, 0xf6);
    assertEquals(md5Hex(aao), md5Hex(utf8));
    assertNotEquals(md5Hex(aao), md5Hex(latin1));

    assertEquals(md5Hex(utf8), "118a1637a7233ce6e62aa296975b27b4");
    assertEquals(md5Hex(latin1), "bc2d3829bdb7824cfec251d190189d65");

    // The literal must agree too, which also checks this file's own encoding.
    assertEquals(md5Hex("åäö"), md5Hex(utf8));
    assertEquals(md5Hex("åäö"), md5Hex(new TextEncoder().encode("åäö")));
});

test("md5Hex handles a byte view with a non-zero offset", () => {
    // A subarray shares its backing buffer; hashing must respect byteOffset.
    const full = new TextEncoder().encode("xxabc");
    const view = full.subarray(2);
    assertEquals(view.byteOffset, 2);
    assertEquals(md5Hex(view), md5Hex("abc"));
});

test("crc32 matches known vectors", () => {
    assertEquals(crc32(new Uint8Array(0)), 0);
    assertEquals(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    assertEquals(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("createZipBuffer produces an archive that parses back to its input", () => {
    const content = new TextEncoder().encode("hello coros");
    const entryName = "abc123/activity.fit";
    const zip = createZipBuffer(content, entryName, new Date(Date.UTC(2026, 7, 2, 11, 10, 38)));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const decoder = new TextDecoder();

    // End of central directory is the last 22 bytes (no archive comment).
    const eocd = zip.length - 22;
    assertEquals(view.getUint32(eocd, true), 0x06054b50);
    assertEquals(view.getUint16(eocd + 8, true), 2, "expected a directory entry plus the file");
    const centralStart = view.getUint32(eocd + 16, true);
    assertEquals(view.getUint32(eocd + 12, true), eocd - centralStart, "central directory size");

    // Walk the central directory and check each entry against its local header.
    let pos = centralStart;
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
        assertEquals(view.getUint32(pos, true), 0x02014b50);
        assertEquals(view.getUint16(pos + 10, true), 0, "entries must be STORED, not deflated");
        const nameLen = view.getUint16(pos + 28, true);
        const crc = view.getUint32(pos + 16, true);
        const size = view.getUint32(pos + 24, true);
        const offset = view.getUint32(pos + 42, true);
        const name = decoder.decode(zip.subarray(pos + 46, pos + 46 + nameLen));
        seen.push(name);

        // Local header at the recorded offset must agree with the central one.
        assertEquals(view.getUint32(offset, true), 0x04034b50, `local header for ${name}`);
        assertEquals(view.getUint32(offset + 14, true), crc, `crc for ${name}`);
        assertEquals(view.getUint32(offset + 22, true), size, `size for ${name}`);
        const localNameLen = view.getUint16(offset + 26, true);
        const dataStart = offset + 30 + localNameLen + view.getUint16(offset + 28, true);
        if (!name.endsWith("/")) {
            // Stored, so the bytes in the archive are the input verbatim.
            assertEquals(zip.subarray(dataStart, dataStart + size), content);
            assertEquals(crc, crc32(content));
        } else {
            assertEquals(size, 0, "directory entries carry no data");
        }
        pos += 46 + nameLen;
    }
    assertEquals(seen, ["abc123/", entryName]);
});

test("createZipBuffer declares UTF-8 entry names, but only when needed", () => {
    // Without bit 11 an extractor may read the name as CP437, turning
    // "Löpning.fit" into "LÃ¶pning.fit".
    const content = new TextEncoder().encode("x");
    const flagsOf = (zip: Uint8Array, offset: number) => new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint16(offset + 6, true);

    const unicode = createZipBuffer(content, "abc/Löpning.fit");
    const dirNameLen = new DataView(unicode.buffer, unicode.byteOffset, unicode.byteLength).getUint16(26, true);
    assertEquals(flagsOf(unicode, 0), 0, "an ASCII directory entry needs no flag");
    assertEquals(flagsOf(unicode, 30 + dirNameLen) & 0x800, 0x800, "the non-ASCII file entry must set bit 11");

    // ASCII archives stay flag-free, matching what the web app uploads.
    const ascii = createZipBuffer(content, "abc/plain.fit");
    const asciiDirLen = new DataView(ascii.buffer, ascii.byteOffset, ascii.byteLength).getUint16(26, true);
    assertEquals(flagsOf(ascii, 0), 0);
    assertEquals(flagsOf(ascii, 30 + asciiDirLen), 0);
});

test("createZipBuffer handles an entry with no directory component", () => {
    const content = new TextEncoder().encode("x");
    const zip = createZipBuffer(content, "activity.fit");
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const eocd = zip.length - 22;
    assertEquals(view.getUint32(eocd, true), 0x06054b50);
    assertEquals(view.getUint16(eocd + 8, true), 1, "no folder entry when the name has no slash");
});

test("createZipBuffer is reproducible for a fixed date", () => {
    const content = new TextEncoder().encode("hello coros");
    const date = new Date(Date.UTC(2026, 7, 2, 11, 10, 38));
    assertEquals(createZipBuffer(content, "a/b.fit", date), createZipBuffer(content, "a/b.fit", date));
});

test("s3Put signs with SigV4 and omits forbidden headers", async () => {
    const creds: BucketCredentials = {
        AccessKeyId: "ASIAEXAMPLE",
        SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        SessionToken: "session-token",
        Expiration: "2026-08-01T15:41:02.000Z",
        Region: "us-west-1",
        Bucket: "coros-s3",
    };
    let captured: { url: string; headers: Headers } | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
        captured = { url: String(input), headers: new Headers(init?.headers) };
        return Promise.resolve(new Response("", { status: 200 }));
    }) as typeof globalThis.fetch;
    try {
        await s3Put(creds, "fit_zip/123/abc.zip", new TextEncoder().encode("payload"));
    } finally {
        globalThis.fetch = original;
    }

    assert(captured, "fetch was not called");
    assertEquals(captured.url, "https://coros-s3.s3.us-west-1.amazonaws.com/fit_zip/123/abc.zip");

    const auth = captured.headers.get("authorization") ?? "";
    assertStringIncludes(auth, "AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/");
    assertStringIncludes(auth, "/us-west-1/s3/aws4_request");
    // content-length must NOT be signed: it is a forbidden header that the
    // runtime strips and regenerates, so signing it breaks the signature.
    assertStringIncludes(auth, "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token");
    assert(!auth.includes("content-length"), "content-length must not be signed");
    // Signature is lowercase hex from WebCrypto HMAC.
    const sig = auth.split("Signature=")[1] ?? "";
    assert(/^[0-9a-f]{64}$/.test(sig), `unexpected signature format: ${sig}`);

    assertEquals(captured.headers.get("x-amz-security-token"), "session-token");
    // SHA-256 of "payload" — proves crypto.subtle.digest ran over the body.
    assertEquals(
        captured.headers.get("x-amz-content-sha256"),
        "239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5",
    );
    assert(/^\d{8}T\d{6}Z$/.test(captured.headers.get("x-amz-date") ?? ""));
});

test("token file round-trips through the filesystem", async () => {
    const path = `coros-token-test-${Date.now()}.txt`;
    try {
        await saveTokenToFile(path, "token-abc-123");
        assertEquals(await loadTokenFromFile(path), "token-abc-123");
    } finally {
        // Deno.remove / node:fs unlink differ; use whichever the runtime has.
        const g = globalThis as { Deno?: { remove(p: string): Promise<void> } };
        if (g.Deno) {
            await g.Deno.remove(path);
        } else {
            const { unlink } = await import("node:fs/promises");
            await unlink(path);
        }
    }
});

test("token file load trims trailing whitespace", async () => {
    const path = `coros-token-trim-${Date.now()}.txt`;
    try {
        await saveTokenToFile(path, "token-xyz\n");
        assertEquals(await loadTokenFromFile(path), "token-xyz");
    } finally {
        const g = globalThis as { Deno?: { remove(p: string): Promise<void> } };
        if (g.Deno) {
            await g.Deno.remove(path);
        } else {
            const { unlink } = await import("node:fs/promises");
            await unlink(path);
        }
    }
});
