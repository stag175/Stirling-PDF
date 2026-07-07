/**
 * Unit tests for file history / lineage utility functions.
 *
 * groupFilesByOriginal performs pure graph traversal over plain stub objects
 * (no I/O), so no external dependencies need mocking.
 */

import { describe, test, expect } from "vitest";
import {
  groupFilesByOriginal,
  hasVersionHistory,
} from "@app/utils/fileHistoryUtils";
import type { StirlingFileStub } from "@app/types/fileContext";

/**
 * Build a minimal StirlingFileStub for lineage tests. Only the fields read by
 * groupFilesByOriginal (id, parentFileId, originalFileId, versionNumber) matter;
 * the rest are filled with deterministic placeholders and cast to the type.
 */
type StubOverrides = Partial<
  Omit<StirlingFileStub, "id" | "parentFileId" | "originalFileId">
> & { id: string; parentFileId?: string; originalFileId?: string };

function makeStub(overrides: StubOverrides): StirlingFileStub {
  return {
    name: `${overrides.id}.pdf`,
    type: "application/pdf",
    size: 100,
    lastModified: 0,
    isLeaf: false,
    originalFileId: overrides.id,
    versionNumber: 0,
    ...overrides,
  } as unknown as StirlingFileStub;
}

/** Convenience to read the lineage ids for a given leaf key. */
function ids(groups: Map<string, StirlingFileStub[]>, key: string): string[] {
  return (groups.get(key) ?? []).map((s) => s.id);
}

