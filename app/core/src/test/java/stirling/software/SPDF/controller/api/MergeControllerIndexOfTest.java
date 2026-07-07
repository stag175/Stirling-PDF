package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class MergeControllerIndexOfTest {

    private static MultipartFile file(String originalFilename) {
        return new MockMultipartFile("file", originalFilename, "application/pdf", new byte[] {1});
    }

    @Test
    @DisplayName("returns the index of the first file matching the original filename")
    void findsMatch() {
        List<MultipartFile> files = List.of(file("a.pdf"), file("b.pdf"), file("c.pdf"));
        assertEquals(0, MergeController.indexOfByOriginalFilename(files, "a.pdf"));
        assertEquals(1, MergeController.indexOfByOriginalFilename(files, "b.pdf"));
        assertEquals(2, MergeController.indexOfByOriginalFilename(files, "c.pdf"));
    }

    @Test
    @DisplayName("returns -1 when no file matches")
    void notFound() {
        List<MultipartFile> files = List.of(file("a.pdf"), file("b.pdf"));
        assertEquals(-1, MergeController.indexOfByOriginalFilename(files, "missing.pdf"));
    }

    @Test
    @DisplayName("returns -1 for an empty list")
    void emptyList() {
        assertEquals(-1, MergeController.indexOfByOriginalFilename(List.of(), "a.pdf"));
    }

    @Test
    @DisplayName("returns the first index when filenames are duplicated")
    void firstDuplicateWins() {
        List<MultipartFile> files = List.of(file("dup.pdf"), file("other.pdf"), file("dup.pdf"));
        assertEquals(0, MergeController.indexOfByOriginalFilename(files, "dup.pdf"));
    }

    @Test
    @DisplayName("matching is case-sensitive (exact filename only)")
    void caseSensitive() {
        List<MultipartFile> files = List.of(file("Doc.pdf"));
        assertEquals(-1, MergeController.indexOfByOriginalFilename(files, "doc.pdf"));
        assertEquals(0, MergeController.indexOfByOriginalFilename(files, "Doc.pdf"));
    }
}
