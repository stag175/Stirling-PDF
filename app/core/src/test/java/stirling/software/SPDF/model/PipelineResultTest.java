package stirling.software.SPDF.model;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.util.TempFile;

/**
 * Pure unit tests for {@link PipelineResult}, a Lombok {@code @Data} {@link AutoCloseable} that
 * tracks {@link TempFile}s. The collaborator {@code TempFile} has no no-arg constructor (it requires
 * a {@code TempFileManager} and may throw {@code IOException}), so it is supplied as a Mockito mock
 * rather than a real instance — no filesystem, Spring context, or native tooling is touched.
 *
 * <p>Note: {@code close()} logs {@code file.getAbsolutePath()} via {@code log.debug(...)}; the
 * argument expression is always evaluated regardless of the active log level, so the mocks stub
 * {@code getAbsolutePath()} leniently and that method is expected to be invoked once per close.
 */
@ExtendWith(MockitoExtension.class)
class PipelineResultTest {

    @Mock private TempFile tempFileA;
    @Mock private TempFile tempFileB;

    @Test
    @DisplayName("new instance starts with a non-null, empty tempFiles list and default flags")
    void newInstance_hasEmptyTempFilesAndDefaults() {
        PipelineResult result = new PipelineResult();

        assertNotNull(result.getTempFiles(), "tempFiles is field-initialized to an ArrayList");
        assertTrue(result.getTempFiles().isEmpty());
        assertEquals(false, result.isHasErrors());
        assertEquals(false, result.isFiltersApplied());
        assertEquals(null, result.getOutputFiles());
    }

    @Test
    @DisplayName("addTempFile appends in insertion order")
    void addTempFile_appendsInOrder() {
        PipelineResult result = new PipelineResult();

        result.addTempFile(tempFileA);
        result.addTempFile(tempFileB);

        assertEquals(List.of(tempFileA, tempFileB), result.getTempFiles());
    }

    @Test
    @DisplayName("addTempFile accepts a null element (no defensive guard in production code)")
    void addTempFile_allowsNull() {
        PipelineResult result = new PipelineResult();

        result.addTempFile(null);

        assertEquals(1, result.getTempFiles().size());
        assertEquals(null, result.getTempFiles().get(0));
    }

