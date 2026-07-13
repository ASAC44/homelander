import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { env } from "../src/config.js";
import {
  deleteUserOpenAiKey,
  extractLikelyApiKey,
  getUserOpenAiKey,
  isByokConfigured,
  maskApiKey,
  parseByokCommand,
  saveUserOpenAiKey,
} from "../src/lib/byok.js";

test("BYOK parser recognizes supported DM commands", () => {
  assert.deepEqual(parseByokCommand("set api key sk-test-1234567890"), {
    type: "set",
    apiKey: "sk-test-1234567890",
  });
  assert.deepEqual(parseByokCommand("api key: sk-proj-abcdef"), {
    type: "set",
    apiKey: "sk-proj-abcdef",
  });
  assert.deepEqual(parseByokCommand("api key status"), { type: "status" });
  assert.deepEqual(parseByokCommand("remove api key"), { type: "remove" });
  assert.deepEqual(parseByokCommand("help api key"), { type: "help" });
});

test("BYOK parser detects likely public API key leaks", () => {
  assert.equal(extractLikelyApiKey("my key is sk-proj-1234567890ABCDEFGHIJK"), "sk-proj-1234567890ABCDEFGHIJK");
  assert.equal(extractLikelyApiKey("hello world"), null);
});

test("BYOK storage encrypts and round-trips user keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "transitra-byok-"));
  const previousDir = env.OPENAI_KEY_STORAGE_DIR;
  const previousSecret = env.BYOK_ENCRYPTION_SECRET;

  env.OPENAI_KEY_STORAGE_DIR = tempDir;
  env.BYOK_ENCRYPTION_SECRET = "test-byok-secret";

  try {
    assert.equal(isByokConfigured(), true);
    await saveUserOpenAiKey("U123", "sk-proj-secretvalue123456");

    const saved = await getUserOpenAiKey("U123");
    assert.equal(saved, "sk-proj-secretvalue123456");

    const file = await fs.readFile(path.join(tempDir, "U123.json"), "utf8");
    assert.doesNotMatch(file, /secretvalue123456/);
    assert.match(maskApiKey(saved!), /^sk-p…3456$/);

    assert.equal(await deleteUserOpenAiKey("U123"), true);
    assert.equal(await getUserOpenAiKey("U123"), null);
  } finally {
    env.OPENAI_KEY_STORAGE_DIR = previousDir;
    env.BYOK_ENCRYPTION_SECRET = previousSecret;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
