import { describe, expect, it } from "vitest";
import { buildRevisionPromptContext, parseRevisionImageFiles, validateRevisionImageSignature } from "@/lib/revision-feedback";

describe("수정 요청 이미지 경계", () => {
  it("JPG·PNG·WebP 이미지를 최대 5장까지 받는다", () => {
    const givenFiles = [
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "표지.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "본문.png", { type: "image/png" }),
      new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "목차.webp", { type: "image/webp" }),
    ];

    const whenParsed = parseRevisionImageFiles(givenFiles);

    expect(whenParsed.map((file) => file.name)).toEqual(["표지.jpg", "본문.png", "목차.webp"]);
  });

  it("이미지가 아닌 첨부 파일은 거부한다", () => {
    const givenFiles = [new File(["원고"], "원고.txt", { type: "text/plain" })];

    expect(() => parseRevisionImageFiles(givenFiles)).toThrow("JPG, PNG, WebP 이미지만 첨부할 수 있습니다.");
  });

  it("확장자만 이미지인 위장 파일은 거부한다", async () => {
    const givenFile = new File(["실제 이미지가 아님"], "위장.png", { type: "image/png" });

    await expect(validateRevisionImageSignature(givenFile)).rejects.toThrow("이미지 파일이 손상되었거나 형식이 일치하지 않습니다.");
  });

  it("첨부 이미지를 Codex가 직접 열어 확인하도록 요청 문맥을 만든다", () => {
    const givenImagePaths = [
      { name: "목차 오류 표시.png", path: "/tmp/revision/first.png" },
      { name: "표지 수정.jpg", path: "/tmp/revision/second.jpg" },
    ];

    const whenContextBuilt = buildRevisionPromptContext("목차 링크와 표지 색상을 고쳐줘.", givenImagePaths);

    expect(whenContextBuilt).toContain("목차 링크와 표지 색상을 고쳐줘.");
    expect(whenContextBuilt).toContain("/tmp/revision/first.png");
    expect(whenContextBuilt).toContain("/tmp/revision/second.jpg");
    expect(whenContextBuilt).toContain("모든 첨부 이미지를 직접 열어");
  });
});
