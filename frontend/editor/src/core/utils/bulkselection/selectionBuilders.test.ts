import { describe, it, expect } from "vitest";
import {
  appendExpression,
  insertOperatorSmart,
  firstNExpression,
  lastNExpression,
  everyNthExpression,
  rangeExpression,
} from "@app/utils/bulkselection/selectionBuilders";

describe("appendExpression", () => {
  it("returns expr unchanged when current input is empty", () => {
    expect(appendExpression("", "5")).toBe("5");
  });

  it("treats whitespace-only input as empty", () => {
    expect(appendExpression("   ", "1-3")).toBe("1-3");
  });

  it("handles null/undefined current input via fallback", () => {
    expect(appendExpression(undefined as unknown as string, "2n")).toBe("2n");
  });

  it("joins with ' or ' when current does not end with an operator", () => {
    expect(appendExpression("1-3", "5")).toBe("1-3 or 5");
  });

  it("trims the current input before joining", () => {
    expect(appendExpression("  1-3  ", "5")).toBe("1-3 or 5");
  });

  it("appends directly when current ends with word operator 'or'", () => {
    expect(appendExpression("1-3 or", "5")).toBe("1-3 or 5");
  });

  it("appends directly when current ends with word operator 'and'", () => {
    expect(appendExpression("1-3 and", "5")).toBe("1-3 and 5");
  });

  it("appends directly when current ends with word operator 'not'", () => {
    expect(appendExpression("1-3 and not", "5")).toBe("1-3 and not 5");
  });

  it("is case-insensitive for word operators", () => {
    expect(appendExpression("1-3 OR", "5")).toBe("1-3 OR 5");
  });

  it("appends directly when current ends with symbol operator '&'", () => {
    expect(appendExpression("1-3 &", "5")).toBe("1-3 & 5");
  });

  it("appends directly when current ends with symbol operator '|'", () => {
    expect(appendExpression("1-3 |", "5")).toBe("1-3 | 5");
  });

  it("appends directly when current ends with symbol operator ','", () => {
    expect(appendExpression("1-3,", "5")).toBe("1-3, 5");
  });

  it("appends directly when current ends with symbol operator '!'", () => {
    expect(appendExpression("1-3 or !", "5")).toBe("1-3 or ! 5");
  });

  it("does not add a double space when operator already ends with a space (then trimmed)", () => {
    // trailing whitespace is trimmed first, so a single space is reinserted
    expect(appendExpression("1-3 or ", "5")).toBe("1-3 or 5");
  });
});

describe("insertOperatorSmart - even/odd page selection", () => {
  it("returns 'even ' when input is empty", () => {
    expect(insertOperatorSmart("", "even")).toBe("even ");
  });

  it("returns 'odd ' when input is empty", () => {
    expect(insertOperatorSmart("", "odd")).toBe("odd ");
  });

  it("joins even with ' or ' when current does not end with an operator", () => {
    expect(insertOperatorSmart("1-3", "even")).toBe("1-3 or even ");
  });

  it("appends even directly after a trailing word operator", () => {
    expect(insertOperatorSmart("1-3 and", "even")).toBe("1-3 and even ");
  });

  it("appends odd directly after a trailing symbol operator", () => {
    expect(insertOperatorSmart("1-3 &", "odd")).toBe("1-3 & odd ");
  });

  it("does not duplicate the space when operator already has trailing space", () => {
    expect(insertOperatorSmart("1-3 and ", "even")).toBe("1-3 and even ");
  });
});

describe("insertOperatorSmart - empty input with logical operator", () => {
  it("returns 'and ' for empty input", () => {
    expect(insertOperatorSmart("", "and")).toBe("and ");
  });

  it("returns 'or ' for empty input", () => {
    expect(insertOperatorSmart("   ", "or")).toBe("or ");
  });

  it("returns 'not ' for empty input", () => {
    expect(insertOperatorSmart("", "not")).toBe("not ");
  });
});

