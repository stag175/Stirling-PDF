package stirling.software.proprietary.storage.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFileBlob;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

@ExtendWith(MockitoExtension.class)
class DatabaseStorageProviderTest {

    private static final String UUID_REGEX =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    @Mock private StoredFileBlobRepository repository;

    private DatabaseStorageProvider newProvider() {
        return new DatabaseStorageProvider(repository);
    }

    // ----- store -----

    @Test
    void store_buildsStoredObjectWithRandomKeyAndPreservesMetadata() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        User owner = new User();
        owner.setId(42L);
        byte[] content = "hello db".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", "sample.pdf", "application/pdf", content);

        StoredObject stored = provider.store(owner, file);

        // Storage key is a freshly generated UUID, never derived from the filename.
        assertThat(stored.getStorageKey()).matches(UUID_REGEX);
        assertThat(stored.getStorageKey()).doesNotContain("sample.pdf");
        assertThat(stored.getOriginalFilename()).isEqualTo("sample.pdf");
        assertThat(stored.getContentType()).isEqualTo("application/pdf");
        assertThat(stored.getSizeBytes()).isEqualTo(content.length);
    }

    @Test
    void store_persistsBlobWithSameKeyAndRawBytes() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        User owner = new User();
        owner.setId(7L);
        byte[] content = new byte[] {1, 2, 3, 4, 5};
        MockMultipartFile file =
                new MockMultipartFile("file", "blob.bin", "application/octet-stream", content);

        StoredObject stored = provider.store(owner, file);

        ArgumentCaptor<StoredFileBlob> captor = ArgumentCaptor.forClass(StoredFileBlob.class);
        verify(repository).save(captor.capture());
        StoredFileBlob saved = captor.getValue();
        // The persisted blob's key must match the returned StoredObject key exactly.
        assertThat(saved.getStorageKey()).isEqualTo(stored.getStorageKey());
        assertThat(saved.getStorageKey()).matches(UUID_REGEX);
        assertThat(saved.getData()).isEqualTo(content);
    }

    @Test
    void store_generatesDistinctKeysAcrossInvocations() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        User owner = new User();
        owner.setId(1L);
        MockMultipartFile file =
                new MockMultipartFile("file", "a.pdf", "application/pdf", new byte[] {9});

        StoredObject first = provider.store(owner, file);
        StoredObject second = provider.store(owner, file);

        assertThat(first.getStorageKey()).isNotEqualTo(second.getStorageKey());
        verify(repository, org.mockito.Mockito.times(2)).save(any(StoredFileBlob.class));
    }

    @Test
    void store_handlesNullFilenameAndContentTypeAndEmptyBytes() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        User owner = new User();
        owner.setId(5L);
        // MockMultipartFile with null name/contentType => getOriginalFilename()/getContentType()
        // return null, getSize() == 0, getBytes() == empty array.
        MockMultipartFile file = new MockMultipartFile("file", null, null, new byte[0]);

        StoredObject stored = provider.store(owner, file);

        assertThat(stored.getStorageKey()).matches(UUID_REGEX);
        // Spring's MockMultipartFile coerces a null originalFilename to "" (but leaves
        // contentType null), so the stored filename round-trips as an empty string.
        assertThat(stored.getOriginalFilename()).isEmpty();
        assertThat(stored.getContentType()).isNull();
        assertThat(stored.getSizeBytes()).isZero();

        ArgumentCaptor<StoredFileBlob> captor = ArgumentCaptor.forClass(StoredFileBlob.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getData()).isEmpty();
    }

    @Test
    void store_propagatesIOExceptionFromGetBytes_andSkipsSave() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        MultipartFile file = org.mockito.Mockito.mock(MultipartFile.class);
        when(file.getBytes()).thenThrow(new IOException("read failure"));

        assertThatThrownBy(() -> provider.store(new User(), file))
                .isInstanceOf(IOException.class)
                .hasMessage("read failure");

        // Save must never run when reading the upload bytes fails.
        verify(repository, never()).save(any());
    }

    // ----- load -----

    @Test
    void load_returnsByteArrayResourceWithBlobData() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        byte[] content = "loaded content".getBytes(StandardCharsets.UTF_8);
        StoredFileBlob blob = new StoredFileBlob();
        blob.setStorageKey("key-1");
        blob.setData(content);
        when(repository.findById("key-1")).thenReturn(Optional.of(blob));

        Resource resource = provider.load("key-1");

        assertThat(resource).isNotNull();
        assertThat(resource.contentLength()).isEqualTo(content.length);
        try (InputStream in = resource.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void load_unknownKey_throwsIOException() {
        DatabaseStorageProvider provider = newProvider();
        when(repository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> provider.load("missing"))
                .isInstanceOf(IOException.class)
                .hasMessage("File not found");
    }

    // ----- delete -----

    @Test
    void delete_existingKey_deletesById() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        when(repository.existsById("present")).thenReturn(true);

        provider.delete("present");

        verify(repository).existsById("present");
        verify(repository).deleteById("present");
        verifyNoMoreInteractions(repository);
    }

    @Test
    void delete_absentKey_isNoOp() throws Exception {
        DatabaseStorageProvider provider = newProvider();
        when(repository.existsById("ghost")).thenReturn(false);

        provider.delete("ghost");

        verify(repository).existsById("ghost");
        verify(repository, never()).deleteById(any());
        verifyNoMoreInteractions(repository);
    }
}
