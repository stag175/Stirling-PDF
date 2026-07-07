/**
 * Unit tests for the showJS utils module: a deterministic JS tokenizer /
 * syntax highlighter plus clipboard and download helpers.
 *
 * The only external dependency is downloadService.downloadFromUrl, which is
 * mocked so triggerDownload can be asserted on without touching the DOM or a
 * real download primitive. The tokenizer/block/search functions are pure and
 * exercised directly. Clipboard tests stub navigator.clipboard / document
 * APIs as needed for each branch.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import {
  tokenizeToLines,
  computeBlocks,
  computeSearchMatches,
  copyTextToClipboard,
  triggerDownload,
  type ShowJsToken,
} from "@app/components/tools/showJS/utils";

// --- Mock the only external service ----------------------------------------

const downloadFromUrlMock = vi.fn();
vi.mock("@app/services/downloadService", () => ({
  downloadFromUrl: (url: unknown, filename: unknown) =>
    downloadFromUrlMock(url, filename),
}));

// --- Helpers ----------------------------------------------------------------

/** Flatten a tokenized line back to its source text. */
function lineText(line: ShowJsToken[]): string {
  return line.map((t) => t.text).join("");
}

/** Collect tokens of a given type across all lines. */
function tokensOfType(
  lines: ShowJsToken[][],
  type: ShowJsToken["type"],
): ShowJsToken[] {
  return lines.flat().filter((t) => t.type === type);
}

