import { env } from "../config.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface CompileResult {
  pdfPath: string;
  logPath: string;
  success: boolean;
  error?: string;
}

export async function compileLatexReport(
  texPath: string,
  outputDir: string,
): Promise<CompileResult> {
  const baseName = path.basename(texPath, ".tex");
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);
  const logPath = path.join(outputDir, `${baseName}.compile.log`);

  await fs.mkdir(outputDir, { recursive: true });

  const compiler = env.LATEX_COMPILER;
  const args =
    compiler === "latexmk"
      ? [
          "-pdf",
          "-interaction=nonstopmode",
          "-halt-on-error",
          `-outdir=${outputDir}`,
          texPath,
        ]
      : ["--outdir", outputDir, texPath];

  const cmd = compiler === "latexmk" ? "latexmk" : "tectonic";

  try {
    const { stdout, stderr } = await spawnWithTimeout(cmd, args, env.LATEX_COMPILE_TIMEOUT);
    const log = `[${cmd} stdout]\n${stdout}\n\n[${cmd} stderr]\n${stderr}`;
    await fs.writeFile(logPath, log, "utf-8");

    // Verify PDF was produced
    let pdfExists = false;
    try {
      const stat = await fs.stat(pdfPath);
      pdfExists = stat.size > 0;
    } catch {
      pdfExists = false;
    }

    if (!pdfExists) {
      return {
        pdfPath,
        logPath,
        success: false,
        error: `Compiler finished but no valid PDF was produced at ${pdfPath}`,
      };
    }

    return { pdfPath, logPath, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Write error log
    await fs.writeFile(logPath, `Compile failed: ${errorMessage}\n`, "utf-8");
    return { pdfPath, logPath, success: false, error: errorMessage };
  }
}

function spawnWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `LaTeX compiler "${cmd}" not found. Install tectonic (recommended) or latexmk.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Compiler exited with code ${code}\nstdout: ${stdout.slice(-500)}\nstderr: ${stderr.slice(-500)}`,
          ),
        );
      }
    });
  });
}
