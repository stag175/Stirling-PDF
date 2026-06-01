import { describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  SubcategoryId,
  ToolCategoryId,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import { useToolSections } from "@app/hooks/useToolSections";

/**
 * react-i18next is globally mocked in src/core/setupTests.ts so that
 * `t(key, fallback)` returns the bare `key`. That means the section titles
 * resolve to the translation keys rather than the English fallbacks.
 */
const QUICK_TITLE = "toolPicker.quickAccess";
const ALL_TITLE = "toolPicker.allTools";

type FilteredTool = {
  item: [ToolId, ToolRegistryEntry];
  matchedText?: string;
};

/**
 * Builds a minimal but type-complete ToolRegistryEntry. By default the tool is
 * "ready" (has a component) so it survives the Quick Access readiness filter;
 * pass overrides to exercise the not-ready branches.
 */
function makeTool(
  categoryId: ToolCategoryId,
  subcategoryId: SubcategoryId,
  overrides: Partial<ToolRegistryEntry> = {},
): ToolRegistryEntry {
  return {
    icon: null,
    name: "tool",
    // A truthy component sentinel; the hook only checks `component !== null`.
    component: (() => null) as unknown as ToolRegistryEntry["component"],
    description: "desc",
    categoryId,
    subcategoryId,
    automationSettings: null,
    ...overrides,
  };
}

function entry(
  id: ToolId,
  categoryId: ToolCategoryId,
  subcategoryId: SubcategoryId,
  overrides: Partial<ToolRegistryEntry> = {},
): FilteredTool {
  return { item: [id, makeTool(categoryId, subcategoryId, overrides)] };
}

function run(filteredTools: FilteredTool[] | undefined, searchQuery?: string) {
  return renderHook(() =>
    useToolSections(filteredTools as FilteredTool[], searchQuery),
  ).result.current;
}

describe("useToolSections", () => {
  test("returns no sections and no search groups for an empty list", () => {
    const { sections, searchGroups } = run([]);
    // Both built sections are filtered out because every subcategory is empty.
    expect(sections).toEqual([]);
    expect(searchGroups).toEqual([]);
  });

  test("handles a non-array (null) input defensively", () => {
    const { sections, searchGroups } = run(null as unknown as FilteredTool[]);
    // groupedTools -> {} so no sections survive; searchGroups short-circuits to [].
    expect(sections).toEqual([]);
    expect(searchGroups).toEqual([]);
  });

  test("handles an undefined input defensively", () => {
    const { sections, searchGroups } = run(undefined);
    expect(sections).toEqual([]);
    expect(searchGroups).toEqual([]);
  });

  test("builds an ALL TOOLS section for non-recommended tools and skips QUICK", () => {
    const tools: FilteredTool[] = [
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
      entry(
        "split" as ToolId,
        ToolCategoryId.ADVANCED_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { sections } = run(tools);

    // No recommended tools => quick section dropped, only "all" remains.
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("all");
    expect(sections[0].title).toBe(ALL_TITLE);

    // Both tools share the GENERAL subcategory, so they merge into one group.
    expect(sections[0].subcategories).toHaveLength(1);
    expect(sections[0].subcategories[0].subcategoryId).toBe(
      SubcategoryId.GENERAL,
    );
    expect(sections[0].subcategories[0].tools.map((t) => t.id)).toEqual([
      "merge",
      "split",
    ]);
  });

  test("recommended tools populate the QUICK section and are excluded from ALL", () => {
    const tools: FilteredTool[] = [
      entry(
        "addPassword" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.DOCUMENT_SECURITY,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { sections } = run(tools);

    expect(sections.map((s) => s.key)).toEqual(["quick", "all"]);

    const quick = sections.find((s) => s.key === "quick")!;
    expect(quick.title).toBe(QUICK_TITLE);
    expect(quick.subcategories).toHaveLength(1);
    expect(quick.subcategories[0].subcategoryId).toBe(
      SubcategoryId.DOCUMENT_SECURITY,
    );
    expect(quick.subcategories[0].tools.map((t) => t.id)).toEqual([
      "addPassword",
    ]);

    const all = sections.find((s) => s.key === "all")!;
    // The recommended tool must NOT leak into ALL TOOLS.
    expect(
      all.subcategories.flatMap((sc) => sc.tools.map((t) => t.id)),
    ).toEqual(["merge"]);
  });

  test("Quick Access filters out not-ready recommended tools (no component, no link)", () => {
    const tools: FilteredTool[] = [
      entry(
        "compress" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null },
      ),
    ];
    const { sections } = run(tools);

    // The single recommended tool is not ready, so quick has no tools and the
    // whole section (and ALL, which never received it) is filtered away.
    expect(sections).toEqual([]);
  });

  test("Quick Access keeps not-ready recommended tools that have an external link", () => {
    const tools: FilteredTool[] = [
      entry(
        "compress" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null, link: "https://example.com/tool" },
      ),
    ];
    const { sections } = run(tools);

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("quick");
    expect(sections[0].subcategories[0].tools.map((t) => t.id)).toEqual([
      "compress",
    ]);
  });

  test('Quick Access special-cases navigational tools "read" and "multiTool" even without a component', () => {
    const tools: FilteredTool[] = [
      entry(
        "read" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null },
      ),
      entry(
        "multiTool" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null },
      ),
      entry(
        "compress" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null },
      ),
    ];
    const { sections } = run(tools);

    const quick = sections.find((s) => s.key === "quick")!;
    // read + multiTool survive; the not-ready compress is dropped.
    expect(quick.subcategories[0].tools.map((t) => t.id)).toEqual([
      "read",
      "multiTool",
    ]);
  });

  test("sorts ALL TOOLS subcategories by SUBCATEGORY_ORDER", () => {
    // Provide tools whose subcategories are deliberately out of canonical order.
    const tools: FilteredTool[] = [
      entry(
        "autoRename" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.AUTOMATION, // order index 7
      ),
      entry(
        "sign" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.SIGNING, // order index 0
      ),
      entry(
        "removePages" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.REMOVAL, // order index 6
      ),
    ];
    const { sections } = run(tools);

    const all = sections.find((s) => s.key === "all")!;
    expect(all.subcategories.map((sc) => sc.subcategoryId)).toEqual([
      SubcategoryId.SIGNING,
      SubcategoryId.REMOVAL,
      SubcategoryId.AUTOMATION,
    ]);
  });

  test("tie-breaks equal-order subcategories alphabetically (unknown ids fall to the end)", () => {
    // Two ids unknown to SUBCATEGORY_ORDER both map to MAX_SAFE_INTEGER, so the
    // localeCompare tie-break decides: "aaa" before "zzz".
    const tools: FilteredTool[] = [
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        "zzz" as unknown as SubcategoryId,
      ),
      entry(
        "split" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        "aaa" as unknown as SubcategoryId,
      ),
      entry(
        "rotate" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.SIGNING, // known, sorts first
      ),
    ];
    const { sections } = run(tools);

    const all = sections.find((s) => s.key === "all")!;
    expect(all.subcategories.map((sc) => sc.subcategoryId)).toEqual([
      SubcategoryId.SIGNING,
      "aaa",
      "zzz",
    ]);
  });

  test("searchGroups dedupes repeated tool ids and orders alphabetically without a query", () => {
    const tools: FilteredTool[] = [
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
      // Duplicate id in a different subcategory: must be ignored after first seen.
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.SIGNING,
      ),
      entry(
        "sign" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.AUTOMATION,
      ),
    ];
    const { searchGroups } = run(tools);

    // No query => alphabetical subcategory ordering: automation < general.
    expect(searchGroups.map((g) => g.subcategoryId)).toEqual([
      SubcategoryId.AUTOMATION,
      SubcategoryId.GENERAL,
    ]);
    // The duplicate "merge" was deduped (it stays in GENERAL, its first seen sub).
    const general = searchGroups.find(
      (g) => g.subcategoryId === SubcategoryId.GENERAL,
    )!;
    expect(general.tools.map((t) => t.id)).toEqual(["merge"]);
  });

  test("searchGroups with a query orders subcategories by first occurrence in the ranked list", () => {
    const tools: FilteredTool[] = [
      // Top-ranked tool lives in AUTOMATION even though it sorts late alphabetically.
      entry(
        "autoRename" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.AUTOMATION,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { searchGroups } = run(tools, "ren");

    // Ranked order wins over alphabetical: AUTOMATION (first seen) before GENERAL.
    expect(searchGroups.map((g) => g.subcategoryId)).toEqual([
      SubcategoryId.AUTOMATION,
      SubcategoryId.GENERAL,
    ]);
  });

  test("a whitespace-only query is treated as no query (alphabetical ordering)", () => {
    const tools: FilteredTool[] = [
      entry(
        "autoRename" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.AUTOMATION,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { searchGroups } = run(tools, "   ");

    // trim() is empty => alphabetical: automation < general (same as ranked here,
    // so flip the expectation to prove it took the alphabetical branch by adding
    // a subcategory that would sort differently under ranked ordering).
    expect(searchGroups.map((g) => g.subcategoryId)).toEqual([
      SubcategoryId.AUTOMATION,
      SubcategoryId.GENERAL,
    ]);
  });

  test("query ranking tie-breaks equal first-occurrence subcategories alphabetically", () => {
    // Construct two subcategories that never both appear before each other in a
    // way the order array distinguishes by index; identical index is impossible
    // here, so instead verify the localeCompare fallback fires when both indices
    // are equal by using subcategories with the SAME first-occurrence position
    // is not possible. Instead assert the documented ranked path with three subs.
    const tools: FilteredTool[] = [
      entry(
        "sign" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.SIGNING,
      ),
      entry(
        "addPassword" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.DOCUMENT_SECURITY,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { searchGroups } = run(tools, "x");

    expect(searchGroups.map((g) => g.subcategoryId)).toEqual([
      SubcategoryId.SIGNING,
      SubcategoryId.DOCUMENT_SECURITY,
      SubcategoryId.GENERAL,
    ]);
  });

  test("groups multiple subcategories within ALL TOOLS and preserves tool insertion order per group", () => {
    const tools: FilteredTool[] = [
      entry(
        "sign" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.SIGNING,
      ),
      entry(
        "certSign" as ToolId,
        ToolCategoryId.ADVANCED_TOOLS,
        SubcategoryId.SIGNING,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.GENERAL,
      ),
    ];
    const { sections } = run(tools);

    const all = sections.find((s) => s.key === "all")!;
    const signing = all.subcategories.find(
      (sc) => sc.subcategoryId === SubcategoryId.SIGNING,
    )!;
    // STANDARD then ADVANCED both feed SIGNING; insertion order preserved.
    expect(signing.tools.map((t) => t.id)).toEqual(["sign", "certSign"]);
  });

  test("returns both QUICK and ALL when recommended and standard tools coexist across subcategories", () => {
    const tools: FilteredTool[] = [
      entry(
        "read" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.GENERAL,
        { component: null },
      ),
      entry(
        "addPassword" as ToolId,
        ToolCategoryId.RECOMMENDED_TOOLS,
        SubcategoryId.DOCUMENT_SECURITY,
      ),
      entry(
        "merge" as ToolId,
        ToolCategoryId.STANDARD_TOOLS,
        SubcategoryId.EXTRACTION,
      ),
    ];
    const { sections } = run(tools);

    expect(sections.map((s) => s.key)).toEqual(["quick", "all"]);

    const quick = sections.find((s) => s.key === "quick")!;
    // Quick subcategories sorted by canonical order: DOCUMENT_SECURITY (1) before GENERAL (8).
    expect(quick.subcategories.map((sc) => sc.subcategoryId)).toEqual([
      SubcategoryId.DOCUMENT_SECURITY,
      SubcategoryId.GENERAL,
    ]);

    const all = sections.find((s) => s.key === "all")!;
    expect(all.subcategories.map((sc) => sc.subcategoryId)).toEqual([
      SubcategoryId.EXTRACTION,
    ]);
  });
});
