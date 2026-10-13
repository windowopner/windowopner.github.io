// Encrypts private/discs.json into locks.json with a numeric code.
// The site asks for the same code on the keypad and decrypts in the browser.
//
//   node tools/lock.mjs            (prompts for the code, input hidden)
//   LOCK_CODE=... node tools/lock.mjs
//
// private/ is git-ignored; only the encrypted locks.json is committed.
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const ITERATIONS = 400000;
const root = new URL("..", import.meta.url);

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const code = process.env.LOCK_CODE || (await askHidden("Code (digits only): "));
if (!/^\d{4,12}$/.test(code)) {
  console.error("The code must be 4 to 12 digits, because the keypad only has digits.");
  process.exit(1);
}

const plain = await readFile(new URL("private/discs.json", root), "utf8");
JSON.parse(plain); // fail early on a typo

const { subtle } = globalThis.crypto;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
  base,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const out = { v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
await writeFile(new URL("locks.json", root), `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote locks.json (${code.length}-digit code).`);
