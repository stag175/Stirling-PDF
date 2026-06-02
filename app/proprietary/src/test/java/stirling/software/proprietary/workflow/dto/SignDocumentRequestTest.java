package stirling.software.proprietary.workflow.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

class SignDocumentRequestTest {

    private static WetSignatureMetadata validCanvas(double x, double y, double w, double h) {
        return new WetSignatureMetadata("canvas", "data:image/png;base64,abc==", 0, x, y, w, h);
    }

    private static WetSignatureMetadata validText() {
        return new WetSignatureMetadata("text", "John Doe", 0, 0.1, 0.1, 0.3, 0.2);
    }

    /** A wet signature that will fail validate(): canvas type without the data:image/ prefix. */
    private static WetSignatureMetadata invalidCanvas() {
        return new WetSignatureMetadata(
                "canvas", "raw-base64-without-prefix", 0, 0.0, 0.0, 0.5, 0.5);
    }

    // -------------------------------------------------------------------------
    // hasWetSignatures()
    // -------------------------------------------------------------------------

    @Test
    void hasWetSignatures_nullList_returnsFalse() {
        SignDocumentRequest request = new SignDocumentRequest();
        // wetSignatures defaults to null via the no-arg constructor.
        assertThat(request.getWetSignatures()).isNull();
        assertThat(request.hasWetSignatures()).isFalse();
    }

    @Test
    void hasWetSignatures_emptyList_returnsFalse() {
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(new ArrayList<>());
        assertThat(request.hasWetSignatures()).isFalse();
    }

    @Test
    void hasWetSignatures_nonEmptyList_returnsTrue() {
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(new ArrayList<>(List.of(validCanvas(0.0, 0.0, 0.5, 0.5))));
        assertThat(request.hasWetSignatures()).isTrue();
    }

    // -------------------------------------------------------------------------
    // extractWetSignatureMetadata()
    // -------------------------------------------------------------------------

