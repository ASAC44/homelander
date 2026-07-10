import { env } from "../config.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface SavePdfResult {
  filePath: string;
  reportId: string;
  version: string;
  fileName: string;
}

export interface SaveHtmlReportResult {
  filePath: string;
  reportId: string;
  version: string;
  fileName: string;
  slug: string;
}

export interface SaveEvidenceResult {
  evidenceId: string;
  filePath: string;
  createdAt: string;
  expiresAt: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function initStorage(): Promise<void> {
  await fs.mkdir(env.REPORT_STORAGE_DIR, { recursive: true });
  await fs.mkdir(env.EVIDENCE_STORAGE_DIR, { recursive: true });
}

export async function savePdf(
  buffer: Buffer,
  shipmentProduct: string,
): Promise<SavePdfResult> {
  const reportId = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(shipmentProduct);
  const version = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `homelander-report-${slug}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.pdf`;
  const dir = path.join(env.REPORT_STORAGE_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, buffer);
  return { filePath, reportId, version, fileName };
}

export async function saveHtmlReport(
  html: string,
  shipmentProduct: string,
  reportId: string,
  version: string,
): Promise<SaveHtmlReportResult> {
  const slug = slugify(shipmentProduct);
  const fileName = `report-${reportId}.html`;
  const dir = path.join(env.REPORT_STORAGE_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, html, "utf-8");
  return { filePath, reportId, version, fileName, slug };
}

export async function saveEvidence(text: string): Promise<SaveEvidenceResult> {
  const evidenceId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.EVIDENCE_TTL_HOURS * 60 * 60 * 1000);
  const fileName = `${evidenceId}.txt`;
  const filePath = path.join(env.EVIDENCE_STORAGE_DIR, fileName);
  const content = `Homelander Evidence File\nID: ${evidenceId}\nGenerated: ${now.toISOString()}\nExpires: ${expiresAt.toISOString()}\n${"-".repeat(72)}\n\n${text}`;
  await fs.writeFile(filePath, content, "utf-8");
  return {
    evidenceId,
    filePath,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getEvidence(
  evidenceId: string,
): Promise<{ text: string; expiresAt: Date } | null> {
  const fileName = `${evidenceId}.txt`;
  const filePath = path.join(env.EVIDENCE_STORAGE_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const expiresAt = new Date();
    const match = content.match(/^Expires: (.+)$/m);
    if (match) {
      expiresAt.setTime(Date.parse(match[1]));
    }
    if (Date.now() > expiresAt.getTime()) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    return { text: content, expiresAt };
  } catch {
    return null;
  }
}

export async function getSavedReport(
  slug: string,
  fileName: string,
): Promise<string | null> {
  const safeSlug = slugify(slug);
  if (safeSlug !== slug || !/^report-[a-f0-9-]+\.html$/.test(fileName)) {
    return null;
  }
  const filePath = path.join(env.REPORT_STORAGE_DIR, safeSlug, fileName);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function cleanupExpiredEvidence(): Promise<number> {
  const dir = env.EVIDENCE_STORAGE_DIR;
  let removed = 0;
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".txt")) continue;
      const filePath = path.join(dir, entry);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const match = content.match(/^Expires: (.+)$/m);
        if (match) {
          const expiresAt = Date.parse(match[1]);
          if (Date.now() > expiresAt) {
            await fs.unlink(filePath);
            removed++;
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // directory may not exist
  }
  return removed;
}
