import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { IsbnWorkflowResult, Operation } from "../lib/types";

const ISBN_PYTHON = "/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/isbn-신청-epub/.venv/bin/python";
const resultSchema = z.object({
  status: z.literal("completed"),
  isbn: z.string().trim().refine((value) => value.replaceAll(/\D/g, "").length === 13),
  applicationNo: z.string().trim().min(1),
  isbnStatus: z.enum(["applied", "issued"]),
  colophonStatus: z.literal("completed"),
  bookSlug: z.string().trim().min(1),
}).strict();

export async function runIsbnWorkflow(operation: Operation): Promise<IsbnWorkflowResult> {
  const temporary = await mkdtemp(path.join(tmpdir(), "sunbee-isbn-"));
  const inputFile = path.join(temporary, "operation.json");
  const outputFile = path.join(temporary, "result.json");
  await writeFile(inputFile, JSON.stringify(operation), "utf8");
  try {
    await new Promise<void>((resolve, reject) => {
      const script = path.join(import.meta.dirname, "isbn_workflow.py");
      const child = spawn(ISBN_PYTHON, [script, "--operation-json", inputFile], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 60_000).unref();
      }, 75 * 60 * 1_000);
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString("utf8")}`.slice(-20_000);
        process.stderr.write(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`ISBN 워크플로 실패(code=${code ?? "none"}, signal=${signal ?? "none"}): ${stderr.slice(-4_000)}`));
          return;
        }
        void writeFile(outputFile, Buffer.concat(chunks)).then(() => resolve(), reject);
      });
    });
    return resultSchema.parse(JSON.parse(await readFile(outputFile, "utf8")));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
