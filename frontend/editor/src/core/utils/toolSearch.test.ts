import { describe, it, expect } from "vitest";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";
import type { ToolRegistry, ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { ToolCategoryId, SubcategoryId } from "@app/data/toolsTaxonomy";

// Minimal builder for a ToolRegistryEntry. The module under test only ever
// reads `name` and `synonyms`, but the type requires several other fields, so
// we fill sane defaults and let callers override.
function makeEntry(overrides: Partial<ToolRegistryEntry>): ToolRegistryEntry {
  return {
    icon: null,
    name: "",
    component: null,
    description: "",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    ...overrides,
  };
}

// A registry is a partial map of ToolId -> entry. We use real-looking ToolId
// keys; the function treats keys opaquely as strings for dedupe purposes.
function makeRegistry(
  entries: Record<string, ToolRegistryEntry>,
): Partial<ToolRegistry> {
  return entries as Partial<ToolRegistry>;
}

// Convenience extractor for the ordered list of tool ids.
function ids(results: ReturnType<typeof filterToolRegistryByQuery>): string[] {
  return results.map((r) => r.item[0]);
}

describe("filterToolRegistryByQuery", () => {
  describe("empty / whitespace query", () => {
    it("returns every entry unchanged with no matchedText", () => {
      const registry = makeRegistry({
        merge: makeEntry({ name: "Merge" }),
        split: makeEntry({ name: "Split" }),
      });

      const results = filterToolRegistryByQuery(registry, "");

      expect(ids(results)).toEqual(["merge", "split"]);
      expect(results.every((r) => r.matchedText === undefined)).toBe(true);
      // Each result preserves the original [id, entry] tuple.
      expect(results[0].item[1].name).toBe("Merge");
    });

    it("treats a whitespace-only query as empty", () => {
      const registry = makeRegistry({
        merge: makeEntry({ name: "Merge" }),
      });

      const results = filterToolRegistryByQuery(registry, "   \t  ");

      expect(ids(results)).toEqual(["merge"]);
      expect(results[0].matchedText).toBeUndefined();
    });

    it("returns an empty array for an empty registry and empty query", () => {
      expect(filterToolRegistryByQuery(makeRegistry({}), "")).toEqual([]);
    });
  });

  describe("exact name matches", () => {
    it("places exact-name matches first and records the name as matchedText", () => {
      const registry = makeRegistry({
        addPassword: makeEntry({ name: "Add Password" }),
        removePassword: makeEntry({ name: "Remove Password" }),
      });

      // "password" is a substring of both normalized names.
      const results = filterToolRegistryByQuery(registry, "password");

      expect(ids(results)).toEqual(["addPassword", "removePassword"]);
      expect(results[0].matchedText).toBe("Add Password");
      expect(results[1].matchedText).toBe("Remove Password");
    });

    it("sorts exact-name matches by substring position, then by name length", () => {
      const registry = makeRegistry({
        // "add" at pos 0
        addText: makeEntry({ name: "Add Text" }),
        // "add" at pos 6 ("Quick Add")
        quickAdd: makeEntry({ name: "Quick Add" }),
        // "add" at pos 0 but longer name than "Add Text"
        addStamp: makeEntry({ name: "Add Stamp Tool" }),
      });

      const results = filterToolRegistryByQuery(registry, "add");

      // pos 0 entries first, tie broken by shorter name length;
      // pos 6 entry ("Quick Add") last.
      expect(ids(results)).toEqual(["addText", "addStamp", "quickAdd"]);
    });

    it("is diacritics-insensitive for the query and the name", () => {
      const registry = makeRegistry({
        cafe: makeEntry({ name: "Le Café" }),
      });

      const results = filterToolRegistryByQuery(registry, "Café");

      expect(ids(results)).toEqual(["cafe"]);
      expect(results[0].matchedText).toBe("Le Café");
    });

    it("tolerates a missing name (treated as empty string)", () => {
      const registry = makeRegistry({
        // name omitted -> defaults to "" via builder, so it cannot match
        named: makeEntry({ name: "Rotate" }),
        unnamed: makeEntry({ name: "" }),
      });

      const results = filterToolRegistryByQuery(registry, "rotate");

      expect(ids(results)).toEqual(["named"]);
    });
  });

  describe("exact synonym matches", () => {
    it("falls back to exact synonym matches when the name does not match", () => {
      const registry = makeRegistry({
        compress: makeEntry({
          name: "Compress",
          synonyms: ["shrink", "reduce size"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "shrink");

      expect(ids(results)).toEqual(["compress"]);
      expect(results[0].matchedText).toBe("shrink");
    });

    it("ranks exact-name matches above exact-synonym matches", () => {
      const registry = makeRegistry({
        // matches only via synonym
        viaSynonym: makeEntry({
          name: "Compress",
          synonyms: ["make smaller"],
        }),
        // matches via name directly
        viaName: makeEntry({ name: "Make Smaller Pages" }),
      });

      const results = filterToolRegistryByQuery(registry, "make smaller");

      expect(ids(results)).toEqual(["viaName", "viaSynonym"]);
      expect(results[0].matchedText).toBe("Make Smaller Pages");
      expect(results[1].matchedText).toBe("make smaller");
    });

    it("uses the first matching synonym and stops scanning", () => {
      const registry = makeRegistry({
        tool: makeEntry({
          name: "Some Tool",
          synonyms: ["alpha keyword", "beta keyword"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "keyword");

      // Both synonyms contain "keyword"; the first is recorded.
      expect(results[0].matchedText).toBe("alpha keyword");
    });

    it("sorts exact-synonym matches by position then text length", () => {
      const registry = makeRegistry({
        early: makeEntry({ name: "A", synonyms: ["zip files"] }), // pos 0
        late: makeEntry({ name: "B", synonyms: ["unzip"] }), // pos 2
        earlyLong: makeEntry({ name: "C", synonyms: ["zip everything now"] }), // pos 0, longer
      });

      const results = filterToolRegistryByQuery(registry, "zip");

      // pos 0 first, shorter text wins the tie; pos 2 entry last.
      expect(ids(results)).toEqual(["early", "earlyLong", "late"]);
    });

    it("ignores a non-array synonyms value without throwing", () => {
      const registry = makeRegistry({
        weird: makeEntry({
          name: "Weird",
          // intentionally malformed: not an array
          synonyms: undefined,
        }),
        good: makeEntry({ name: "Weird Sibling" }),
      });

      const results = filterToolRegistryByQuery(registry, "weird");

      // Both match by name; just assert no throw and both present.
      expect(ids(results).sort()).toEqual(["good", "weird"]);
    });
  });

  describe("fuzzy name matches", () => {
    it("includes near-miss name matches above the threshold, sorted by score", () => {
      const registry = makeRegistry({
        // "aple" -> "Apple" scores 48 (>= threshold 30 for len-4 query)
        apple: makeEntry({ name: "Apple" }),
        // "aple" -> "Maple" : substring? normalized "maple" includes "aple"? no.
        // token "maple" includes "aple"? no. Levenshtein("aple","maple") = 1,
        // maxLen 5 => floor((1-1/5)*60) = 48 as well, but tie order is stable.
        maple: makeEntry({ name: "Maple" }),
        // unrelated, should be filtered out
        zzz: makeEntry({ name: "Zzz" }),
      });

      const results = filterToolRegistryByQuery(registry, "aple");

      const got = ids(results);
      expect(got).toContain("apple");
      expect(got).toContain("maple");
      expect(got).not.toContain("zzz");
      // matchedText for a fuzzy-name hit is the tool name.
      const appleResult = results.find(
        (r) => (r.item[0] as string) === "apple",
      );
      expect(appleResult?.matchedText).toBe("Apple");
    });

    it("falls back to returning everything when no entry clears the threshold", () => {
      const registry = makeRegistry({
        merge: makeEntry({ name: "Merge" }),
        split: makeEntry({ name: "Split" }),
      });

      // A query with no substring or fuzzy overlap with any name/synonym.
      const results = filterToolRegistryByQuery(registry, "qqqqqqqqzzzzzzzz");

      // Fallback path: all entries returned, no matchedText.
      expect(ids(results)).toEqual(["merge", "split"]);
      expect(results.every((r) => r.matchedText === undefined)).toBe(true);
    });
  });

  describe("fuzzy synonym matches", () => {
    it("includes fuzzy synonym matches when name does not match", () => {
      const registry = makeRegistry({
        tool: makeEntry({
          name: "Totally Different",
          // "passwrd" (len 7, threshold 25) fuzzy-matches "password"
          synonyms: ["password"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "passwrd");

      expect(ids(results)).toEqual(["tool"]);
      // matchedText for a fuzzy-synonym hit is the best synonym text.
      expect(results[0].matchedText).toBe("password");
    });

    it("keeps the highest-scoring synonym across multiple candidates", () => {
      const registry = makeRegistry({
        tool: makeEntry({
          name: "Totally Different",
          // "compres" should score higher against "compress" than "shrnk"
          // against "shrink"; the better synonym is recorded.
          synonyms: ["shrink", "compress"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "compres");

      expect(results[0].matchedText).toBe("compress");
    });

    it("ranks fuzzy-name results above fuzzy-synonym results", () => {
      const registry = makeRegistry({
        // matches only via a fuzzy synonym
        synOnly: makeEntry({
          name: "Totally Different",
          synonyms: ["compress"],
        }),
        // matches via a fuzzy name
        nameOnly: makeEntry({
          name: "Compress",
        }),
      });

      const results = filterToolRegistryByQuery(registry, "compres");

      // fuzzyName bucket is concatenated before fuzzySyn.
      expect(ids(results)).toEqual(["nameOnly", "synOnly"]);
    });
  });

  describe("bucket ordering and de-duplication", () => {
    it("orders buckets exactName > exactSyn > fuzzyName > fuzzySyn", () => {
      const registry = makeRegistry({
        // exact name: "compress" substring of "Compress Files"
        exactNameTool: makeEntry({ name: "Compress Files" }),
        // exact synonym: name has no "compress", synonym does
        exactSynTool: makeEntry({
          name: "Shrink",
          synonyms: ["compress"],
        }),
        // fuzzy name: "Compres" without trailing s won't substring-match
        // "compress"? "compres" IS a substring of "compress"... so use a typo
        // that is not a substring: "Comprezz" -> fuzzy only.
        fuzzyNameTool: makeEntry({ name: "Comprezz" }),
        // fuzzy synonym only
        fuzzySynTool: makeEntry({
          name: "Nothing Alike",
          synonyms: ["comprezz"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "compress");

      expect(ids(results)).toEqual([
        "exactNameTool",
        "exactSynTool",
        "fuzzyNameTool",
        "fuzzySynTool",
      ]);
    });

    it("de-duplicates a tool that qualifies for multiple buckets", () => {
      // A single tool whose name AND synonym both match: it must appear once,
      // taken from the earliest bucket (exact name).
      const registry = makeRegistry({
        compress: makeEntry({
          name: "Compress",
          synonyms: ["compress"],
        }),
      });

      const results = filterToolRegistryByQuery(registry, "compress");

      expect(ids(results)).toEqual(["compress"]);
      expect(results).toHaveLength(1);
      // Recorded from the exact-name bucket.
      expect(results[0].matchedText).toBe("Compress");
    });
  });
});
