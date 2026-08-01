import { describe, expect, it } from "vitest";
import { parseBulkRows } from "@/lib/bulk-intake";

describe("대량 도서 입력", () => {
  it("한국어 열 이름을 표준 입력으로 바꾸고 중복을 표시한다", () => {
    const result = parseBulkRows([
      { 예상독자: "마케터", "논문/유튜브 링크1": "https://arxiv.org/abs/2505.16120", "책 제작 방향성": "AI 마케팅 자동화", 추천목차구성: "1장 시작" },
      { 예상독자: "마케터", "논문/유튜브 링크1": "https://arxiv.org/abs/2505.16120", "책 제작 방향성": "AI 마케팅 자동화", 추천목차구성: "1장 시작" },
    ]);

    expect(result.rows[0]).toMatchObject({ targetReader: "마케터", problem: "AI 마케팅 자동화", desiredOutcome: "AI 마케팅 자동화", resources: ["https://arxiv.org/abs/2505.16120"] });
    expect(result.rows[1]?.errors).toContain("같은 파일 안의 중복 행입니다.");
    expect(result.validCount).toBe(1);
  });

  it("필수값과 URL을 행별로 검증한다", () => {
    const result = parseBulkRows([{ 예상독자: "", "논문/유튜브 링크1": "not-a-url", "책 제작 방향성": "짧음" }]);
    expect(result.rows[0]?.errors).toEqual(expect.arrayContaining(["예상독자를 입력해 주세요.", "유효한 URL만 입력해 주세요."]));
    expect(result.validCount).toBe(0);
  });
});
