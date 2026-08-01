import { describe, expect, it } from "vitest";
import { enqueueTopic } from "@/lib/topic-intake";
import { emptyState } from "@/lib/types";

describe("enqueueTopic", () => {
  it("Hermes 주제를 인사이트 작업과 함께 등록한다", () => {
    const ids = ["operation-id", "job-id"];
    const result = enqueueTopic(emptyState(), {
      direction: "Hermes로 전자책 제작 자동화",
      resources: ["https://example.com/reference"],
      source: "hermes",
      externalRequestId: "hermes:test:1",
    }, "2026-07-19T12:00:00.000Z", () => ids.shift() ?? "unexpected");

    expect(result.created).toBe(true);
    expect(result.operation).toMatchObject({
      id: "operation-id",
      source: "hermes",
      externalRequestId: "hermes:test:1",
      status: "insight_queued",
    });
    expect(result.job).toMatchObject({ id: "job-id", operationId: "operation-id", type: "topic_insight", status: "queued" });
  });

  it("같은 Hermes 요청 ID를 재전송해도 중복 생성하지 않는다", () => {
    const first = enqueueTopic(emptyState(), {
      direction: "중복 방지 주제",
      resources: [],
      source: "hermes",
      externalRequestId: "hermes:test:duplicate",
    }, "2026-07-19T12:00:00.000Z", () => crypto.randomUUID());
    const second = enqueueTopic(first.state, {
      direction: "중복 방지 주제",
      resources: [],
      source: "hermes",
      externalRequestId: "hermes:test:duplicate",
    }, "2026-07-19T12:01:00.000Z", () => crypto.randomUUID());

    expect(second.created).toBe(false);
    expect(second.operation.id).toBe(first.operation.id);
    expect(second.state.operations).toHaveLength(1);
    expect(second.state.jobs).toHaveLength(1);
  });
});
