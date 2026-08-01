import { createHmac, timingSafeEqual } from "node:crypto";

const maximumLaunchAgeSeconds = 120;

export function createAppLaunchSignature(timestamp: number, secret: string): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new RangeError("앱 실행 시각이 올바르지 않습니다.");
  return createHmac("sha256", secret).update(String(timestamp)).digest("hex");
}

export function verifyAppLaunchSignature(input: {
  readonly timestamp: number;
  readonly signature: string;
  readonly secret: string;
  readonly nowSeconds?: number;
}): boolean {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (input.secret.length < 32 || !Number.isSafeInteger(input.timestamp)) return false;
  if (Math.abs(nowSeconds - input.timestamp) > maximumLaunchAgeSeconds) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expected = createAppLaunchSignature(input.timestamp, input.secret);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
}
