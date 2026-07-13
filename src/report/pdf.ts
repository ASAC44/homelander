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

  const texVarDir = path.join(outputDir, ".texmf-var");
  const varTexFontsDir = path.join(outputDir, ".texfonts");
  const attempts = env.LATEX_COMPILER === "latexmk"
    ? [compilerAttempt("latexmk", outputDir, texPath), compilerAttempt("tectonic", outputDir, texPath)]
    : [compilerAttempt("tectonic", outputDir, texPath), compilerAttempt("latexmk", outputDir, texPath)];
  const logs: string[] = [];

  await fs.mkdir(texVarDir, { recursive: true });
  await fs.mkdir(varTexFontsDir, { recursive: true });

  for (const attempt of attempts) {
    try {
      const { stdout, stderr } = await spawnWithTimeout(
        attempt.cmd,
        attempt.args,
        env.LATEX_COMPILE_TIMEOUT,
        {
          ...process.env,
          TEXMFVAR: process.env.TEXMFVAR || texVarDir,
          VARTEXFONTS: process.env.VARTEXFONTS || varTexFontsDir,
        },
      );
      logs.push(`[${attempt.cmd} stdout]\n${stdout}\n\n[${attempt.cmd} stderr]\n${stderr}`);

      const pdfExists = await hasPdf(pdfPath);
      if (pdfExists) {
        await fs.writeFile(logPath, logs.join("\n\n"), "utf-8");
        return { pdfPath, logPath, success: true };
      }

      logs.push(`[${attempt.cmd} error]\nCompiler finished but no valid PDF was produced at ${pdfPath}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logs.push(`[${attempt.cmd} error]\n${errorMessage}`);
    }
  }

  const errorMessage = `All LaTeX compilers failed for ${texPath}`;
  await fs.writeFile(logPath, `${logs.join("\n\n")}\n\n[final]\n${errorMessage}\n`, "utf-8");
  return { pdfPath, logPath, success: false, error: errorMessage };
}

function compilerAttempt(
  compiler: "tectonic" | "latexmk",
  outputDir: string,
  texPath: string,
): { cmd: string; args: string[] } {
  if (compiler === "latexmk") {
    return {
      cmd: "latexmk",
      args: [
        "-pdf",
        "-interaction=nonstopmode",
        "-halt-on-error",
        `-outdir=${outputDir}`,
        texPath,
      ],
    };
  }

  return {
    cmd: "tectonic",
    args: ["--outdir", outputDir, texPath],
  };
}

async function hasPdf(pdfPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(pdfPath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

function spawnWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number,
  childEnv?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env: childEnv,
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
