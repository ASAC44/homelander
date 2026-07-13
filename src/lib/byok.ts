import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";
import type { OpenAIRequestContext } from "./openai.js";

interface StoredApiKeyRecord {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
}

export type ByokCommand =
  | { type: "set"; apiKey: string }
  | { type: "remove" }
  | { type: "status" }
  | { type: "help" };

function storageFileForUser(userId: string): string {
  const safeUserId = encodeURIComponent(userId);
  return path.join(env.OPENAI_KEY_STORAGE_DIR, `${safeUserId}.json`);
}

function encryptionSecret(): string | null {
  return env.BYOK_ENCRYPTION_SECRET
    || env.SLACK_SIGNING_SECRET
    || env.SLACK_BOT_TOKEN
    || null;
}

function encryptionKey(): Buffer | null {
  const secret = encryptionSecret();
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(env.OPENAI_KEY_STORAGE_DIR, { recursive: true });
}

function encryptApiKey(apiKey: string): Omit<StoredApiKeyRecord, "createdAt" | "updatedAt" | "version"> {
  const key = encryptionKey();
  if (!key) throw new Error("BYOK storage is not configured with an encryption secret");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptApiKey(record: StoredApiKeyRecord): string {
  const key = encryptionKey();
  if (!key) throw new Error("BYOK storage is not configured with an encryption secret");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function parseByokCommand(text: string): ByokCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const setMatch =
    trimmed.match(/^(?:set|save|store|use|connect)\s+(?:my\s+)?(?:openai\s+)?api\s+key\s*[:=]?\s+(\S+)\s*$/i)
    || trimmed.match(/^(?:openai\s+)?api\s+key\s*[:=]\s*(\S+)\s*$/i);
  if (setMatch?.[1]) {
    return { type: "set", apiKey: setMatch[1].trim() };
  }

  if (/^(?:remove|delete|clear|disconnect)\s+(?:my\s+)?(?:openai\s+)?api\s+key\s*$/i.test(trimmed)) {
    return { type: "remove" };
  }

  if (/^(?:show\s+)?(?:openai\s+)?api\s+key\s+status\s*$/i.test(trimmed) || /^(?:byok|api key) status\s*$/i.test(trimmed)) {
    return { type: "status" };
  }

  if (/^(?:help\s+)?(?:with\s+)?(?:byok|openai\s+api\s+key|api\s+key)\s*$/i.test(trimmed)) {
    return { type: "help" };
  }

  return null;
}

export function extractLikelyApiKey(text: string): string | null {
  const explicitCommand = parseByokCommand(text);
  if (explicitCommand?.type === "set") return explicitCommand.apiKey;

  const match = text.match(/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/);
  return match?.[0] ?? null;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "••••••";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

export async function saveUserOpenAiKey(userId: string, apiKey: string): Promise<void> {
  await ensureStorageDir();
  const now = new Date().toISOString();
  let createdAt = now;

  try {
    const existing = await fs.readFile(storageFileForUser(userId), "utf8");
    const parsed = JSON.parse(existing) as Partial<StoredApiKeyRecord>;
    if (typeof parsed.createdAt === "string") createdAt = parsed.createdAt;
  } catch {}

  const encrypted = encryptApiKey(apiKey);
  const record: StoredApiKeyRecord = {
    version: 1,
    createdAt,
    updatedAt: now,
    ...encrypted,
  };
  await fs.writeFile(storageFileForUser(userId), JSON.stringify(record, null, 2), "utf8");
}

export async function getUserOpenAiKey(userId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(storageFileForUser(userId), "utf8");
    const record = JSON.parse(raw) as StoredApiKeyRecord;
    if (record.version !== 1) return null;
    return decryptApiKey(record);
  } catch {
    return null;
  }
}

export async function hasUserOpenAiKey(userId: string): Promise<boolean> {
  return Boolean(await getUserOpenAiKey(userId));
}

export async function deleteUserOpenAiKey(userId: string): Promise<boolean> {
  try {
    await fs.unlink(storageFileForUser(userId));
    return true;
  } catch {
    return false;
  }
}

export async function getUserOpenAiContext(userId: string): Promise<OpenAIRequestContext | undefined> {
  const apiKey = await getUserOpenAiKey(userId);
  if (!apiKey) return undefined;
  return { apiKey };
}

export function isByokConfigured(): boolean {
  return Boolean(encryptionSecret());
}