describe("insertOperatorSmart - no trailing operator", () => {
  it("appends the clicked operator after a plain term", () => {
    expect(insertOperatorSmart("1-3", "and")).toBe("1-3 and ");
  });

  it("appends 'or' after a plain term", () => {
    expect(insertOperatorSmart("5", "or")).toBe("5 or ");
  });

  it("appends 'not' after a plain term", () => {
    expect(insertOperatorSmart("5", "not")).toBe("5 not ");
  });
});

describe("insertOperatorSmart - single trailing token transitions", () => {
  // from 'and'
  it("and -> and stays 'and'", () => {
    expect(insertOperatorSmart("1 and", "and")).toBe("1 and ");
  });
  it("and -> or collapses to 'or'", () => {
    expect(insertOperatorSmart("1 and", "or")).toBe("1 or ");
  });
  it("and -> not becomes 'and not'", () => {
    expect(insertOperatorSmart("1 and", "not")).toBe("1 and not ");
  });

  // from 'or'
  it("or -> and collapses to 'and'", () => {
    expect(insertOperatorSmart("1 or", "and")).toBe("1 and ");
  });
  it("or -> or stays 'or'", () => {
    expect(insertOperatorSmart("1 or", "or")).toBe("1 or ");
  });
  it("or -> not becomes 'or not'", () => {
    expect(insertOperatorSmart("1 or", "not")).toBe("1 or not ");
  });

  // from 'not'
  it("not -> and collapses to 'and'", () => {
    expect(insertOperatorSmart("1 not", "and")).toBe("1 and ");
  });
  it("not -> or collapses to 'or'", () => {
    expect(insertOperatorSmart("1 not", "or")).toBe("1 or ");
  });
  it("not -> not stays 'not'", () => {
    expect(insertOperatorSmart("1 not", "not")).toBe("1 not ");
  });

  it("normalizes symbol '&' as 'and' token", () => {
    expect(insertOperatorSmart("1 &", "not")).toBe("1 and not ");
  });

  it("normalizes symbol '|' as 'or' token", () => {
    expect(insertOperatorSmart("1 |", "not")).toBe("1 or not ");
  });

  it("normalizes symbol ',' as 'or' token", () => {
    expect(insertOperatorSmart("1,", "not")).toBe("1 or not ");
  });

  it("normalizes symbol '!' as 'not' token", () => {
    expect(insertOperatorSmart("1 !", "and")).toBe("1 and ");
  });
});

describe("insertOperatorSmart - combined (two-token) transitions", () => {
  // from 'and not'
  it("'and not' -> not stays 'and not'", () => {
    expect(insertOperatorSmart("1 and not", "not")).toBe("1 and not ");
  });
  it("'and not' -> and becomes 'and'", () => {
    expect(insertOperatorSmart("1 and not", "and")).toBe("1 and ");
  });
  it("'and not' -> or becomes 'or'", () => {
    expect(insertOperatorSmart("1 and not", "or")).toBe("1 or ");
  });

  // from 'or not'
  it("'or not' -> not stays 'or not'", () => {
    expect(insertOperatorSmart("1 or not", "not")).toBe("1 or not ");
  });
  it("'or not' -> or becomes 'or'", () => {
    expect(insertOperatorSmart("1 or not", "or")).toBe("1 or ");
  });
  it("'or not' -> and becomes 'and'", () => {
    expect(insertOperatorSmart("1 or not", "and")).toBe("1 and ");
  });

  it("normalizes symbol combo '& !' as 'and not'", () => {
    expect(insertOperatorSmart("1 & !", "not")).toBe("1 and not ");
  });

  it("normalizes symbol combo '| !' as 'or not'", () => {
    expect(insertOperatorSmart("1 | !", "or")).toBe("1 or ");
  });
});

describe("insertOperatorSmart - invalid combo collapses to clicked op", () => {
  it("'not and' invalid combo collapses to clicked 'or'", () => {
    // tokens parsed are ['not','and']; fromCombo default branch returns click
    expect(insertOperatorSmart("1 not and", "or")).toBe("1 or ");
  });

  it("'or and' invalid combo collapses to clicked 'not'", () => {
    expect(insertOperatorSmart("1 or and", "not")).toBe("1 not ");
  });

  it("'and or' invalid combo collapses to clicked 'and'", () => {
    expect(insertOperatorSmart("1 and or", "and")).toBe("1 and ");
  });
});