    @Test
    void extractWetSignatureMetadata_nullList_returnsEmptyList() {
        SignDocumentRequest request = new SignDocumentRequest();

        List<WetSignatureMetadata> result = request.extractWetSignatureMetadata();

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void extractWetSignatureMetadata_emptyList_returnsEmptyList() {
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(new ArrayList<>());

        List<WetSignatureMetadata> result = request.extractWetSignatureMetadata();

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void extractWetSignatureMetadata_allValid_returnsAllSignatures() {
        WetSignatureMetadata a = validCanvas(0.0, 0.0, 0.5, 0.5);
        WetSignatureMetadata b = validText();
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(new ArrayList<>(Arrays.asList(a, b)));

        List<WetSignatureMetadata> result = request.extractWetSignatureMetadata();

        assertThat(result).containsExactly(a, b);
    }

    @Test
    void extractWetSignatureMetadata_returnsNewListInstance_notTheBackingList() {
        List<WetSignatureMetadata> backing =
                new ArrayList<>(List.of(validCanvas(0.0, 0.0, 0.5, 0.5)));
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(backing);

        List<WetSignatureMetadata> result = request.extractWetSignatureMetadata();

        // Same contents but a distinct ArrayList instance (built fresh inside the method).
        assertThat(result).isNotSameAs(backing).containsExactlyElementsOf(backing);
    }

    @Test
    void extractWetSignatureMetadata_invalidSignature_propagatesIllegalArgumentException() {
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(new ArrayList<>(List.of(invalidCanvas())));

        assertThatThrownBy(request::extractWetSignatureMetadata)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("data:image/");
    }

    @Test
    void extractWetSignatureMetadata_invalidAfterValid_throwsAndStopsProcessing() {
        // First element valid, second invalid -> loop processes first then throws on second.
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(
                new ArrayList<>(Arrays.asList(validCanvas(0.0, 0.0, 0.5, 0.5), invalidCanvas())));

        assertThatThrownBy(request::extractWetSignatureMetadata)
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void extractWetSignatureMetadata_doesNotMutateBackingList() {
        List<WetSignatureMetadata> backing =
                new ArrayList<>(List.of(validCanvas(0.0, 0.0, 0.5, 0.5)));
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(backing);

        request.extractWetSignatureMetadata();

        assertThat(request.getWetSignatures()).hasSize(1);
    }

    @Test
    void extractWetSignatureMetadata_singletonImmutableList_isReadButNotMutated() {
        // hasWetSignatures() is true; the method only reads (iterates) the backing list, so an
        // immutable singleton must not trigger UnsupportedOperationException.
        WetSignatureMetadata sig = validCanvas(0.0, 0.0, 0.5, 0.5);
        SignDocumentRequest request = new SignDocumentRequest();
        request.setWetSignatures(Collections.singletonList(sig));

        List<WetSignatureMetadata> result = request.extractWetSignatureMetadata();

        assertThat(result).containsExactly(sig);
    }

    // -------------------------------------------------------------------------
    // Lombok-generated members (constructors / accessors / data methods)
    // -------------------------------------------------------------------------

    @Test
    void noArgConstructor_leavesFieldsNull() {
        SignDocumentRequest request = new SignDocumentRequest();

        assertThat(request.getCertType()).isNull();
        assertThat(request.getP12File()).isNull();
        assertThat(request.getPassword()).isNull();
        assertThat(request.getPrivateKeyFile()).isNull();
        assertThat(request.getCertFile()).isNull();
        assertThat(request.getReason()).isNull();
        assertThat(request.getLocation()).isNull();
        assertThat(request.getWetSignaturesData()).isNull();
        assertThat(request.getWetSignatures()).isNull();
    }

    @Test
    void allArgsConstructor_populatesEveryField() {
        List<WetSignatureMetadata> sigs = List.of(validCanvas(0.0, 0.0, 0.5, 0.5));

        SignDocumentRequest request =
                new SignDocumentRequest(
                        "PKCS12",
                        null, // p12File (MultipartFile) — not needed for pure logic
                        "secret",
                        null, // privateKeyFile
                        null, // certFile
                        "Approval",
                        "London",
                        "[{\"type\":\"canvas\"}]",
                        sigs);

        assertThat(request.getCertType()).isEqualTo("PKCS12");
        assertThat(request.getPassword()).isEqualTo("secret");
        assertThat(request.getReason()).isEqualTo("Approval");
        assertThat(request.getLocation()).isEqualTo("London");
        assertThat(request.getWetSignaturesData()).isEqualTo("[{\"type\":\"canvas\"}]");
        assertThat(request.getWetSignatures()).isSameAs(sigs);
        assertThat(request.hasWetSignatures()).isTrue();
    }

    @Test
    void setters_updateFields() {
        SignDocumentRequest request = new SignDocumentRequest();

        request.setCertType("PEM");
        request.setPassword("pw");
        request.setReason("r");
        request.setLocation("loc");
        request.setWetSignaturesData("[]");

        assertThat(request.getCertType()).isEqualTo("PEM");
        assertThat(request.getPassword()).isEqualTo("pw");
        assertThat(request.getReason()).isEqualTo("r");
        assertThat(request.getLocation()).isEqualTo("loc");
        assertThat(request.getWetSignaturesData()).isEqualTo("[]");
    }

    @Test
    void equalsAndHashCode_areValueBased() {
        SignDocumentRequest a = new SignDocumentRequest();
        a.setCertType("SERVER");
        a.setReason("r");
        SignDocumentRequest b = new SignDocumentRequest();
        b.setCertType("SERVER");
        b.setReason("r");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        b.setReason("different");
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void toString_includesFieldValues() {
        SignDocumentRequest request = new SignDocumentRequest();
        request.setCertType("USER_CERT");

        assertThatCode(request::toString).doesNotThrowAnyException();
        assertThat(request.toString()).contains("USER_CERT");
    }
}
