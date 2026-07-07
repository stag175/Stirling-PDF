import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";

import { FileLifecycleManager } from "@app/contexts/file/lifecycle";
import { FileId } from "@app/types/file";
import {
  FileContextAction,
  StirlingFileStub,
  ProcessedFilePage,
} from "@app/types/fileContext";

/**
 * Unit tests for FileLifecycleManager.
 *
 * The class is pure resource bookkeeping: it tracks blob URLs, schedules
 * delayed cleanup via window.setTimeout with generation tokens, and revokes
 * URLs through URL.revokeObjectURL. Determinism comes entirely from:
 *   - vi.useFakeTimers() so scheduled cleanups fire on advanceTimersByTime
 *     instead of the real wall clock, and
 *   - a spy on URL.revokeObjectURL (already mocked in setupTests) so we can
 *     assert exactly which URLs were revoked.
 *
 * No React tree is needed: filesRef and dispatch are plain mock objects
 * shaped like React.MutableRefObject / React.Dispatch.
 */

const id = (s: string): FileId => s as FileId;

// Minimal StirlingFileStub factory matching the local-test fixture style.
function makeStub(
  fileId: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: id(fileId),
    name: `${fileId}.pdf`,
    type: "application/pdf",
    size: 1024,
    lastModified: 1000,
    createdAt: 2000,
    isLeaf: true,
    originalFileId: fileId,
    versionNumber: 1,
    ...overrides,
  };
}

// Build a fake File without depending on the real File constructor.
function makeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: "application/pdf",
  });
}

// stateRef shaped like the production state: { files: { byId } }.
interface FakeState {
  files: { byId: Record<string, StirlingFileStub> };
}

function makeStateRef(
  byId: Record<string, StirlingFileStub> = {},
): React.MutableRefObject<FakeState> {
  return { current: { files: { byId } } } as React.MutableRefObject<FakeState>;
}

