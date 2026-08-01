import { NextResponse } from "next/server";
import { verifyAppLaunchSignature } from "@/lib/app-launch-auth";
import { createSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timestamp = Number(url.searchParams.get("ts"));
  const signature = url.searchParams.get("sig") ?? "";
  const secret = process.env["CLOUD_APP_LAUNCH_SECRET"] ?? "";
  if (!verifyAppLaunchSignature({ timestamp, signature, secret })) {
    return NextResponse.json({ error: "앱 실행 인증이 만료되었거나 올바르지 않습니다." }, { status: 401 });
  }
  await createSession();
  return NextResponse.redirect(new URL("/dashboard", url));
}
