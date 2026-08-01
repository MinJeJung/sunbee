import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("email result schema", () => {
  it("requires every property for strict structured output", async () => {
    const schema = JSON.parse(await readFile(path.join(import.meta.dirname, "schemas", "email-result.json"), "utf8")) as {
      required: string[];
      properties: Record<string, unknown>;
    };

    expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties)));
  });
});
