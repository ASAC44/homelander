import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { env } from "../config.js";
import type { CompileResult } from "./pdf.js";

function escapeRoffLine(line: string): string {
  let out = line.replace(/\\/g, "\\e");
  if (out.startsWith(".") || out.startsWith("'")) out = `\\&${out}`;
  return out;
}

function toMsDocument(title: string, body: string): string {
  const lines = body.split("\n");
  const doc: string[] = [
    ".nr PS 11",
    ".nr VS 14",
    ".po 0.7i",
    ".ll 6.7i",
    ".fam T",
    ".TL",
    escapeRoffLine(title),
    ".AU",
    "Transitra",
    ".DA",
    "",
  ];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      doc.push(".PP");
      continue;
    }
    if (line.startsWith("# ")) {
      doc.push(".sp 0.6");
      doc.push(".NH 1");
      doc.push(escapeRoffLine(line.slice(2)));
      continue;
    }
    if (line.startsWith("- ")) {
      doc.push(".IP \\(bu 3");
      doc.push(escapeRoffLine(line.slice(2)));
      continue;
    }
    if (/^[A-Za-z][A-Za-z /-]+: /.test(line)) {
      const idx = line.indexOf(":");
      const label = escapeRoffLine(line.slice(0, idx + 1));
      const value = escapeRoffLine(line.slice(idx + 2));
      doc.push(`\\fB${label}\\fP ${value}`);
      continue;
    }
    doc.push(escapeRoffLine(line));
  }

  doc.push("");
  return doc.join("\n");
}

export async function compileGroffReport(
  title: string,
  body: string,
  outputDir: string,
  baseName: string,
): Promise<CompileResult> {
  const msPath = path.join(outputDir, `${baseName}.ms`);
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);
  const logPath = path.join(outputDir, `${baseName}.compile.log`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(msPath, toMsDocument(title, body), "utf-8");

  try {
    const { stdout, stderr } = await spawnBinaryWithTimeout(
      "groff",
      ["-ms", "-Tpdf", msPath],
      env.LATEX_COMPILE_TIMEOUT,
    );
    await fs.writeFile(pdfPath, stdout);
    await fs.writeFile(logPath, `[groff stdout bytes=${stdout.length}]\n\n[groff stderr]\n${stderr}`, "utf-8");
    return { pdfPath, logPath, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await fs.writeFile(logPath, `Groff fallback failed: ${errorMessage}\n`, "utf-8");
    return { pdfPath, logPath, success: false, error: errorMessage };
  }
}

function spawnBinaryWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: Buffer.concat(chunks), stderr });
      } else {
        reject(new Error(`groff exited with code ${code}\nstderr: ${stderr.slice(-1000)}`));
      }
    });
  });
}
