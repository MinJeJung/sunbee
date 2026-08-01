import { describe, expect, it } from "vitest";
import { matrixToRecords, parseCsvText } from "@/lib/bulk-file";

describe("대량 파일 파서", () => {
  it("쉼표와 줄바꿈이 들어간 따옴표 셀을 보존한다", () => {
    const rows = parseCsvText('예상독자,책 제작 방향성,추천 목차 구성\r\n마케터,"콘텐츠, 광고 자동화","1장 문제\n2장 실행"');
    expect(rows[1]).toEqual(["마케터", "콘텐츠, 광고 자동화", "1장 문제\n2장 실행"]);
  });

  it("첫 행을 열 이름으로 사용해 빈 행을 제거한다", () => {
    const records = matrixToRecords([["예상독자", "책 제작 방향성"], ["마케터", "자동화"], ["", ""]]);
    expect(records).toEqual([{ 예상독자: "마케터", "책 제작 방향성": "자동화" }]);
  });
});
