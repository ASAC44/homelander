import OpenAI from "openai";
import { env } from "../config.js";

export const MODEL = env.OPENAI_MODEL;
export const hasOpenAI = Boolean(env.OPENAI_API_KEY);

const TIMEOUT_MS = 20_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

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
let rateLimitedUntil = 0;

function isRateLimitError(err: unknown): boolean {
  return typeof err === "object"
    && err !== null
    && "status" in err
    && (err as { status?: number }).status === 429;
}

function shouldBypassOpenAI(): boolean {
  return Date.now() < rateLimitedUntil;
}

function noteRateLimit(err: unknown): void {
  if (!isRateLimitError(err)) return;
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function extractJSON(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fence = s.match(/^```(?:json)?\n([\s\S]*?)```$/);
  if (fence) s = fence[1].trim();
  return s;
}

export async function jsonCompletion<T>(opts: {
  system: string;
  user: string;
  fallback: T;
}): Promise<T> {
  if (shouldBypassOpenAI()) return opts.fallback;
  if (!client) return opts.fallback;
  const tryFormat = async (useJsonMode: boolean): Promise<T | null> => {
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        ...(useJsonMode ? { response_format: { type: "json_object" } as const } : {}),
        messages: [
          { role: "system", content: opts.system + (useJsonMode ? "" : "\nRespond with valid JSON.") },
          { role: "user", content: opts.user },
        ],
      });
      const raw = res.choices[0]?.message?.content;
      if (!raw) return null;
      return JSON.parse(extractJSON(raw)) as T;
    } catch (err) {
      noteRateLimit(err);
      console.warn(`[openai] jsonCompletion (json_mode=${useJsonMode}):`, err instanceof Error ? err.message : err);
      return null;
    }
  };

  if (supportsJsonMode) {
    const result = await tryFormat(true);
    if (result !== null) return result;
  }

  const fallbackResult = await tryFormat(false);
  if (fallbackResult !== null) return fallbackResult;

  console.warn("[openai] jsonCompletion failed, using fallback");
  return opts.fallback;
}

export async function textCompletion(opts: {
  system: string;
  user: string;
  fallback: string;
}): Promise<string> {
  if (shouldBypassOpenAI()) return opts.fallback;
  if (!client) return opts.fallback;
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || opts.fallback;
  } catch (err) {
    noteRateLimit(err);
    console.warn("[openai] textCompletion failed:", err instanceof Error ? err.message : err);
    return opts.fallback;
  }
}
