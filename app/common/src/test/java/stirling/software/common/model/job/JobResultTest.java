package stirling.software.common.model.job;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class JobResultTest {

    @Nested
    @DisplayName("createNew")
    class CreateNewTests {

        @Test
        @DisplayName("should create an incomplete job with the given id and a creation time")
        void shouldCreateIncompleteJob() {
            LocalDateTime before = LocalDateTime.now();

            JobResult result = JobResult.createNew("job-1");

            LocalDateTime after = LocalDateTime.now();

            assertEquals("job-1", result.getJobId());
            assertFalse(result.isComplete());
            assertNull(result.getError());
            assertNull(result.getResult());
            assertNull(result.getResultFiles());
            assertNull(result.getCompletedAt());
            assertNotNull(result.getCreatedAt());
            assertFalse(result.getCreatedAt().isBefore(before));
            assertFalse(result.getCreatedAt().isAfter(after));
        }

        @Test
        @DisplayName("should accept a null job id")
        void shouldAcceptNullJobId() {
            JobResult result = JobResult.createNew(null);

            assertNull(result.getJobId());
            assertFalse(result.isComplete());
            assertNotNull(result.getCreatedAt());
        }

        @Test
        @DisplayName("should start with an empty notes list")
        void shouldStartWithEmptyNotes() {
            JobResult result = JobResult.createNew("job-1");

            assertNotNull(result.getNotes());
            assertTrue(result.getNotes().isEmpty());
        }
    }

    @Nested
    @DisplayName("completeWithResult")
    class CompleteWithResultTests {

        @Test
        @DisplayName("should mark complete, store the result and set completion time")
        void shouldStoreResult() {
            JobResult job = JobResult.createNew("job-1");
            Object payload = "the-result";

            LocalDateTime before = LocalDateTime.now();
            job.completeWithResult(payload);
            LocalDateTime after = LocalDateTime.now();

            assertTrue(job.isComplete());
            assertSame(payload, job.getResult());
            assertNull(job.getError());
            assertNotNull(job.getCompletedAt());
            assertFalse(job.getCompletedAt().isBefore(before));
            assertFalse(job.getCompletedAt().isAfter(after));
        }

        @Test
        @DisplayName("should accept a null result while still marking complete")
        void shouldAcceptNullResult() {
            JobResult job = JobResult.createNew("job-1");

            job.completeWithResult(null);

            assertTrue(job.isComplete());
            assertNull(job.getResult());
            assertNotNull(job.getCompletedAt());
        }

        @Test
        @DisplayName("should not register any files for a non-file result")
        void shouldNotHaveFiles() {
            JobResult job = JobResult.createNew("job-1");

            job.completeWithResult(123);

            assertFalse(job.hasFiles());
            assertFalse(job.hasMultipleFiles());
            assertTrue(job.getAllResultFiles().isEmpty());
        }
    }

    @Nested
    @DisplayName("failWithError")
    class FailWithErrorTests {

        @Test
        @DisplayName("should mark complete, store the error and set completion time")
        void shouldStoreError() {
            JobResult job = JobResult.createNew("job-1");

            LocalDateTime before = LocalDateTime.now();
            job.failWithError("boom");
            LocalDateTime after = LocalDateTime.now();

            assertTrue(job.isComplete());
            assertEquals("boom", job.getError());
            assertNull(job.getResult());
            assertNotNull(job.getCompletedAt());
            assertFalse(job.getCompletedAt().isBefore(before));
            assertFalse(job.getCompletedAt().isAfter(after));
        }

        @Test
        @DisplayName("should accept a null error message")
        void shouldAcceptNullError() {
            JobResult job = JobResult.createNew("job-1");

            job.failWithError(null);

            assertTrue(job.isComplete());
            assertNull(job.getError());
            assertNotNull(job.getCompletedAt());
        }
    }

    @Nested
    @DisplayName("completeWithFiles")
    class CompleteWithFilesTests {

        @Test
        @DisplayName("should mark complete and copy the provided files into an internal list")
        void shouldStoreFiles() {
            JobResult job = JobResult.createNew("job-1");
            ResultFile a = ResultFile.builder().fileId("a").fileName("a.pdf").build();
            ResultFile b = ResultFile.builder().fileId("b").fileName("b.pdf").build();
            List<ResultFile> input = new ArrayList<>(List.of(a, b));

            LocalDateTime before = LocalDateTime.now();
            job.completeWithFiles(input);
            LocalDateTime after = LocalDateTime.now();

            assertTrue(job.isComplete());
            assertNotNull(job.getCompletedAt());
            assertFalse(job.getCompletedAt().isBefore(before));
            assertFalse(job.getCompletedAt().isAfter(after));
            assertTrue(job.hasFiles());
            assertTrue(job.hasMultipleFiles());
            assertEquals(List.of(a, b), job.getAllResultFiles());
        }

        @Test
        @DisplayName("should defensively copy the input list so later mutations do not leak in")
        void shouldDefensivelyCopyInput() {
            JobResult job = JobResult.createNew("job-1");
            ResultFile a = ResultFile.builder().fileId("a").build();
            List<ResultFile> input = new ArrayList<>(List.of(a));

            job.completeWithFiles(input);
            input.add(ResultFile.builder().fileId("b").build());

            assertEquals(1, job.getAllResultFiles().size());
            assertFalse(job.hasMultipleFiles());
        }

        @Test
        @DisplayName("should mark complete with no files for an empty list")
        void shouldHandleEmptyList() {
            JobResult job = JobResult.createNew("job-1");

            job.completeWithFiles(List.of());

            assertTrue(job.isComplete());
            assertNotNull(job.getCompletedAt());
            assertFalse(job.hasFiles());
            assertFalse(job.hasMultipleFiles());
            assertTrue(job.getAllResultFiles().isEmpty());
        }

        @Test
        @DisplayName("should throw NullPointerException when the file list is null")
        void shouldThrowOnNullList() {
            JobResult job = JobResult.createNew("job-1");

            assertThrows(NullPointerException.class, () -> job.completeWithFiles(null));
        }
    }

    @Nested
    @DisplayName("completeWithSingleFile")
    class CompleteWithSingleFileTests {

        @Test
        @DisplayName("should build a single ResultFile from the provided metadata")
        void shouldStoreSingleFile() {
            JobResult job = JobResult.createNew("job-1");

            job.completeWithSingleFile("file-id", "report.pdf", "application/pdf", 2048L);

            assertTrue(job.isComplete());
            assertNotNull(job.getCompletedAt());
            assertTrue(job.hasFiles());
            assertFalse(job.hasMultipleFiles());

            List<ResultFile> files = job.getAllResultFiles();
            assertEquals(1, files.size());
            ResultFile file = files.get(0);
            assertEquals("file-id", file.getFileId());
            assertEquals("report.pdf", file.getFileName());
            assertEquals("application/pdf", file.getContentType());
            assertEquals(2048L, file.getFileSize());
        }

        @Test
        @DisplayName("should allow null metadata fields and a zero file size")
        void shouldAllowNullMetadata() {
            JobResult job = JobResult.createNew("job-1");

            job.completeWithSingleFile(null, null, null, 0L);

            assertTrue(job.hasFiles());
            ResultFile file = job.getAllResultFiles().get(0);
            assertNull(file.getFileId());
            assertNull(file.getFileName());
            assertNull(file.getContentType());
            assertEquals(0L, file.getFileSize());
        }
    }

    @Nested
    @DisplayName("hasFiles / hasMultipleFiles")
    class FileFlagTests {

        @Test
        @DisplayName("should report no files when resultFiles is null")
        void shouldReportNoFilesWhenNull() {
            JobResult job = JobResult.createNew("job-1");

            assertNull(job.getResultFiles());
            assertFalse(job.hasFiles());
            assertFalse(job.hasMultipleFiles());
        }

        @Test
        @DisplayName("should report no files when resultFiles is empty")
        void shouldReportNoFilesWhenEmpty() {
            JobResult job = JobResult.createNew("job-1");
            job.setResultFiles(new ArrayList<>());

            assertFalse(job.hasFiles());
            assertFalse(job.hasMultipleFiles());
        }

        @Test
        @DisplayName("should report files but not multiple for a single file")
        void shouldReportSingleFile() {
            JobResult job = JobResult.createNew("job-1");
            job.setResultFiles(new ArrayList<>(List.of(ResultFile.builder().fileId("a").build())));

            assertTrue(job.hasFiles());
            assertFalse(job.hasMultipleFiles());
        }

        @Test
        @DisplayName("should report multiple files for two or more files")
        void shouldReportMultipleFiles() {
            JobResult job = JobResult.createNew("job-1");
            job.setResultFiles(
                    new ArrayList<>(
                            List.of(
                                    ResultFile.builder().fileId("a").build(),
                                    ResultFile.builder().fileId("b").build())));

            assertTrue(job.hasFiles());
            assertTrue(job.hasMultipleFiles());
        }
    }

    @Nested
    @DisplayName("getAllResultFiles")
    class GetAllResultFilesTests {

        @Test
        @DisplayName("should return an empty list when there are no files")
        void shouldReturnEmptyWhenNoFiles() {
            JobResult job = JobResult.createNew("job-1");

            assertTrue(job.getAllResultFiles().isEmpty());
        }

        @Test
        @DisplayName("should return an empty list when resultFiles is set but empty")
        void shouldReturnEmptyWhenFilesEmpty() {
            JobResult job = JobResult.createNew("job-1");
            job.setResultFiles(new ArrayList<>());

            assertTrue(job.getAllResultFiles().isEmpty());
        }

        @Test
        @DisplayName("should return an unmodifiable list when files are present")
        void shouldReturnUnmodifiableList() {
            JobResult job = JobResult.createNew("job-1");
            job.completeWithFiles(List.of(ResultFile.builder().fileId("a").build()));

            List<ResultFile> files = job.getAllResultFiles();

            assertEquals(1, files.size());
            assertThrows(
                    UnsupportedOperationException.class,
                    () -> files.add(ResultFile.builder().fileId("b").build()));
        }
    }

    @Nested
    @DisplayName("notes")
    class NotesTests {

        @Test
        @DisplayName("should add notes in order")
        void shouldAddNotesInOrder() {
            JobResult job = JobResult.createNew("job-1");

            job.addNote("first");
            job.addNote("second");

            assertEquals(List.of("first", "second"), job.getNotes());
        }

        @Test
        @DisplayName("should allow duplicate and null notes")
        void shouldAllowDuplicateAndNullNotes() {
            JobResult job = JobResult.createNew("job-1");

            job.addNote("dup");
            job.addNote("dup");
            job.addNote(null);

            List<String> notes = job.getNotes();
            assertEquals(3, notes.size());
            assertEquals("dup", notes.get(0));
            assertEquals("dup", notes.get(1));
            assertNull(notes.get(2));
        }

        @Test
        @DisplayName("should return an unmodifiable view of the notes")
        void shouldReturnUnmodifiableView() {
            JobResult job = JobResult.createNew("job-1");
            job.addNote("note");

            List<String> notes = job.getNotes();

            assertThrows(UnsupportedOperationException.class, () -> notes.add("nope"));
        }

        @Test
        @DisplayName("view should reflect notes added after it was obtained")
        void viewShouldReflectLaterAdditions() {
            JobResult job = JobResult.createNew("job-1");
            List<String> view = job.getNotes();

            assertTrue(view.isEmpty());
            job.addNote("late");

            assertEquals(1, view.size());
            assertEquals("late", view.get(0));
        }

        @Test
        @DisplayName("should retain every note when added concurrently from many threads")
        void shouldBeThreadSafe() throws InterruptedException {
            JobResult job = JobResult.createNew("job-1");
            int threads = 8;
            int notesPerThread = 200;

            ExecutorService executor = Executors.newFixedThreadPool(threads);
            CountDownLatch start = new CountDownLatch(1);
            CountDownLatch done = new CountDownLatch(threads);

            try {
                for (int t = 0; t < threads; t++) {
                    final int threadId = t;
                    executor.submit(
                            () -> {
                                try {
                                    start.await();
                                    for (int i = 0; i < notesPerThread; i++) {
                                        job.addNote("t" + threadId + "-n" + i);
                                    }
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                } finally {
                                    done.countDown();
                                }
                            });
                }

                start.countDown();
                assertTrue(done.await(10, TimeUnit.SECONDS), "threads did not finish in time");
            } finally {
                executor.shutdownNow();
            }

            assertEquals(threads * notesPerThread, job.getNotes().size());
        }
    }

    @Nested
    @DisplayName("Lombok equals/hashCode")
    class EqualityTests {

        @Test
        @DisplayName("two job results with identical state should be equal")
        void shouldBeEqualForIdenticalState() {
            LocalDateTime created = LocalDateTime.of(2025, 1, 1, 0, 0, 0);
            JobResult a =
                    JobResult.builder().jobId("job-1").complete(false).createdAt(created).build();
            JobResult b =
                    JobResult.builder().jobId("job-1").complete(false).createdAt(created).build();

            assertEquals(a, b);
            assertEquals(a.hashCode(), b.hashCode());
        }

        @Test
        @DisplayName("job results with different ids should not be equal")
        void shouldNotBeEqualForDifferentIds() {
            JobResult a = JobResult.builder().jobId("job-1").build();
            JobResult b = JobResult.builder().jobId("job-2").build();

            assertNotEquals(a, b);
        }
    }
}