describe("fileHistoryUtils", () => {
  describe("groupFilesByOriginal", () => {
    test("returns an empty map for an empty input array", () => {
      const groups = groupFilesByOriginal([]);
      expect(groups.size).toBe(0);
    });

    test("excludes a lone v0 file that lists itself as its own originalFileId", () => {
      // Quirk of the implementation: the `originalFileId === stub.id` self-match
      // makes isOriginalOfOthers true, so a v0 self-original file is NOT a leaf.
      const original = makeStub({
        id: "a",
        originalFileId: "a",
        versionNumber: 0,
      });

      const groups = groupFilesByOriginal([original]);

      expect(groups.size).toBe(0);
    });

    test("includes a lone v0 file whose originalFileId points elsewhere (no self-match)", () => {
      // originalFileId differs from id → not referenced as an original by others,
      // so the file qualifies as a leaf even at version 0.
      const original = makeStub({
        id: "a",
        originalFileId: "root",
        versionNumber: 0,
      });

      const groups = groupFilesByOriginal([original]);

      expect(Array.from(groups.keys())).toEqual(["a"]);
      // originalFileId "root" is absent from the set, so the chain stops at a.
      expect(ids(groups, "a")).toEqual(["a"]);
    });

    test("builds a linear v0 -> v1 -> v2 lineage keyed by the leaf, newest first", () => {
      const v0 = makeStub({ id: "a", originalFileId: "a", versionNumber: 0 });
      const v1 = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const v2 = makeStub({
        id: "c",
        originalFileId: "a",
        versionNumber: 2,
        parentFileId: "b" as StirlingFileStub["parentFileId"],
      });

      const groups = groupFilesByOriginal([v0, v1, v2]);

      // Only the leaf (c) produces a group; a and b are parents of others.
      expect(Array.from(groups.keys())).toEqual(["c"]);
      // Sorted newest version first back to the original.
      expect(ids(groups, "c")).toEqual(["c", "b", "a"]);
    });

    test("input order does not affect the resulting lineage (deterministic sort)", () => {
      const v0 = makeStub({ id: "a", originalFileId: "a", versionNumber: 0 });
      const v1 = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const v2 = makeStub({
        id: "c",
        originalFileId: "a",
        versionNumber: 2,
        parentFileId: "b" as StirlingFileStub["parentFileId"],
      });

      const forward = groupFilesByOriginal([v0, v1, v2]);
      const shuffled = groupFilesByOriginal([v2, v0, v1]);

      expect(ids(shuffled, "c")).toEqual(ids(forward, "c"));
      expect(ids(shuffled, "c")).toEqual(["c", "b", "a"]);
    });

    test("produces a separate branch group per leaf when a parent has two children", () => {
      const root = makeStub({ id: "a", originalFileId: "a", versionNumber: 0 });
      const branch1 = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const branch2 = makeStub({
        id: "c",
        originalFileId: "a",
        versionNumber: 1,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });

      const groups = groupFilesByOriginal([root, branch1, branch2]);

      // Two leaves (b and c); a is a parent so not a leaf.
      expect(new Set(groups.keys())).toEqual(new Set(["b", "c"]));
      expect(ids(groups, "b")).toEqual(["b", "a"]);
      expect(ids(groups, "c")).toEqual(["c", "a"]);
    });

    test("follows originalFileId when no parentFileId is present (v1 referencing root)", () => {
      const root = makeStub({ id: "a", originalFileId: "a", versionNumber: 0 });
      // v1 with no parentFileId but originalFileId pointing back to the root.
      const v1 = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
      });

      const groups = groupFilesByOriginal([root, v1]);

      // root is referenced as originalFileId by b and has no version history,
      // so it is NOT a leaf; only b is.
      expect(Array.from(groups.keys())).toEqual(["b"]);
      expect(ids(groups, "b")).toEqual(["b", "a"]);
    });

    test("keeps original as a leaf when it has version history but no descendants", () => {
      // versionNumber > 0 forces leaf status even though nothing references it.
      const standalone = makeStub({
        id: "x",
        originalFileId: "root",
        versionNumber: 3,
      });

      const groups = groupFilesByOriginal([standalone]);

      expect(Array.from(groups.keys())).toEqual(["x"]);
      // originalFileId "root" is not present in fileMap, so the chain stops at x.
      expect(ids(groups, "x")).toEqual(["x"]);
    });

    test("stops the lineage when a referenced parentFileId is missing from the set", () => {
      const orphan = makeStub({
        id: "child",
        originalFileId: "missing",
        versionNumber: 2,
        parentFileId: "ghost" as StirlingFileStub["parentFileId"],
      });

      const groups = groupFilesByOriginal([orphan]);

      expect(ids(groups, "child")).toEqual(["child"]);
    });

    test("does not follow originalFileId when it points to the file's own id", () => {
      // Self-referential originalFileId === id must not cause a self lookup loop.
      const selfRef = makeStub({
        id: "self",
        originalFileId: "self",
        versionNumber: 1,
      });

      const groups = groupFilesByOriginal([selfRef]);

      expect(ids(groups, "self")).toEqual(["self"]);
    });

    test("breaks the lineage when a leaf traces back into a 2-node parent cycle (a <-> b)", () => {
      // a and b reference each other as parents (a cycle among ancestors).
      // leaf traces back into that cycle; the guard must stop the traversal.
      const a = makeStub({
        id: "a",
        originalFileId: "root",
        versionNumber: 1,
        parentFileId: "b" as StirlingFileStub["parentFileId"],
      });
      const b = makeStub({
        id: "b",
        originalFileId: "root",
        versionNumber: 2,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const leaf = makeStub({
        id: "leaf",
        originalFileId: "root",
        versionNumber: 3,
        parentFileId: "b" as StirlingFileStub["parentFileId"],
      });

      // Only `leaf` is parent-of-nothing → the sole leaf. a and b are both parents.
      const groups = groupFilesByOriginal([a, b, leaf]);

      expect(Array.from(groups.keys())).toEqual(["leaf"]);
      // leaf -> b -> a -> (b again, guarded). Each node appears exactly once.
      const lineage = ids(groups, "leaf");
      expect(new Set(lineage).size).toBe(lineage.length);
      expect(new Set(lineage)).toEqual(new Set(["leaf", "a", "b"]));
      // Sorted by descending versionNumber: leaf(3), b(2), a(1).
      expect(lineage).toEqual(["leaf", "b", "a"]);
    });

    test("handles a leaf tracing into a 3-node ancestor cycle without infinite recursion", () => {
      // a -> c -> b -> a forms a cycle; leaf hangs off c.
      const a = makeStub({
        id: "a",
        originalFileId: "root",
        versionNumber: 1,
        parentFileId: "c" as StirlingFileStub["parentFileId"],
      });
      const b = makeStub({
        id: "b",
        originalFileId: "root",
        versionNumber: 2,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const c = makeStub({
        id: "c",
        originalFileId: "root",
        versionNumber: 3,
        parentFileId: "b" as StirlingFileStub["parentFileId"],
      });
      const leaf = makeStub({
        id: "leaf",
        originalFileId: "root",
        versionNumber: 4,
        parentFileId: "c" as StirlingFileStub["parentFileId"],
      });

      const groups = groupFilesByOriginal([a, b, c, leaf]);

      // a, b, c are each a parent of another → not leaves. Only `leaf` is.
      expect(Array.from(groups.keys())).toEqual(["leaf"]);
      const lineage = ids(groups, "leaf");
      // Every reachable node appears exactly once (no infinite recursion / repeats).
      expect(new Set(lineage).size).toBe(lineage.length);
      expect(new Set(lineage)).toEqual(new Set(["leaf", "a", "b", "c"]));
      // Sorted by descending versionNumber.
      expect(lineage).toEqual(["leaf", "c", "b", "a"]);
    });

    test("treats undefined/missing versionNumber as 0 during the descending sort", () => {
      // Two-node chain where versionNumber is intentionally undefined.
      const root = makeStub({ id: "a", originalFileId: "a" });
      delete (root as { versionNumber?: number }).versionNumber;
      const child = makeStub({
        id: "b",
        originalFileId: "a",
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      delete (child as { versionNumber?: number }).versionNumber;

      const groups = groupFilesByOriginal([root, child]);

      // Root is parent-of-others (b) → not a leaf. Root is also referenced as
      // originalFileId by b and has no versionNumber, so it is excluded. Only b
      // qualifies because it is not a parent of anything and is not referenced as
      // an original by others.
      expect(Array.from(groups.keys())).toEqual(["b"]);
      // (0,0) sort is stable: lineage retains push order b, a.
      expect(ids(groups, "b")).toEqual(["b", "a"]);
    });

    test("isolates two independent leaf files into two separate groups", () => {
      // Distinct originalFileIds that differ from each id avoid the self-match
      // exclusion, so both qualify as independent leaves.
      const fileA = makeStub({
        id: "a",
        originalFileId: "ra",
        versionNumber: 0,
      });
      const fileB = makeStub({
        id: "b",
        originalFileId: "rb",
        versionNumber: 0,
      });

      const groups = groupFilesByOriginal([fileA, fileB]);

      expect(new Set(groups.keys())).toEqual(new Set(["a", "b"]));
      expect(ids(groups, "a")).toEqual(["a"]);
      expect(ids(groups, "b")).toEqual(["b"]);
    });

    test("does not mutate the input array (no in-place sorting of the source)", () => {
      const v0 = makeStub({ id: "a", originalFileId: "a", versionNumber: 0 });
      const v1 = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
        parentFileId: "a" as StirlingFileStub["parentFileId"],
      });
      const input = [v0, v1];

      groupFilesByOriginal(input);

      // The original array ordering is preserved.
      expect(input.map((s) => s.id)).toEqual(["a", "b"]);
    });
  });

  describe("hasVersionHistory", () => {
    test("returns true when originalFileId is set and versionNumber > 0", () => {
      const stub = makeStub({
        id: "b",
        originalFileId: "a",
        versionNumber: 1,
      });
      expect(hasVersionHistory(stub)).toBe(true);
    });

    test("returns false for an original v0 file", () => {
      const stub = makeStub({
        id: "a",
        originalFileId: "a",
        versionNumber: 0,
      });
      expect(hasVersionHistory(stub)).toBe(false);
    });

    test("returns false when versionNumber is missing even if originalFileId is set", () => {
      const stub = makeStub({ id: "b", originalFileId: "a" });
      delete (stub as { versionNumber?: number }).versionNumber;
      expect(hasVersionHistory(stub)).toBe(false);
    });

    test("returns false when originalFileId is empty even with a positive versionNumber", () => {
      const stub = makeStub({
        id: "b",
        originalFileId: "",
        versionNumber: 2,
      });
      expect(hasVersionHistory(stub)).toBe(false);
    });

    test("returns a strict boolean (not a truthy/falsy value)", () => {
      const stub = makeStub({ id: "b", originalFileId: "a", versionNumber: 5 });
      expect(hasVersionHistory(stub)).toStrictEqual(true);
    });
  });
});
