import { describe, expect, test, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useUndoRedo,
  type Command,
  type CommandSequence,
} from "@app/hooks/useUndoRedo";

/**
 * Builds a mock Command whose execute/undo handlers push their description onto
 * a shared log, so test assertions can verify ordering and call counts.
 */
function makeCommand(description: string, log: string[]): Command {
  return {
    description,
    execute: vi.fn(() => {
      log.push(`execute:${description}`);
    }),
    undo: vi.fn(() => {
      log.push(`undo:${description}`);
    }),
  };
}

function makeSequence(
  description: string,
  log: string[],
  commands: Command[] = [],
): CommandSequence {
  return {
    description,
    commands,
    execute: vi.fn(() => {
      log.push(`execute:${description}`);
    }),
    undo: vi.fn(() => {
      log.push(`undo:${description}`);
    }),
  };
}

describe("useUndoRedo", () => {
  test("initializes with empty stacks and false flags", () => {
    const { result } = renderHook(() => useUndoRedo());

    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("executeCommand runs the command and pushes it onto the undo stack", () => {
    const log: string[] = [];
    const cmd = makeCommand("A", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(cmd);
    });

    expect(cmd.execute).toHaveBeenCalledTimes(1);
    expect(cmd.undo).not.toHaveBeenCalled();
    expect(result.current.undoStack).toEqual([cmd]);
    expect(result.current.redoStack).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(log).toEqual(["execute:A"]);
  });

  test("executeCommand prepends newest command so the undo stack is LIFO", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const b = makeCommand("B", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.executeCommand(b);
    });

    // Newest first.
    expect(result.current.undoStack).toEqual([b, a]);
    expect(log).toEqual(["execute:A", "execute:B"]);
  });

  test("undo invokes the most recent command's undo and moves it to redo stack", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const b = makeCommand("B", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.executeCommand(b);
    });

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.undo();
    });

    expect(returned).toBe(true);
    expect(b.undo).toHaveBeenCalledTimes(1);
    expect(a.undo).not.toHaveBeenCalled();
    expect(result.current.undoStack).toEqual([a]);
    expect(result.current.redoStack).toEqual([b]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    expect(log).toEqual(["execute:A", "execute:B", "undo:B"]);
  });

  test("undo on an empty stack returns false and triggers no work", () => {
    const { result } = renderHook(() => useUndoRedo());

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.undo();
    });

    expect(returned).toBe(false);
    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([]);
  });

  test("redo re-executes the command and moves it back onto the undo stack", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.undo();
    });

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.redo();
    });

    expect(returned).toBe(true);
    // execute called once at executeCommand, once at redo.
    expect(a.execute).toHaveBeenCalledTimes(2);
    expect(result.current.undoStack).toEqual([a]);
    expect(result.current.redoStack).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(log).toEqual(["execute:A", "undo:A", "execute:A"]);
  });

  test("redo on an empty stack returns false and triggers no work", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.redo();
    });

    expect(returned).toBe(false);
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(result.current.redoStack).toEqual([]);
    expect(result.current.undoStack).toEqual([a]);
  });

  test("executing a new command clears the redo stack", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const b = makeCommand("B", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.undo();
    });

    // Precondition: a is now on the redo stack.
    expect(result.current.redoStack).toEqual([a]);

    act(() => {
      result.current.executeCommand(b);
    });

    expect(result.current.redoStack).toEqual([]);
    expect(result.current.undoStack).toEqual([b]);
    expect(result.current.canRedo).toBe(false);
  });

  test("clear empties both stacks without invoking any command handlers", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const b = makeCommand("B", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.executeCommand(b);
    });
    act(() => {
      result.current.undo();
    });

    const undoCallsBefore = (a.undo as ReturnType<typeof vi.fn>).mock.calls
      .length;

    act(() => {
      result.current.clear();
    });

    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    // clear must not call undo/execute on the discarded commands.
    expect((a.undo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      undoCallsBefore,
    );
  });

  test("supports a full undo/redo round trip across multiple commands", () => {
    const log: string[] = [];
    const a = makeCommand("A", log);
    const b = makeCommand("B", log);
    const c = makeCommand("C", log);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(a);
    });
    act(() => {
      result.current.executeCommand(b);
    });
    act(() => {
      result.current.executeCommand(c);
    });

    // Undo all three (LIFO: C, B, A).
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([a, b, c]);

    // Redo all three back (A, B, C).
    act(() => {
      result.current.redo();
    });
    act(() => {
      result.current.redo();
    });
    act(() => {
      result.current.redo();
    });

    expect(result.current.undoStack).toEqual([c, b, a]);
    expect(result.current.redoStack).toEqual([]);
    expect(log).toEqual([
      "execute:A",
      "execute:B",
      "execute:C",
      "undo:C",
      "undo:B",
      "undo:A",
      "execute:A",
      "execute:B",
      "execute:C",
    ]);
  });

  test("treats a CommandSequence exactly like a single command", () => {
    const log: string[] = [];
    const inner1 = makeCommand("inner1", log);
    const inner2 = makeCommand("inner2", log);
    const seq = makeSequence("seq", log, [inner1, inner2]);
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      result.current.executeCommand(seq);
    });

    expect(seq.execute).toHaveBeenCalledTimes(1);
    expect(result.current.undoStack).toEqual([seq]);

    act(() => {
      result.current.undo();
    });

    expect(seq.undo).toHaveBeenCalledTimes(1);
    expect(result.current.redoStack).toEqual([seq]);
    // The hook delegates to the sequence's own execute/undo and does not reach
    // into its child commands.
    expect(inner1.execute).not.toHaveBeenCalled();
    expect(inner2.undo).not.toHaveBeenCalled();
    expect(log).toEqual(["execute:seq", "undo:seq"]);
  });
});
