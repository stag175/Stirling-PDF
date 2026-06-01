import { describe, it, expect } from "vitest";
import {
  CREDIT_COSTS,
  TOOL_CREDIT_COSTS,
  getToolCreditCost,
} from "@app/utils/creditCosts";
import { ToolId } from "@app/types/toolId";

describe("getToolCreditCost", () => {
  it("returns NONE (0) for free operations", () => {
    expect(getToolCreditCost("showJS")).toBe(CREDIT_COSTS.NONE);
    expect(getToolCreditCost("devApi")).toBe(0);
    expect(getToolCreditCost("devAirgapped")).toBe(CREDIT_COSTS.NONE);
  });

  it("returns SMALL (1) for small operations", () => {
    expect(getToolCreditCost("rotate")).toBe(CREDIT_COSTS.SMALL);
    expect(getToolCreditCost("removePages")).toBe(1);
    expect(getToolCreditCost("sign")).toBe(CREDIT_COSTS.SMALL);
    expect(getToolCreditCost("read")).toBe(CREDIT_COSTS.SMALL);
  });

  it("returns MEDIUM (3) for medium operations", () => {
    expect(getToolCreditCost("split")).toBe(CREDIT_COSTS.MEDIUM);
    expect(getToolCreditCost("merge")).toBe(3);
    expect(getToolCreditCost("redact")).toBe(CREDIT_COSTS.MEDIUM);
    // getPdfInfo is grouped under SMALL comments but mapped to MEDIUM.
    expect(getToolCreditCost("getPdfInfo")).toBe(CREDIT_COSTS.MEDIUM);
  });

  it("returns LARGE (5) for large operations", () => {
    expect(getToolCreditCost("compress")).toBe(CREDIT_COSTS.LARGE);
    expect(getToolCreditCost("convert")).toBe(5);
    expect(getToolCreditCost("ocr")).toBe(CREDIT_COSTS.LARGE);
    expect(getToolCreditCost("certSign")).toBe(CREDIT_COSTS.LARGE);
    expect(getToolCreditCost("timestampPdf")).toBe(CREDIT_COSTS.LARGE);
  });

  it("returns XLARGE (10) for the automate operation", () => {
    expect(getToolCreditCost("automate")).toBe(CREDIT_COSTS.XLARGE);
    expect(getToolCreditCost("automate")).toBe(10);
  });

  it("falls back to MEDIUM for tool ids missing from the map", () => {
    // Cast: deliberately probing the default branch with ids that are valid
    // ToolId values but intentionally absent from TOOL_CREDIT_COSTS.
    const unmappedId = "definitely-not-a-real-tool" as ToolId;
    expect(getToolCreditCost(unmappedId)).toBe(CREDIT_COSTS.MEDIUM);
    expect(getToolCreditCost(unmappedId)).toBe(3);
  });

  it("falls back to MEDIUM (3) rather than 0 for unknown ids", () => {
    // Guards against accidentally treating unknown tools as free.
    expect(getToolCreditCost("" as ToolId)).toBe(3);
    expect(getToolCreditCost("" as ToolId)).not.toBe(CREDIT_COSTS.NONE);
  });

  it("does NOT fall back when the mapped value is 0 (NONE)", () => {
    // 0 is falsy but a valid mapped cost; `??` must preserve it rather than
    // coalescing to the MEDIUM default.
    expect(getToolCreditCost("showJS")).toBe(0);
    expect(getToolCreditCost("showJS")).not.toBe(CREDIT_COSTS.MEDIUM);
  });

  it("returns the exact value stored in TOOL_CREDIT_COSTS for every mapped id", () => {
    const entries = Object.entries(TOOL_CREDIT_COSTS) as [ToolId, number][];
    expect(entries.length).toBeGreaterThan(0);
    for (const [toolId, expectedCost] of entries) {
      expect(getToolCreditCost(toolId)).toBe(expectedCost);
    }
  });

  it("only ever returns values drawn from the CREDIT_COSTS scale", () => {
    const allowed = new Set(Object.values(CREDIT_COSTS));
    const costs = Object.values(TOOL_CREDIT_COSTS);
    expect(costs.length).toBeGreaterThan(0);
    for (const cost of costs) {
      expect(
        allowed.has(cost as (typeof CREDIT_COSTS)[keyof typeof CREDIT_COSTS]),
      ).toBe(true);
    }
  });

  it("is a pure lookup with no side effects on the source map", () => {
    const before = { ...TOOL_CREDIT_COSTS };
    getToolCreditCost("rotate");
    getToolCreditCost("unknown-id" as ToolId);
    expect({ ...TOOL_CREDIT_COSTS }).toEqual(before);
  });
});
