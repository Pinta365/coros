/**
 * Token file persistence. Server runtimes only — the browser has no
 * filesystem.
 *
 * @module
 */
import { readFile, writeFile } from "@cross/fs/io";

const ENCODING = "utf-8" as const;

/** Save an access token for later reuse. */
export async function saveTokenToFile(filePath: string, token: string): Promise<void> {
    await writeFile(filePath, token, ENCODING);
}

/** Load a token saved by {@link saveTokenToFile}. */
export async function loadTokenFromFile(filePath: string): Promise<string> {
    const content = await readFile(filePath, ENCODING);
    return content.trim();
}
