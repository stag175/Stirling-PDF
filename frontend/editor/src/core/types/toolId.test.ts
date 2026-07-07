import { describe, expect, it } from "vitest";

import {
  isLinkToolId,
  isRegularToolId,
  isSuperToolId,
  isValidToolId,
  LINK_TOOL_IDS,
  REGULAR_TOOL_IDS,
  SUPER_TOOL_IDS,
  type ToolId,
  TOOL_IDS,
} from "@app/types/toolId";

describe("isValidToolId", () => {
  it("accepts every member of TOOL_IDS", () => {
    const invalid = TOOL_IDS.filter((id) => !isValidToolId(id));
    expect(invalid).toEqual([]);
  });

  it("rejects strings that are not tool ids", () => {
    expect(isValidToolId("__definitely_not_a_tool__")).toBe(false);
    expect(isValidToolId("")).toBe(false);
  });
});

describe("category guards classify each subset's members", () => {
  it("isRegularToolId is true exactly for REGULAR_TOOL_IDS", () => {
    for (const id of REGULAR_TOOL_IDS) {
      expect(isRegularToolId(id)).toBe(true);
      expect(isSuperToolId(id)).toBe(false);
      expect(isLinkToolId(id)).toBe(false);
    }
  });

  it("isSuperToolId is true exactly for SUPER_TOOL_IDS", () => {
    for (const id of SUPER_TOOL_IDS) {
      expect(isSuperToolId(id)).toBe(true);
      expect(isRegularToolId(id)).toBe(false);
      expect(isLinkToolId(id)).toBe(false);
    }
  });

  it("isLinkToolId is true exactly for LINK_TOOL_IDS", () => {
    for (const id of LINK_TOOL_IDS) {
      expect(isLinkToolId(id)).toBe(true);
      expect(isRegularToolId(id)).toBe(false);
      expect(isSuperToolId(id)).toBe(false);
    }
  });
});

describe("TOOL_IDS registry invariants", () => {
  it("has no duplicate ids", () => {
    expect(new Set<string>(TOOL_IDS).size).toBe(TOOL_IDS.length);
  });

  it("partitions into disjoint regular/super/link subsets", () => {
    const reg = new Set<string>(REGULAR_TOOL_IDS);
    const sup = new Set<string>(SUPER_TOOL_IDS);
    const lnk = new Set<string>(LINK_TOOL_IDS);
    expect([...sup].filter((x) => reg.has(x))).toEqual([]); // super ∩ regular
    expect([...lnk].filter((x) => reg.has(x))).toEqual([]); // link ∩ regular
    expect([...lnk].filter((x) => sup.has(x))).toEqual([]); // link ∩ super
  });

  it("classifies every TOOL_ID into exactly one category", () => {
    const misclassified = (TOOL_IDS as ToolId[]).filter((id) => {
      const inCount = [
        isRegularToolId(id),
        isSuperToolId(id),
        isLinkToolId(id),
      ].filter(Boolean).length;
      return inCount !== 1;
    });
    expect(misclassified).toEqual([]);
  });
});
