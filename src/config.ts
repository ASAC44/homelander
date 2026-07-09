import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_REASONING_EFFORT: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
  BRIGHTDATA_API_TOKEN: z.string().optional(),
  BRIGHTDATA_PRO_MODE: z.string().default("false"),
  REPORT_STORAGE_DIR: z.string().default("./data/reports"),
  EVIDENCE_STORAGE_DIR: z.string().default("./data/evidence"),
  EVIDENCE_TTL_HOURS: z.coerce.number().default(72),
  LATEX_COMPILER: z.enum(["tectonic", "latexmk"]).default("tectonic"),
  LATEX_COMPILE_TIMEOUT: z.coerce.number().default(120_000),
  REPORT_KEEP_TEX: z.string().default("true"),
  PUBLIC_BASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[config] Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