    @Test
    @DisplayName("close() closes every tracked TempFile exactly once and clears the list")
    void close_closesEachFileAndClears() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a.pdf");
        lenient().when(tempFileB.getAbsolutePath()).thenReturn("/tmp/b.pdf");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);
        result.addTempFile(tempFileB);

        result.close();

        verify(tempFileA, times(1)).close();
        verify(tempFileB, times(1)).close();
        assertTrue(result.getTempFiles().isEmpty(), "tempFiles must be cleared after close()");
    }

    @Test
    @DisplayName("close() closes files in insertion order")
    void close_closesInInsertionOrder() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");
        lenient().when(tempFileB.getAbsolutePath()).thenReturn("/tmp/b");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);
        result.addTempFile(tempFileB);

        result.close();

        InOrder order = inOrder(tempFileA, tempFileB);
        order.verify(tempFileA).close();
        order.verify(tempFileB).close();
    }

    @Test
    @DisplayName("close() reads the absolute path of each file for the debug log line")
    void close_readsAbsolutePathForLogging() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);

        result.close();

        // log.debug(...) always evaluates its argument expression, so getAbsolutePath() is hit.
        verify(tempFileA, atLeastOnce()).getAbsolutePath();
    }

    @Test
    @DisplayName("close() on an empty result is a no-op and does not throw")
    void close_emptyResult_isNoOp() {
        PipelineResult result = new PipelineResult();

        assertDoesNotThrow(result::close);

        assertTrue(result.getTempFiles().isEmpty());
    }

    @Test
    @DisplayName("close() is idempotent: a second call does not re-close already-closed files")
    void close_isIdempotent() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);

        result.close();
        result.close(); // list already cleared -> nothing to iterate

        verify(tempFileA, times(1)).close();
        assertTrue(result.getTempFiles().isEmpty());
    }

    @Test
    @DisplayName("cleanup() delegates to close(): files are closed and the list cleared")
    void cleanup_delegatesToClose() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);

        result.cleanup();

        verify(tempFileA, times(1)).close();
        assertTrue(result.getTempFiles().isEmpty());
    }

    @Test
    @DisplayName("a file added after close() is tracked again and closed by the next close()")
    void addAfterClose_isTrackedAgain() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");
        lenient().when(tempFileB.getAbsolutePath()).thenReturn("/tmp/b");

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);
        result.close();

        result.addTempFile(tempFileB);
        assertEquals(List.of(tempFileB), result.getTempFiles());

        result.close();

        verify(tempFileA, times(1)).close();
        verify(tempFileB, times(1)).close();
        assertTrue(result.getTempFiles().isEmpty());
    }

    @Test
    @DisplayName(
            "if a file's close() throws, the exception propagates and later files are NOT closed")
    void close_propagatesExceptionAndStopsIteration() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");
        doThrow(new RuntimeException("boom")).when(tempFileA).close();

        PipelineResult result = new PipelineResult();
        result.addTempFile(tempFileA);
        result.addTempFile(tempFileB);

        RuntimeException ex = assertThrows(RuntimeException.class, result::close);
        assertEquals("boom", ex.getMessage());

        // Iteration aborts on the throwing element: the second file is never reached...
        verifyNoInteractions(tempFileB);
        // ...and because close() threw before tempFiles.clear(), the list is left intact.
        assertEquals(List.of(tempFileA, tempFileB), result.getTempFiles());
    }

    @Test
    @DisplayName("try-with-resources auto-invokes close(), clearing tracked files")
    void tryWithResources_invokesClose() {
        lenient().when(tempFileA.getAbsolutePath()).thenReturn("/tmp/a");

        PipelineResult outer;
        try (PipelineResult result = new PipelineResult()) {
            result.addTempFile(tempFileA);
            outer = result;
        }

        verify(tempFileA, times(1)).close();
        assertTrue(outer.getTempFiles().isEmpty());
    }

    @Test
    @DisplayName("@Data setters/getters round-trip outputFiles and the boolean flags")
    void dataAccessors_roundTrip() {
        Resource res = new ByteArrayResource(new byte[] {1, 2, 3});
        List<Resource> files = new ArrayList<>(List.of(res));

        PipelineResult result = new PipelineResult();
        result.setOutputFiles(files);
        result.setHasErrors(true);
        result.setFiltersApplied(true);

        assertSame(files, result.getOutputFiles());
        assertEquals(1, result.getOutputFiles().size());
        assertTrue(result.isHasErrors());
        assertTrue(result.isFiltersApplied());

        // setTempFiles is also generated by @Data.
        List<TempFile> replacement = new ArrayList<>(List.of(tempFileA));
        result.setTempFiles(replacement);
        assertSame(replacement, result.getTempFiles());
    }

    @Test
    @DisplayName("@Data equals/hashCode reflect value equality across all fields")
    void dataEqualsHashCode() {
        PipelineResult a = new PipelineResult();
        PipelineResult b = new PipelineResult();

        // Two freshly constructed instances are equal (empty list, false flags, null outputs).
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-result");

        b.setHasErrors(true);
        assertNotEquals(a, b, "differing flag must break equality");
    }

    @Test
    @DisplayName("@Data toString is non-null and reflects the error flag")
    void dataToString() {
        PipelineResult result = new PipelineResult();
        result.setHasErrors(true);

        String text = result.toString();

        assertNotNull(text);
        assertTrue(text.contains("PipelineResult"), () -> "unexpected toString: " + text);
        assertTrue(text.contains("hasErrors=true"), () -> "unexpected toString: " + text);
    }

    @Test
    @DisplayName("mocked TempFile used here is never a real file (no filesystem dependency)")
    void mockTempFile_isNotReal() {
        // Sanity guard documenting that the collaborator is a Mockito mock; calling close() on it
        // does nothing by default and touches no disk.
        TempFile plain = mock(TempFile.class);
        PipelineResult result = new PipelineResult();
        result.addTempFile(plain);

        assertDoesNotThrow(result::close);
        verify(plain, times(1)).close();
    }
}
