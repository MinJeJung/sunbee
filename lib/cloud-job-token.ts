import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const tokenPartSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

function callbackSecret(): string {
  return z.string().min(32).parse(process.env["CLOUD_CALLBACK_SECRET"]);
}

function signature(payload: string): string {
  return createHmac("sha256", callbackSecret()).update(payload, "utf8").digest("base64url");
}

function sameValue(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export function createCloudJobToken(jobId: string, expiresAt: Date): string {
  const payload = Buffer.from(`${z.uuid().parse(jobId)}:${expiresAt.getTime()}`, "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyCloudJobToken(token: string, jobId: string, now = new Date()): boolean {
  const separator = token.indexOf(".");
  if (separator < 1 || separator !== token.lastIndexOf(".")) return false;
  const payload = tokenPartSchema.safeParse(token.slice(0, separator));
  const receivedSignature = tokenPartSchema.safeParse(token.slice(separator + 1));
  if (!payload.success || !receivedSignature.success || !sameValue(receivedSignature.data, signature(payload.data))) return false;
  const decoded = Buffer.from(payload.data, "base64url").toString("utf8");
  const delimiter = decoded.lastIndexOf(":");
  if (delimiter < 1) return false;
  const payloadJobId = z.uuid().safeParse(decoded.slice(0, delimiter));
  const expiresAt = z.coerce.number().int().positive().safeParse(decoded.slice(delimiter + 1));
  return payloadJobId.success && expiresAt.success && payloadJobId.data === jobId && now.getTime() <= expiresAt.data;
}
