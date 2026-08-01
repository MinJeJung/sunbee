import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBuildProgress } from "@/lib/build-progress";

describe("build progress reader", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sol-progress-test-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("returns the furthest stage with its label from a JSONL progress file", async () => {
    // Given
    await writeFile(path.join(directory, "op-1.jsonl"), [
      '{"stage":"research","percent":8,"note":"자료 32건 수집"}',
      '{"stage":"outline","percent":15,"note":"5장 25절 확정"}',
      '{"stage":"chapter2","percent":33}',
    ].join("\n"), "utf8");

    // When
    const progress = await readBuildProgress("op-1", directory);

    // Then
    expect(progress).toMatchObject({ percent: 33, label: "본문 집필 2/5" });
  });

  it("ignores malformed lines and caps percent below 100", async () => {
    // Given — 깨진 줄·범위 밖 percent가 섞여도 화면은 안전해야 한다
    await writeFile(path.join(directory, "op-2.jsonl"), [
      "not-json",
      '{"stage":"epub","percent":93}',
      '{"stage":"final_meta","percent":100}',
      '{"percent":50}',
    ].join("\n"), "utf8");

    // When
    const progress = await readBuildProgress("op-2", directory);

    // Then — 99로 클램프 (100%는 awaiting_review 상태가 담당)
    expect(progress).toMatchObject({ percent: 99, label: "메타·최종 검증" });
  });

  it("maps the beta_read stage to its label", async () => {
    // Given — 베타리딩 단계(epub 93과 final_meta 97 사이)
    await writeFile(path.join(directory, "op-3.jsonl"), [
      '{"stage":"epub","percent":93}',
      '{"stage":"beta_read","percent":95,"note":"별점 4.0"}',
    ].join("\n"), "utf8");

    // When
    const progress = await readBuildProgress("op-3", directory);

    // Then
    expect(progress).toMatchObject({ percent: 95, label: "베타리딩", note: "별점 4.0" });
  });

  it("returns null when no progress file exists", async () => {
    expect(await readBuildProgress("missing-op", directory)).toBeNull();
  });
});
