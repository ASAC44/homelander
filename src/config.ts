import { z } from "zod";

const envNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => value === "" ? undefined : value, schema);

const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === "" || value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return value;
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOMELANDER_MOCK_MODE: envBoolean(false),
  HOMELANDER_MOCK_MIN_DURATION_MS: envNumber(z.coerce.number().int().min(0).default(60_000)),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  BYOK_ENCRYPTION_SECRET: z.string().optional(),
  OPENAI_KEY_STORAGE_DIR: z.string().default("./data/byok"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_REASONING_EFFORT: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
  OPENAI_MAX_CONCURRENCY: envNumber(z.coerce.number().int().positive().optional()),
  OPENAI_MAX_RETRIES: envNumber(z.coerce.number().int().min(0).default(3)),
  OPENAI_RETRY_BASE_MS: envNumber(z.coerce.number().int().positive().default(750)),
  OPENAI_RETRY_MAX_MS: envNumber(z.coerce.number().int().positive().default(8_000)),
  OPENAI_RATE_LIMIT_COOLDOWN_MS: envNumber(z.coerce.number().int().positive().default(60_000)),
  BRIGHTDATA_API_TOKEN: z.string().optional(),
  BRIGHTDATA_PRO_MODE: z.string().default("false"),
  REPORT_STORAGE_DIR: z.string().default("./data/reports"),
  EVIDENCE_STORAGE_DIR: z.string().default("./data/evidence"),
  EVIDENCE_TTL_HOURS: z.coerce.number().default(72),
  LATEX_COMPILER: z.enum(["tectonic", "latexmk"]).default("tectonic"),
  LATEX_COMPILE_TIMEOUT: z.coerce.number().default(300_000),
  REPORT_KEEP_TEX: z.string().default("true"),
  PUBLIC_BASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[config] Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
