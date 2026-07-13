import assert from "node:assert/strict";
import test from "node:test";
import { testables } from "../src/lib/openai.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function providerError(status: number, headers?: Record<string, string>): Error & { status: number; headers?: Record<string, string> } {
  return Object.assign(new Error(`provider ${status}`), { status, headers });
}

test("OpenAI FIFO executor enforces max concurrency and starts queued work in order", async () => {
  const executor = testables.createFifoExecutor(2);
  const started: number[] = [];
  const releases: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;

  const tasks = [0, 1, 2, 3].map((id) =>
    executor.run(async () => {
      started.push(id);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releases[id] = resolve;
      });
      active--;
      return id;
    }));

  await tick();
  assert.deepEqual(started, [0, 1]);
  assert.equal(executor.activeCount(), 2);
  assert.equal(executor.pendingCount(), 2);

  releases[0]();
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  assert.equal(maxActive, 2);

  releases[1]();
  releases[2]();
  await tick();
  assert.deepEqual(started, [0, 1, 2, 3]);

  releases[3]();
  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3]);
});

test("OpenAI retry helper retries retryable provider errors and eventually succeeds", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await testables.runWithRetries(
    "test",
    async () => {
      attempts++;
      if (attempts < 3) throw providerError(429);
      return "ok";
    },
    {
      maxRetries: 3,
      baseMs: 100,
      maxMs: 1_000,
      cooldownMs: 10_000,
      random: () => 0.5,
      sleepMs: async (ms) => {
        delays.push(ms);
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("OpenAI retry helper honors Retry-After headers", async () => {
  let attempts = 0;
  const delays: number[] = [];

  await testables.runWithRetries(
    "test",
    async () => {
      attempts++;
      if (attempts === 1) throw providerError(429, { "retry-after": "2" });
      return "ok";
    },
    {
      maxRetries: 1,
      baseMs: 100,
      maxMs: 1_000,
      cooldownMs: 10_000,
      sleepMs: async (ms) => {
        delays.push(ms);
      },
    },
  );

  assert.deepEqual(delays, [2_000]);
});

test("OpenAI retry helper gives up after max retries so callers can fall back", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      testables.runWithRetries(
        "test",
        async () => {
          attempts++;
          throw providerError(500);
        },
        {
          maxRetries: 2,
          baseMs: 100,
          maxMs: 1_000,
          sleepMs: async () => {},
        },
      ),
    /provider 500/,
  );

  assert.equal(attempts, 3);
});

test("OpenAI retry helper does not retry invalid JSON parsing errors", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      testables.runWithRetries(
        "test",
        async () => {
          attempts++;
          throw new SyntaxError("Unexpected token");
        },
        {
          maxRetries: 3,
          sleepMs: async () => {
            throw new Error("sleep should not be called");
          },
        },
      ),
    /Unexpected token/,
  );

  assert.equal(attempts, 1);
});