describe("firstNExpression", () => {
  it("builds a 1-based range capped at maxPages", () => {
    expect(firstNExpression(3, 10)).toBe("1-3");
  });

  it("caps the end at maxPages when n exceeds it", () => {
    expect(firstNExpression(50, 10)).toBe("1-10");
  });

  it("floors fractional n", () => {
    expect(firstNExpression(2.9, 10)).toBe("1-2");
  });

  it("returns null for zero", () => {
    expect(firstNExpression(0, 10)).toBeNull();
  });

  it("returns null for negative n", () => {
    expect(firstNExpression(-5, 10)).toBeNull();
  });

  it("returns null for non-finite n", () => {
    expect(firstNExpression(Infinity, 10)).toBeNull();
    expect(firstNExpression(NaN, 10)).toBeNull();
  });

  it("clamps the end to at least 1 even when fractional floor is 0", () => {
    // n=0.5 floors to 0, Math.max(1, 0) => 1, then min(maxPages,1)
    expect(firstNExpression(0.5, 10)).toBe("1-1");
  });
});

describe("lastNExpression", () => {
  it("builds the trailing range of n pages", () => {
    expect(lastNExpression(3, 10)).toBe("8-10");
  });

  it("clamps the start to 1 when n exceeds maxPages", () => {
    expect(lastNExpression(50, 10)).toBe("1-10");
  });

  it("floors fractional n", () => {
    expect(lastNExpression(2.9, 10)).toBe("9-10");
  });

  it("returns null for zero or negative n", () => {
    expect(lastNExpression(0, 10)).toBeNull();
    expect(lastNExpression(-1, 10)).toBeNull();
  });

  it("returns null for non-finite n", () => {
    expect(lastNExpression(Infinity, 10)).toBeNull();
  });

  it("returns null when maxPages is zero or negative", () => {
    expect(lastNExpression(3, 0)).toBeNull();
    expect(lastNExpression(3, -2)).toBeNull();
  });
});

describe("everyNthExpression", () => {
  it("builds an 'Nn' progression token", () => {
    expect(everyNthExpression(2)).toBe("2n");
  });

  it("floors fractional n", () => {
    expect(everyNthExpression(3.7)).toBe("3n");
  });

  it("clamps to at least 1n when floor is 0", () => {
    expect(everyNthExpression(0.5)).toBe("1n");
  });

  it("returns null for zero or negative n", () => {
    expect(everyNthExpression(0)).toBeNull();
    expect(everyNthExpression(-3)).toBeNull();
  });

  it("returns null for non-finite n", () => {
    expect(everyNthExpression(NaN)).toBeNull();
    expect(everyNthExpression(Infinity)).toBeNull();
  });
});

describe("rangeExpression", () => {
  it("builds a normal range", () => {
    expect(rangeExpression(3, 7, 10)).toBe("3-7");
  });

  it("swaps start and end when reversed", () => {
    expect(rangeExpression(7, 3, 10)).toBe("3-7");
  });

  it("floors fractional bounds", () => {
    expect(rangeExpression(2.9, 7.9, 10)).toBe("2-7");
  });

  it("clamps the start up to 1", () => {
    expect(rangeExpression(-5, 4, 10)).toBe("1-4");
  });

  it("clamps the end down to maxPages when positive", () => {
    expect(rangeExpression(2, 99, 10)).toBe("2-10");
  });

  it("does not clamp the end when maxPages is zero or negative", () => {
    expect(rangeExpression(2, 99, 0)).toBe("2-99");
  });

  it("returns null when start is non-finite", () => {
    expect(rangeExpression(NaN, 5, 10)).toBeNull();
  });

  it("returns null when end is non-finite", () => {
    expect(rangeExpression(1, Infinity, 10)).toBeNull();
  });
});