describe("FileLifecycleManager", () => {
  let filesRef: React.MutableRefObject<Map<FileId, File>>;
  let dispatch: ReturnType<typeof vi.fn>;
  let manager: FileLifecycleManager;
  let revokeSpy: MockInstance<(url: string) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    filesRef = {
      current: new Map<FileId, File>(),
    } as React.MutableRefObject<Map<FileId, File>>;
    dispatch = vi.fn();
    manager = new FileLifecycleManager(
      filesRef,
      dispatch as unknown as React.Dispatch<FileContextAction>,
    );
    // setupTests already mocks URL.revokeObjectURL with vi.fn(); spy on it so
    // every test starts from a clean call history.
    revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    revokeSpy.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // --- trackBlobUrl ---------------------------------------------------------

  describe("trackBlobUrl", () => {
    it("tracks blob: URLs so they are revoked on cleanupAllFiles", () => {
      manager.trackBlobUrl("blob:http://localhost/abc");
      manager.cleanupAllFiles();
      expect(revokeSpy).toHaveBeenCalledTimes(1);
      expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost/abc");
    });

    it("ignores non-blob URL schemes", () => {
      manager.trackBlobUrl("https://example.com/file.pdf");
      manager.trackBlobUrl("data:application/pdf;base64,AAAA");
      manager.cleanupAllFiles();
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("deduplicates identical blob URLs (backed by a Set)", () => {
      manager.trackBlobUrl("blob:dup");
      manager.trackBlobUrl("blob:dup");
      manager.cleanupAllFiles();
      expect(revokeSpy).toHaveBeenCalledTimes(1);
    });
  });

  // --- cleanupAllFiles ------------------------------------------------------

  describe("cleanupAllFiles", () => {
    it("revokes all tracked URLs, clears timers and the files ref", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      filesRef.current.set(id("b"), makeFile("b.pdf"));
      manager.trackBlobUrl("blob:one");
      manager.trackBlobUrl("blob:two");
      manager.scheduleCleanup(id("a"), 30000);

      manager.cleanupAllFiles();

      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(filesRef.current.size).toBe(0);

      // The scheduled timer must have been cleared: advancing time fires nothing.
      vi.advanceTimersByTime(60000);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("swallows revocation errors and still clears the set", () => {
      revokeSpy.mockImplementation(() => {
        throw new Error("boom");
      });
      manager.trackBlobUrl("blob:throws");

      expect(() => manager.cleanupAllFiles()).not.toThrow();

      // The URL was removed from the set despite the throw: a second pass is a no-op.
      revokeSpy.mockImplementation(() => undefined);
      manager.cleanupAllFiles();
      expect(revokeSpy).toHaveBeenCalledTimes(1);
    });
  });

  // --- scheduleCleanup ------------------------------------------------------

  describe("scheduleCleanup", () => {
    it("removes the file after the delay elapses with default delay", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      manager.scheduleCleanup(id("a"));

      // Nothing fires before the default 30s delay.
      vi.advanceTimersByTime(29999);
      expect(dispatch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(filesRef.current.has(id("a"))).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a")] },
      });
    });

    it("honors a custom delay", () => {
      manager.scheduleCleanup(id("a"), 5000);
      vi.advanceTimersByTime(4999);
      expect(dispatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("cancels (without rescheduling) when delay is negative", () => {
      manager.scheduleCleanup(id("a"), 1000);
      // Re-schedule with a negative delay: this cancels the existing timer.
      manager.scheduleCleanup(id("a"), -1);
      vi.advanceTimersByTime(100000);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("replaces an existing timer when re-scheduled (only fires once)", () => {
      manager.scheduleCleanup(id("a"), 1000);
      manager.scheduleCleanup(id("a"), 2000);

      // The first (1000ms) timer was cleared, so nothing at 1000ms.
      vi.advanceTimersByTime(1000);
      expect(dispatch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("invalidates stale pending cleanup via generation token", () => {
      // First schedule bumps generation to 1 and arms a timer.
      manager.scheduleCleanup(id("a"), 1000);
      // Second schedule clears that timer and bumps generation to 2.
      manager.scheduleCleanup(id("a"), 1000);

      vi.advanceTimersByTime(1000);
      // Only the second timer survives; it sees a matching generation and runs.
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("passes stateRef through so blob URLs on the record are revoked", () => {
      const stub = makeStub("a", {
        blobUrl: "blob:record-a",
        thumbnailUrl: "blob:thumb-a",
      });
      const stateRef = makeStateRef({ a: stub });
      manager.scheduleCleanup(id("a"), 1000, stateRef);

      vi.advanceTimersByTime(1000);
      expect(revokeSpy).toHaveBeenCalledWith("blob:record-a");
      expect(revokeSpy).toHaveBeenCalledWith("blob:thumb-a");
    });
  });

  // --- cleanupFile ----------------------------------------------------------

  describe("cleanupFile", () => {
    it("removes the file from the ref and dispatches REMOVE_FILES", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      manager.cleanupFile(id("a"));

      expect(filesRef.current.has(id("a"))).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a")] },
      });
    });

    it("cancels a pending timer for the same file", () => {
      manager.scheduleCleanup(id("a"), 5000);
      manager.cleanupFile(id("a"));

      // One dispatch from cleanupFile; the timer must not fire a second.
      expect(dispatch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10000);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  // --- removeFiles ----------------------------------------------------------

  describe("removeFiles", () => {
    it("cleans every file and dispatches a single REMOVE_FILES action", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      filesRef.current.set(id("b"), makeFile("b.pdf"));

      manager.removeFiles([id("a"), id("b")]);

      expect(filesRef.current.size).toBe(0);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a"), id("b")] },
      });
    });

    it("revokes record blob URLs (thumbnail, blobUrl and processed pages)", () => {
      const pages: ProcessedFilePage[] = [
        { thumbnail: "blob:page-1" },
        { thumbnail: "https://not-a-blob/page-2" },
        { thumbnail: "blob:page-3" },
        {}, // no thumbnail at all
      ];
      const stub = makeStub("a", {
        blobUrl: "blob:main-a",
        thumbnailUrl: "blob:thumb-a",
        processedFile: { pages },
      });
      const stateRef = makeStateRef({ a: stub });

      manager.removeFiles([id("a")], stateRef);

      const revoked = revokeSpy.mock.calls.map((c) => c[0]);
      expect(revoked).toContain("blob:main-a");
      expect(revoked).toContain("blob:thumb-a");
      expect(revoked).toContain("blob:page-1");
      expect(revoked).toContain("blob:page-3");
      // Non-blob page thumbnail and the main https/data schemes are skipped.
      expect(revoked).not.toContain("https://not-a-blob/page-2");
    });

    it("skips non-blob thumbnail/blobUrl on the record", () => {
      const stub = makeStub("a", {
        blobUrl: "https://cdn/x.pdf",
        thumbnailUrl: "data:image/png;base64,AAAA",
      });
      const stateRef = makeStateRef({ a: stub });

      manager.removeFiles([id("a")], stateRef);
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("handles a missing record in stateRef without throwing", () => {
      const stateRef = makeStateRef({}); // no record for "ghost"
      expect(() => manager.removeFiles([id("ghost")], stateRef)).not.toThrow();
      expect(revokeSpy).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("works without a stateRef (only ref/timer cleanup, no URL revocation)", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      manager.removeFiles([id("a")]);
      expect(revokeSpy).not.toHaveBeenCalled();
      expect(filesRef.current.has(id("a"))).toBe(false);
    });

    it("ignores revocation errors on record blob URLs", () => {
      revokeSpy.mockImplementation(() => {
        throw new Error("revoke failed");
      });
      const stub = makeStub("a", {
        blobUrl: "blob:main-a",
        thumbnailUrl: "blob:thumb-a",
        processedFile: { pages: [{ thumbnail: "blob:page-1" }] },
      });
      const stateRef = makeStateRef({ a: stub });

      expect(() => manager.removeFiles([id("a")], stateRef)).not.toThrow();
      // All three blob URLs were attempted despite each throwing.
      expect(revokeSpy).toHaveBeenCalledTimes(3);
    });

    it("handles a record without a processedFile", () => {
      const stub = makeStub("a", { blobUrl: "blob:main-a" });
      const stateRef = makeStateRef({ a: stub });
      manager.removeFiles([id("a")], stateRef);
      expect(revokeSpy).toHaveBeenCalledWith("blob:main-a");
      expect(revokeSpy).toHaveBeenCalledTimes(1);
    });

    it("cancels pending timers for files being removed", () => {
      manager.scheduleCleanup(id("a"), 5000);
      manager.removeFiles([id("a")]);

      // removeFiles dispatched once; the cancelled timer must not add a second.
      expect(dispatch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10000);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  // --- updateStirlingFileStub ----------------------------------------------

  describe("updateStirlingFileStub", () => {
    it("dispatches UPDATE_FILE_RECORD when the file is present in the ref", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      manager.updateStirlingFileStub(id("a"), { name: "renamed.pdf" });

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_FILE_RECORD",
        payload: { id: id("a"), updates: { name: "renamed.pdf" } },
      });
    });

    it("no-ops when the file is absent from the ref (race guard)", () => {
      manager.updateStirlingFileStub(id("missing"), { name: "x.pdf" });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("no-ops when the file is in the ref but absent from stateRef", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      const stateRef = makeStateRef({}); // not present in state
      manager.updateStirlingFileStub(id("a"), { name: "x.pdf" }, stateRef);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches when present in both the ref and stateRef", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      const stateRef = makeStateRef({ a: makeStub("a") });
      manager.updateStirlingFileStub(id("a"), { isDirty: true }, stateRef);
      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_FILE_RECORD",
        payload: { id: id("a"), updates: { isDirty: true } },
      });
    });
  });

  // --- destroy --------------------------------------------------------------

  describe("destroy", () => {
    it("delegates to cleanupAllFiles", () => {
      filesRef.current.set(id("a"), makeFile("a.pdf"));
      manager.trackBlobUrl("blob:on-destroy");
      manager.scheduleCleanup(id("a"), 5000);

      manager.destroy();

      expect(revokeSpy).toHaveBeenCalledWith("blob:on-destroy");
      expect(filesRef.current.size).toBe(0);
      vi.advanceTimersByTime(10000);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
