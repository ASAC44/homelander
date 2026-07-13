import OpenAI from "openai";
import { env } from "../config.js";

export const MODEL = env.OPENAI_MODEL;
export const hasOpenAI = Boolean(env.OPENAI_API_KEY);

const TIMEOUT_MS = 20_000;
const DEFAULT_MAX_CONCURRENCY = env.OPENAI_BASE_URL ? 1 : 3;

const client = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || undefined,
      timeout: TIMEOUT_MS,
      maxRetries: 0,
    })
  : null;

// Non-OpenAI providers (Gemini, Ollama, etc.) rarely support json_object mode.
const supportsJsonMode = !env.OPENAI_BASE_URL;

const openAiQueue = createFifoExecutor(env.OPENAI_MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY);

export interface FifoExecutor {
  run<T>(task: () => Promise<T>): Promise<T>;
  activeCount(): number;
  pendingCount(): number;
}

export function createFifoExecutor(maxConcurrency: number): FifoExecutor {
  const limit = Math.max(1, Math.floor(maxConcurrency));
  let active = 0;
  const pending: Array<() => void> = [];

  const pump = () => {
    while (active < limit) {
      const next = pending.shift();
      if (!next) return;
      next();
    }
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push(() => {
          active++;
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        });
        pump();
      });
    },
    activeCount: () => active,
    pendingCount: () => pending.length,
  };
}

function statusFromError(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("status" in err)) return null;
  const status = Number((err as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function isRetryableError(err: unknown): boolean {
  const status = statusFromError(err);
  return status === 408 || status === 409 || status === 429 || (status !== null && status >= 500);
}

function headerValue(headers: unknown, key: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (name: string) => string | null }).get(key);
    return value || null;
  }
  if (typeof headers !== "object") return null;
  const entries = Object.entries(headers as Record<string, unknown>);
  const found = entries.find(([name]) => name.toLowerCase() === key.toLowerCase());
  return typeof found?.[1] === "string" ? found[1] : null;
}

function retryAfterMs(err: unknown, now = Date.now()): number | null {
  const headers = typeof err === "object" && err !== null && "headers" in err
    ? (err as { headers?: unknown }).headers
    : null;
  const raw =
    headerValue(headers, "retry-after-ms")
    ?? headerValue(headers, "x-ratelimit-reset-ms")
    ?? headerValue(headers, "retry-after");
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const isMilliseconds = raw.includes(".") || numeric > 1000 || headerValue(headers, "retry-after-ms") === raw;
    return Math.max(0, Math.round(isMilliseconds ? numeric : numeric * 1000));
  }

  const dateMs = Date.parse(raw);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : null;
}

function backoffDelayMs(attempt: number, baseMs: number, maxMs: number, random = Math.random): number {
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  const jitter = 0.75 + random() * 0.5;
  return Math.min(maxMs, Math.round(exponential * jitter));
}

function extractJSON(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fence = s.match(/^```(?:json)?\n([\s\S]*?)```$/);
  if (fence) s = fence[1].trim();
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetries<T>(
  label: string,
  task: () => Promise<T>,
  opts?: {
    maxRetries?: number;
    baseMs?: number;
    maxMs?: number;
    cooldownMs?: number;
    sleepMs?: (ms: number) => Promise<void>;
    random?: () => number;
    onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; error: unknown }) => void;
  },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? env.OPENAI_MAX_RETRIES;
  const baseMs = opts?.baseMs ?? env.OPENAI_RETRY_BASE_MS;
  const maxMs = opts?.maxMs ?? env.OPENAI_RETRY_MAX_MS;
  const cooldownMs = opts?.cooldownMs ?? env.OPENAI_RATE_LIMIT_COOLDOWN_MS;
  const sleepMs = opts?.sleepMs ?? sleep;
  const random = opts?.random ?? Math.random;

  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (!isRetryableError(err) || attempt >= maxRetries) throw err;
      const retryDelay = retryAfterMs(err);
      const computedDelay = retryDelay ?? backoffDelayMs(attempt + 1, baseMs, maxMs, random);
      const delayMs = Math.min(computedDelay, cooldownMs);
      const retryInfo = { attempt: attempt + 1, maxRetries, delayMs, error: err };
      opts?.onRetry?.(retryInfo);
      console.warn(
        `[openai] ${label} retry ${retryInfo.attempt}/${maxRetries} in ${delayMs}ms:`,
        err instanceof Error ? err.message : err,
      );
      await sleepMs(delayMs);
    }
  }
}

async function queuedChatCompletion<T>(
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  return openAiQueue.run(() => runWithRetries(label, task));
}

interface CompletionAttempt<T> {
  ok: boolean;
  value: T | null;
  retryableExhausted: boolean;
}

function isRetryableExhausted(err: unknown): boolean {
  return isRetryableError(err);
}

export async function jsonCompletion<T>(opts: {
  system: string;
  user: string;
  fallback: T;
}): Promise<T> {
  if (!client) return opts.fallback;
  const tryFormat = async (useJsonMode: boolean): Promise<CompletionAttempt<T>> => {
    try {
      const res = await queuedChatCompletion(`jsonCompletion(json_mode=${useJsonMode})`, () =>
        client.chat.completions.create({
          model: MODEL,
          temperature: 0.3,
          ...(useJsonMode ? { response_format: { type: "json_object" } as const } : {}),
          messages: [
            { role: "system", content: opts.system + (useJsonMode ? "" : "\nRespond with valid JSON.") },
            { role: "user", content: opts.user },
          ],
        }));
      const raw = res.choices[0]?.message?.content;
      if (!raw) return { ok: false, value: null, retryableExhausted: false };
      return { ok: true, value: JSON.parse(extractJSON(raw)) as T, retryableExhausted: false };
    } catch (err) {
      console.warn(`[openai] jsonCompletion (json_mode=${useJsonMode}):`, err instanceof Error ? err.message : err);
      return { ok: false, value: null, retryableExhausted: isRetryableExhausted(err) };
    }
  };

  if (supportsJsonMode) {
    const result = await tryFormat(true);
    if (result.ok) return result.value as T;
    if (result.retryableExhausted) {
      console.warn("[openai] jsonCompletion failed after retries, using fallback");
      return opts.fallback;
    }
  }

  const fallbackResult = await tryFormat(false);
  if (fallbackResult.ok) return fallbackResult.value as T;

  console.warn("[openai] jsonCompletion failed, using fallback");
  return opts.fallback;
}

export async function textCompletion(opts: {
  system: string;
  user: string;
  fallback: string;
}): Promise<string> {
  if (!client) return opts.fallback;
  try {
    const res = await queuedChatCompletion("textCompletion", () =>
      client.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }));
    return res.choices[0]?.message?.content?.trim() || opts.fallback;
  } catch (err) {
    console.warn("[openai] textCompletion failed:", err instanceof Error ? err.message : err);
    return opts.fallback;
  }
}

export const testables = {
  backoffDelayMs,
  createFifoExecutor,
  isRetryableError,
  retryAfterMs,
  runWithRetries,
};
