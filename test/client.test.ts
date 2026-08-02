import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { CorosClient } from "../mod.ts";

/** The origin the client sent a request to. */
async function requestOrigin(client: CorosClient): Promise<string> {
    let url = "";
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
        url = String(input);
        return Promise.resolve(
            new Response(JSON.stringify({ result: "0000", message: "OK", data: {} }), {
                headers: { "content-type": "application/json" },
            }),
        );
    }) as typeof globalThis.fetch;
    try {
        await client.getAccount();
    } finally {
        globalThis.fetch = original;
    }
    return new URL(url).origin;
}

const CREDENTIALS = { email: "u@example.com", password: "secret" };

test("region selects the API host", async () => {
    assertEquals(await requestOrigin(new CorosClient(CREDENTIALS, { region: "en", accessToken: "t" })), "https://teamapi.coros.com");
    assertEquals(await requestOrigin(new CorosClient(CREDENTIALS, { region: "eu", accessToken: "t" })), "https://teameuapi.coros.com");
    assertEquals(await requestOrigin(new CorosClient(CREDENTIALS, { region: "cn", accessToken: "t" })), "https://teamcnapi.coros.com");
});

test("baseUrl overrides region, and the Americas host is the default", async () => {
    const overridden = new CorosClient(CREDENTIALS, { baseUrl: "https://custom.example.com", region: "eu", accessToken: "t" });
    assertEquals(await requestOrigin(overridden), "https://custom.example.com");
    assertEquals(await requestOrigin(new CorosClient(CREDENTIALS, { accessToken: "t" })), "https://teamapi.coros.com");
});

test("the access token starts unset and round-trips through the setter", () => {
    assertEquals(new CorosClient(CREDENTIALS).getAccessToken(), undefined);
    const client = new CorosClient(CREDENTIALS, { accessToken: "token123" });
    assertEquals(client.getAccessToken(), "token123");
    client.setAccessToken("token456");
    assertEquals(client.getAccessToken(), "token456");
});
