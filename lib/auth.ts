import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { isLocalDashboardTrusted } from "@/lib/local-dashboard-auth";

const cookieName = "sol_ebook_session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function sessionSecret() {
  const value = process.env["SESSION_SECRET"];
  if (!value || value.length < 32) throw new Error("SESSION_SECRET 설정이 필요합니다.");
  return new TextEncoder().encode(value);
}

export function verifyPassword(password: string) {
  const expected = process.env["DASHBOARD_PASSWORD_HASH"] ?? hash(process.env["DASHBOARD_PASSWORD"] ?? "");
  const received = hash(password);
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function createSession() {
  const token = await new SignJWT({ role: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(sessionSecret());
  (await cookies()).set(cookieName, token, {
    httpOnly: true, secure: process.env["NODE_ENV"] === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30
  });
}

export async function isAuthenticated() {
  if (isLocalDashboardTrusted()) return true;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  try { return (await jwtVerify(token, sessionSecret())).payload["role"] === "owner"; }
  catch { return false; }
}

export async function destroySession() { (await cookies()).delete(cookieName); }
