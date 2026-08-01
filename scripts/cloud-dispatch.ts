import { spawn } from "node:child_process";
import ky from "ky";
import { z } from "zod";
import { buildCloudTaskPrompt, cloudDispatchPacketSchema, type CloudDispatchPacket } from "@/lib/cloud-task-prompt";

const dashboardUrl = z.url().parse(process.env["CLOUD_DASHBOARD_URL"]);
const bridgeToken = z.string().min(1).parse(process.env["CODEX_BRIDGE_TOKEN"]);
const cloudEnvironmentId = z.string().regex(/^[a-f0-9]{32}$/).parse(process.env["CODEX_CLOUD_ENV_ID"]);
const cloudBranch = z.string().min(1).parse(process.env["CODEX_CLOUD_BRANCH"] ?? "cloud-dashboard");
const dispatchLimit = z.coerce.number().int().min(1).max(50).parse(process.env["CLOUD_DISPATCH_LIMIT"] ?? "20");

const taskUrlSchema = z.url().refine((url) => url.includes("/codex/tasks/"));

function bridgeHeaders(): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${bridgeToken}` };
}

async function submitCloudTask(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["cloud", "exec", "--env", cloudEnvironmentId, "--branch", cloudBranch, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout = `${stdout}${chunk.toString("utf8")}`.slice(-20_000); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-20_000); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Codex Cloud 제출 실패(code=${code ?? "none"}): ${stderr}`));
        return;
      }
      const taskUrl = stdout.split(/\s+/).find((part) => taskUrlSchema.safeParse(part).success);
      if (!taskUrl) {
        reject(new TypeError(`Codex Cloud 작업 URL을 찾지 못했습니다: ${stdout}`));
        return;
      }
      resolve(taskUrl);
    });
  });
}

async function claimProductionJob(): Promise<CloudDispatchPacket | null> {
  const claimResponse = await ky.post(`${dashboardUrl}/api/bridge/jobs/claim`, {
    headers: bridgeHeaders(),
    json: { types: ["topic_insight", "book_build"] },
    throwHttpErrors: false,
    timeout: 30_000,
  });
  if (claimResponse.status === 204) return null;
  if (!claimResponse.ok) throw new Error(`클라우드 작업 가져오기 실패(${claimResponse.status}): ${await claimResponse.text()}`);
  const claimed = z.object({ job: z.object({ id: z.uuid() }).passthrough() }).passthrough().parse(await claimResponse.json());
  const packetResponse = await ky.get(`${dashboardUrl}/api/cloud/jobs/${encodeURIComponent(claimed.job.id)}/packet`, {
    headers: bridgeHeaders(),
    throwHttpErrors: false,
    timeout: 30_000,
  });
  if (!packetResponse.ok) throw new Error(`클라우드 작업 패킷 실패(${packetResponse.status}): ${await packetResponse.text()}`);
  return cloudDispatchPacketSchema.parse(await packetResponse.json());
}

async function reportSubmission(packet: CloudDispatchPacket, taskUrl: string): Promise<void> {
  const response = await ky.post(`${dashboardUrl}/api/cloud/jobs/${encodeURIComponent(packet.job.id)}/dispatched`, {
    headers: bridgeHeaders(),
    json: { taskUrl },
    throwHttpErrors: false,
    timeout: 30_000,
  });
  if (!response.ok) process.stderr.write(`작업 URL 기록 실패(${response.status}): ${await response.text()}\n`);
}

async function reportSubmissionFailure(packet: CloudDispatchPacket, error: Error): Promise<void> {
  await ky.post(packet.callbackUrl, {
    headers: { Authorization: `Bearer ${packet.callbackToken}` },
    json: { ok: false, error: error.message.slice(0, 4_000) },
    throwHttpErrors: false,
    timeout: 30_000,
  });
}

async function main(): Promise<void> {
  let submitted = 0;
  while (submitted < dispatchLimit) {
    const packet = await claimProductionJob();
    if (!packet) break;
    try {
      const taskUrl = await submitCloudTask(buildCloudTaskPrompt(packet));
      await reportSubmission(packet, taskUrl);
      submitted += 1;
      process.stdout.write(`${packet.operation.id}\t${taskUrl}\n`);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await reportSubmissionFailure(packet, error);
      throw error;
    }
  }
  process.stdout.write(`submitted=${submitted}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