beforeEach(() => {
  downloadFromUrlMock.mockReset();
  downloadFromUrlMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------

describe("tokenizeToLines", () => {
  it("1) returns a single empty line for empty input", () => {
    const lines = tokenizeToLines("");
    expect(lines).toEqual([[]]);
  });

  it("2) round-trips plain source text exactly", () => {
    const src = "a + b - c";
    const lines = tokenizeToLines(src);
    expect(lines).toHaveLength(1);
    expect(lineText(lines[0])).toBe(src);
  });

  it("3) classifies keywords as kw and other identifiers as plain", () => {
    const lines = tokenizeToLines("const value = thing;");
    const flat = lines[0];
    const kw = flat.find((t) => t.text === "const");
    const id = flat.find((t) => t.text === "value");
    const other = flat.find((t) => t.text === "thing");
    expect(kw?.type).toBe("kw");
    expect(id?.type).toBe("plain");
    expect(other?.type).toBe("plain");
  });

  it("4) recognizes a representative spread of reserved keywords", () => {
    const src = "return await yield typeof instanceof of new delete void in";
    const lines = tokenizeToLines(src);
    const kws = tokensOfType(lines, "kw").map((t) => t.text);
    expect(kws).toEqual([
      "return",
      "await",
      "yield",
      "typeof",
      "instanceof",
      "of",
      "new",
      "delete",
      "void",
      "in",
    ]);
  });

  it("5) supports a custom keyword set, ignoring the default keywords", () => {
    const custom = new Set(["foo"]);
    const lines = tokenizeToLines("foo const", custom);
    const flat = lines[0];
    expect(flat.find((t) => t.text === "foo")?.type).toBe("kw");
    // "const" is no longer a keyword under the custom set.
    expect(flat.find((t) => t.text === "const")?.type).toBe("plain");
  });

  it("6) splits source into one entry per newline", () => {
    const lines = tokenizeToLines("a\nb\nc");
    expect(lines).toHaveLength(3);
    expect(lineText(lines[0])).toBe("a");
    expect(lineText(lines[1])).toBe("b");
    expect(lineText(lines[2])).toBe("c");
  });

  it("7) yields a trailing empty line when input ends with a newline", () => {
    const lines = tokenizeToLines("x\n");
    expect(lines).toHaveLength(2);
    expect(lineText(lines[0])).toBe("x");
    expect(lines[1]).toEqual([]);
  });

  it("8) tokenizes a double-quoted string as com-free str tokens", () => {
    const lines = tokenizeToLines('var s = "hello";');
    const strText = tokensOfType(lines, "str")
      .map((t) => t.text)
      .join("");
    expect(strText).toBe('"hello"');
    // No comment tokens in plain string code.
    expect(tokensOfType(lines, "com")).toHaveLength(0);
  });

  it("9) handles single-quoted strings", () => {
    const lines = tokenizeToLines("'abc'");
    const strText = tokensOfType(lines, "str")
      .map((t) => t.text)
      .join("");
    expect(strText).toBe("'abc'");
  });

  it("10) handles template literals with backticks", () => {
    const lines = tokenizeToLines("`tmpl`");
    const strText = tokensOfType(lines, "str")
      .map((t) => t.text)
      .join("");
    expect(strText).toBe("`tmpl`");
  });

  it("11) treats an escaped closing quote as part of the string (escape branch)", () => {
    // The backslash escapes the next quote, so the string does not close early.
    const src = '"a\\"b"';
    const lines = tokenizeToLines(src);
    const strText = tokensOfType(lines, "str")
      .map((t) => t.text)
      .join("");
    expect(strText).toBe(src);
    // The whole thing is one string; nothing leaks to plain.
    expect(tokensOfType(lines, "plain")).toHaveLength(0);
  });

  it("12) resets escape after a non-escape escaped char (else branch of escape)", () => {
    // \n inside the string: backslash sets escaped, then "n" hits the else
    // branch resetting escaped without closing the string.
    const src = '"x\\ny"';
    const lines = tokenizeToLines(src);
    const strText = tokensOfType(lines, "str")
      .map((t) => t.text)
      .join("");
    expect(strText).toBe(src);
  });

  it("13) tokenizes a line comment to the end of the line", () => {
    const lines = tokenizeToLines("a // comment\nb");
    const comText = tokensOfType(lines, "com")
      .map((t) => t.text)
      .join("");
    expect(comText).toBe("// comment");
    // The comment does not bleed onto the next line.
    expect(lineText(lines[1])).toBe("b");
  });

  it("14) tokenizes a block comment including its closing delimiter", () => {
    const lines = tokenizeToLines("/* hi */x");
    const comText = tokensOfType(lines, "com")
      .map((t) => t.text)
      .join("");
    expect(comText).toBe("/* hi */");
    expect(tokensOfType(lines, "plain").map((t) => t.text)).toContain("x");
  });

  it("15) spans block comments across multiple lines", () => {
    const lines = tokenizeToLines("/* one\ntwo */end");
    expect(lines).toHaveLength(2);
    // Each line's comment content is captured as com tokens.
    expect(lineText(lines[0])).toBe("/* one");
    expect(lineText(lines[1])).toBe("two */end");
    const comText = tokensOfType(lines, "com")
      .map((t) => t.text)
      .join("");
    expect(comText).toBe("/* onetwo */");
  });

  it("16) leaves an unterminated block comment open to end of input", () => {
    const lines = tokenizeToLines("/* never closes");
    const comText = tokensOfType(lines, "com")
      .map((t) => t.text)
      .join("");
    expect(comText).toBe("/* never closes");
    expect(tokensOfType(lines, "plain")).toHaveLength(0);
  });

  it("17) tokenizes integer and decimal numbers", () => {
    const lines = tokenizeToLines("42 + 3.14");
    const nums = tokensOfType(lines, "num").map((t) => t.text);
    expect(nums).toEqual(["42", "3.14"]);
  });

  it("18) tokenizes hex and binary/octal-style number literals", () => {
    const lines = tokenizeToLines("0xFF 0b1010 0o17");
    const nums = tokensOfType(lines, "num").map((t) => t.text);
    // The continuation regex consumes x/o/b and hex digits greedily.
    expect(nums).toEqual(["0xFF", "0b1010", "0o17"]);
  });

  it("19) stops a number at the first char outside the continuation set", () => {
    // The continuation regex /[0-9._xobA-Fa-f]/ does NOT include 'g', so the
    // number ends at "5" and "g7" begins a fresh identifier.
    const lines = tokenizeToLines("5g7");
    const nums = tokensOfType(lines, "num").map((t) => t.text);
    expect(nums).toEqual(["5"]);
    // 'e' IS in the continuation set (a-f), so a contrasting "1e3" stays whole.
    const exp = tokenizeToLines("1e3");
    expect(tokensOfType(exp, "num").map((t) => t.text)).toEqual(["1e3"]);
    expect(tokensOfType(lines, "plain").map((t) => t.text)).toContain("g7");
  });

  it("20) treats $ and _ as valid identifier characters", () => {
    const lines = tokenizeToLines("$_var1 = _x$");
    const idents = tokensOfType(lines, "plain").map((t) => t.text);
    expect(idents).toContain("$_var1");
    expect(idents).toContain("_x$");
  });

  it("21) emits operator/punctuation characters as individual plain tokens", () => {
    const lines = tokenizeToLines("(a){};");
    const plains = tokensOfType(lines, "plain").map((t) => t.text);
    // "a" identifier plus each punctuation char.
    expect(plains).toContain("(");
    expect(plains).toContain(")");
    expect(plains).toContain("{");
    expect(plains).toContain("}");
    expect(plains).toContain(";");
    expect(plains).toContain("a");
  });

  it("22) never pushes empty-text tokens (push guard)", () => {
    const lines = tokenizeToLines("a\n\nb");
    for (const line of lines) {
      for (const tok of line) {
        expect(tok.text.length).toBeGreaterThan(0);
      }
    }
    // The middle blank line is genuinely empty.
    expect(lines[1]).toEqual([]);
  });

  it("23) handles a realistic multi-feature snippet round-trip", () => {
    const src = [
      "function add(a, b) {",
      '  const label = "sum"; // inline',
      "  return a + b; /* done */",
      "}",
    ].join("\n");
    const lines = tokenizeToLines(src);
    expect(lines).toHaveLength(4);
    // The concatenation of all token text reproduces the source exactly.
    expect(lines.map(lineText).join("\n")).toBe(src);
    expect(tokensOfType(lines, "kw").map((t) => t.text)).toEqual([
      "function",
      "const",
      "return",
    ]);
  });
});

describe("computeBlocks", () => {
  it("24) returns an empty array when there are no braces", () => {
    expect(computeBlocks("const x = 1;")).toEqual([]);
  });

  it("25) records a multi-line brace block with its start and end lines", () => {
    const src = "function f() {\n  return 1;\n}";
    expect(computeBlocks(src)).toEqual([{ start: 0, end: 2 }]);
  });

  it("26) ignores braces that open and close on the same line", () => {
    // line > s is false (0 > 0), so no block is recorded.
    expect(computeBlocks("const o = { a: 1 };")).toEqual([]);
  });

  it("27) records nested blocks, innermost first via the stack", () => {
    const src = "if (x) {\n  while (y) {\n    z();\n  }\n}";
    // inner closes on line 3 (opened line 1); outer closes line 4 (opened 0).
    expect(computeBlocks(src)).toEqual([
      { start: 1, end: 3 },
      { start: 0, end: 4 },
    ]);
  });

  it("28) ignores braces that appear inside strings", () => {
    const src = 'const s = "{not a block}";\nx;';
    expect(computeBlocks(src)).toEqual([]);
  });

  it("29) ignores braces inside line comments", () => {
    const src = "// { fake open\nreal;\n}";
    // The only real close brace has no matching open on the stack -> popped
    // value is undefined and nothing is recorded.
    expect(computeBlocks(src)).toEqual([]);
  });

  it("30) ignores braces inside block comments and resumes after the comment", () => {
    const src = "/* { */ {\n  body;\n}";
    // The first { is inside the block comment; the real one opens on line 0.
    expect(computeBlocks(src)).toEqual([{ start: 0, end: 2 }]);
  });

  it("31) handles an unmatched closing brace without throwing", () => {
    // pop() returns undefined; the s != null guard prevents a bad push.
    expect(computeBlocks("}\n}")).toEqual([]);
  });

  it("32) handles an unmatched opening brace by leaving it on the stack", () => {
    expect(computeBlocks("{\n  x;")).toEqual([]);
  });

  it("33) respects escaped quotes inside strings when scanning for braces", () => {
    // The escaped quote keeps the string open across the brace, so the brace
    // is treated as string content, not a block.
    const src = 'var s = "a\\"{b}";\n';
    expect(computeBlocks(src)).toEqual([]);
  });

  it("34) treats backtick template braces as string content", () => {
    const src = "const t = `x {y} z`;\nq;";
    expect(computeBlocks(src)).toEqual([]);
  });

  it("35) records multiple sibling blocks on separate line ranges", () => {
    const src = "a {\n}\nb {\n}\n";
    // Two same-pattern blocks: lines 0-1 and 2-3.
    expect(computeBlocks(src)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
  });
});

describe("computeSearchMatches", () => {
  const lines = tokenizeToLines("foo bar foo\nFoo baz\nqux");

  it("36) returns an empty array for an empty query (guard)", () => {
    expect(computeSearchMatches(lines, "")).toEqual([]);
  });

  it("37) finds all case-insensitive occurrences across lines", () => {
    const matches = computeSearchMatches(lines, "foo");
    expect(matches).toEqual([
      { line: 0, start: 0, end: 3 },
      { line: 0, start: 8, end: 11 },
      { line: 1, start: 0, end: 3 },
    ]);
  });

  it("38) lowercases the query before matching", () => {
    const matches = computeSearchMatches(lines, "FOO");
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({ line: 0, start: 0, end: 3 });
  });

  it("39) returns no matches when the query is absent", () => {
    expect(computeSearchMatches(lines, "zzz")).toEqual([]);
  });

  it("40) matches overlapping single-character queries via the max(1,len) step", () => {
    const single = tokenizeToLines("aaa");
    const matches = computeSearchMatches(single, "a");
    expect(matches).toEqual([
      { line: 0, start: 0, end: 1 },
      { line: 0, start: 1, end: 2 },
      { line: 0, start: 2, end: 3 },
    ]);
  });

  it("41) advances by query length to avoid overlapping multi-char matches", () => {
    const repeated = tokenizeToLines("abab");
    const matches = computeSearchMatches(repeated, "ab");
    expect(matches).toEqual([
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 2, end: 4 },
    ]);
  });

  it("42) treats consecutive equal substrings without overlap", () => {
    const aa = tokenizeToLines("aaaa");
    // query "aa" with step max(1,2)=2 finds positions 0 and 2.
    const matches = computeSearchMatches(aa, "aa");
    expect(matches).toEqual([
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 2, end: 4 },
    ]);
  });

  it("43) returns an empty array for empty line input with a non-empty query", () => {
    expect(computeSearchMatches([[]], "x")).toEqual([]);
  });

  it("44) computes offsets against the concatenated raw line text", () => {
    // String tokens and plain tokens are joined to form the raw line.
    const toks = tokenizeToLines('a = "needle" + b');
    const matches = computeSearchMatches(toks, "needle");
    expect(matches).toHaveLength(1);
    const raw = lineText(toks[0]);
    expect(raw.slice(matches[0].start, matches[0].end)).toBe("needle");
  });
});

describe("copyTextToClipboard", () => {
  const originalNavigator = global.navigator;
  const hadExecCommand = "execCommand" in document;

  beforeEach(() => {
    // jsdom does not implement document.execCommand, so install a stub the
    // tests can spy on. It is removed again in afterEach.
    if (!hadExecCommand) {
      (document as unknown as { execCommand: () => boolean }).execCommand =
        () => false;
    }
  });

  afterEach(() => {
    // Restore navigator after each clipboard test.
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
    if (!hadExecCommand) {
      delete (document as unknown as { execCommand?: () => boolean })
        .execCommand;
    }
  });

  function setClipboard(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(global, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });
  }

  it("45) uses navigator.clipboard.writeText and returns true on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("46) coerces null/empty text to an empty string for writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    await expect(
      copyTextToClipboard(undefined as unknown as string),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });

  it("47) falls back to execCommand when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);

    const el = document.createElement("div");
    el.textContent = "copy me";
    document.body.appendChild(el);

    const removeAllRanges = vi.fn();
    const addRange = vi.fn();
    const getSelectionSpy: MockInstance = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({
        removeAllRanges,
        addRange,
      } as unknown as Selection);
    const execCommandSpy = vi
      .spyOn(document, "execCommand")
      .mockReturnValue(true);

    await expect(copyTextToClipboard("copy me", el)).resolves.toBe(true);
    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(addRange).toHaveBeenCalledTimes(1);
    // removeAllRanges called once before selecting and once in finally.
    expect(removeAllRanges).toHaveBeenCalledTimes(2);
    expect(getSelectionSpy).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it("48) returns false when clipboard fails and no fallback element is provided", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);

    await expect(copyTextToClipboard("x")).resolves.toBe(false);
  });

  it("49) returns false when clipboard fails and fallback element is null", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);

    await expect(copyTextToClipboard("x", null)).resolves.toBe(false);
  });

  it("50) goes straight to the fallback when navigator.clipboard is unavailable", async () => {
    Object.defineProperty(global, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });

    const el = document.createElement("div");
    document.body.appendChild(el);

    const removeAllRanges = vi.fn();
    const addRange = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      removeAllRanges,
      addRange,
    } as unknown as Selection);
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    await expect(copyTextToClipboard("y", el)).resolves.toBe(true);
    expect(addRange).toHaveBeenCalledTimes(1);

    document.body.removeChild(el);
  });

  it("51) handles a null selection without throwing (optional chaining)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);

    const el = document.createElement("div");
    document.body.appendChild(el);

    vi.spyOn(window, "getSelection").mockReturnValue(null);
    const execCommandSpy = vi
      .spyOn(document, "execCommand")
      .mockReturnValue(false);

    // execCommand returns false but is still invoked; the function returns true
    // because it returns from the try regardless of execCommand's result.
    await expect(copyTextToClipboard("z", el)).resolves.toBe(true);
    expect(execCommandSpy).toHaveBeenCalledWith("copy");

    document.body.removeChild(el);
  });
});

describe("triggerDownload", () => {
  it("52) delegates to downloadFromUrl with the url and filename", async () => {
    await triggerDownload("blob:abc", "script.js");
    expect(downloadFromUrlMock).toHaveBeenCalledTimes(1);
    expect(downloadFromUrlMock).toHaveBeenCalledWith("blob:abc", "script.js");
  });

  it("53) propagates rejections from downloadFromUrl", async () => {
    downloadFromUrlMock.mockRejectedValue(new Error("download failed"));
    await expect(triggerDownload("u", "f")).rejects.toThrow("download failed");
  });
});
