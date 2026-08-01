import "server-only";

import { timingSafeEqual } from "node:crypto";

function sameSecret(received: string, expected: string) {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export function bridgeIsConfigured() {
  return Boolean(process.env["CODEX_BRIDGE_TOKEN"]?.trim());
}

export function isBridgeAuthorized(request: Request) {
  const expected = process.env["CODEX_BRIDGE_TOKEN"]?.trim();
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return Boolean(match?.[1] && sameSecret(match[1], expected));
}
