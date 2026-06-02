import { describe, expect, it } from "vitest";

import {
  BASE_WORKBENCH_TYPES,
  getDefaultWorkbench,
  isBaseWorkbench,
  isValidWorkbench,
} from "@app/types/workbench";

describe("getDefaultWorkbench", () => {
  it("is 'viewer', which is itself a valid base workbench", () => {
    expect(getDefaultWorkbench()).toBe("viewer");
    expect(isValidWorkbench(getDefaultWorkbench())).toBe(true);
    expect(isBaseWorkbench(getDefaultWorkbench())).toBe(true);
  });
});

describe("isValidWorkbench", () => {
  it("accepts every base workbench type", () => {
    for (const type of BASE_WORKBENCH_TYPES) {
      expect(isValidWorkbench(type)).toBe(true);
    }
  });

  it("accepts any 'custom:' prefixed view (including an empty suffix)", () => {
    expect(isValidWorkbench("custom:my-view")).toBe(true);
    expect(isValidWorkbench("custom:")).toBe(true);
  });

  it("rejects unknown values and a bare 'custom' without the colon", () => {
    expect(isValidWorkbench("custom")).toBe(false); // no colon
    expect(isValidWorkbench("viewerx")).toBe(false);
    expect(isValidWorkbench("")).toBe(false);
  });
});

describe("isBaseWorkbench", () => {
  it("is true for base types and false for custom views", () => {
    for (const type of BASE_WORKBENCH_TYPES) {
      expect(isBaseWorkbench(type)).toBe(true);
    }
    expect(isBaseWorkbench("custom:my-view")).toBe(false);
  });
});
