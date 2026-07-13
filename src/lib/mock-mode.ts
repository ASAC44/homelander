import { env } from "../config.js";

export interface MockDelayOptions {
  enabled?: boolean;
  minDurationMs?: number;
  nowMs?: number;
}

export function remainingMockDelayMs(startedAtMs: number, opts?: MockDelayOptions): number {
  const enabled = opts?.enabled ?? env.HOMELANDER_MOCK_MODE;
  const minDurationMs = opts?.minDurationMs ?? env.HOMELANDER_MOCK_MIN_DURATION_MS;
  if (!enabled || minDurationMs <= 0) return 0;

  const nowMs = opts?.nowMs ?? Date.now();
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  return Math.max(0, minDurationMs - elapsedMs);
}

export async function waitForMockLoopMinimum(
  startedAtMs: number,
  opts?: MockDelayOptions & { sleepMs?: (ms: number) => Promise<void> },
): Promise<void> {
  const delayMs = remainingMockDelayMs(startedAtMs, opts);
  if (delayMs <= 0) return;
  await (opts?.sleepMs ?? sleep)(delayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
