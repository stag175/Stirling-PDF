package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

/**
 * Unit tests for {@link SignPDFWithCertRequest}, a Lombok {@code @Data}
 * {@code @EqualsAndHashCode(callSuper = true)} DTO that extends {@link
 * stirling.software.common.model.api.PDFFile}.
 *
 * <p>The class declares no Bean Validation annotations on its own fields (only {@code @Schema}
 * documentation), so the only validation constraint reachable from an instance is the inherited
 * {@code @AssertTrue isValid()} on {@code PDFFile}. The bulk of the coverage therefore targets the
 * Lombok-generated getters/setters, {@code equals}/{@code hashCode} (including the {@code
 * callSuper=true} contribution of inherited fields) and {@code toString}.
 */
class SignPDFWithCertRequestTest {

    private static Validator validator;

    private SignPDFWithCertRequest request;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new SignPDFWithCertRequest();
    }

    // ---------------------------------------------------------------------
    // POJO accessor / default-state behaviour
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("All declared subclass fields default to null on a fresh instance")
    void subclassFieldsDefaultToNull() {
        assertNull(request.getCertType());
        assertNull(request.getPrivateKeyFile());
        assertNull(request.getCertFile());
        assertNull(request.getP12File());
        assertNull(request.getJksFile());
        assertNull(request.getPassword());
        assertNull(request.getShowSignature());
        assertNull(request.getReason());
        assertNull(request.getLocation());
        assertNull(request.getName());
        assertNull(request.getPageNumber());
        assertNull(request.getShowLogo());
    }

    @Test
    @DisplayName("Inherited fields default to null (fileInput, fileId)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileInput(), "inherited from PDFFile");
        assertNull(request.getFileId(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return values set via setters across every subclass field")
    void gettersReturnSetValues() {
        MultipartFile privateKey =
                new MockMultipartFile("privateKeyFile", "key.pem", "application/x-pem-file",
                        new byte[] {1, 2, 3});
        MultipartFile cert =
                new MockMultipartFile("certFile", "cert.crt", "application/x-x509-ca-cert",
                        new byte[] {4, 5, 6});
        MultipartFile p12 =
                new MockMultipartFile("p12File", "store.p12", "application/x-pkcs12",
                        new byte[] {7, 8, 9});
        MultipartFile jks =
                new MockMultipartFile("jksFile", "store.jks", "application/octet-stream",
                        new byte[] {10, 11, 12});

        request.setCertType("PEM");
        request.setPrivateKeyFile(privateKey);
        request.setCertFile(cert);
        request.setP12File(p12);
        request.setJksFile(jks);
        request.setPassword("s3cr3t");
        request.setShowSignature(Boolean.TRUE);
        request.setReason("Signed by SPDF");
        request.setLocation("SPDF");
        request.setName("SPDF");
        request.setPageNumber(3);
        request.setShowLogo(Boolean.FALSE);

        assertEquals("PEM", request.getCertType());
        assertSame(privateKey, request.getPrivateKeyFile());
        assertSame(cert, request.getCertFile());
        assertSame(p12, request.getP12File());
        assertSame(jks, request.getJksFile());
        assertEquals("s3cr3t", request.getPassword());
        assertEquals(Boolean.TRUE, request.getShowSignature());
        assertEquals("Signed by SPDF", request.getReason());
        assertEquals("SPDF", request.getLocation());
        assertEquals("SPDF", request.getName());
        assertEquals(3, request.getPageNumber());
        assertEquals(Boolean.FALSE, request.getShowLogo());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy")
    void inheritedSettersAndGetters() {
        MultipartFile file =
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf",
                        new byte[] {1, 2, 3});
        request.setFileInput(file);
        request.setFileId("file-123");

        assertSame(file, request.getFileInput());
        assertEquals("file-123", request.getFileId());
    }

    @Test
    @DisplayName("Boolean flags accept all three states: TRUE, FALSE and null")
    void booleanFlagsAcceptAllStates() {
        request.setShowSignature(Boolean.TRUE);
        request.setShowLogo(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getShowSignature());
        assertEquals(Boolean.TRUE, request.getShowLogo());

        request.setShowSignature(Boolean.FALSE);
        request.setShowLogo(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getShowSignature());
        assertEquals(Boolean.FALSE, request.getShowLogo());

        request.setShowSignature(null);
        request.setShowLogo(null);
        assertNull(request.getShowSignature());
        assertNull(request.getShowLogo());
    }

    @Test
    @DisplayName("Nullable reference fields can be reset to null after being set")
    void nullableFieldsAcceptNull() {
        request.setCertType("PKCS12");
        request.setCertType(null);
        assertNull(request.getCertType());

        request.setPassword("pw");
        request.setPassword(null);
        assertNull(request.getPassword());

        request.setPageNumber(5);
        request.setPageNumber(null);
        assertNull(request.getPageNumber());

        MultipartFile p12 =
                new MockMultipartFile("p12File", "store.p12", "application/x-pkcs12",
                        new byte[] {1});
        request.setP12File(p12);
        request.setP12File(null);
        assertNull(request.getP12File());
    }

    @Test
    @DisplayName("Each supported certType allowable value round-trips through the setter")
    void certTypeAllowableValuesRoundTrip() {
        for (String type : new String[] {"PEM", "PKCS12", "PFX", "JKS", "SERVER"}) {
            request.setCertType(type);
            assertEquals(type, request.getCertType());
        }
    }

    // ---------------------------------------------------------------------
    // Inherited Bean Validation: PDFFile @AssertTrue isValid()
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when neither fileInput nor fileId set")
    void inheritedAssertTrue_failsWhenNoFileProvided() {
        SignPDFWithCertRequest req = new SignPDFWithCertRequest();
        req.setCertType("PEM");

        Set<ConstraintViolation<SignPDFWithCertRequest>> violations = validator.validate(req);

        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(
                hasValidViolation,
                () ->
                        "Expected inherited @AssertTrue 'valid' violation, got: "
                                + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue passes when only fileId is provided")
    void inheritedAssertTrue_passesWithFileId() {
        SignPDFWithCertRequest req = new SignPDFWithCertRequest();
        req.setFileId("server-file-1");

        assertFalse(
                hasViolation(req, "valid"),
                () -> "Did not expect a 'valid' violation, got: " + describe(validator.validate(req)));
    }

    @Test
    @DisplayName("Inherited @AssertTrue passes when only fileInput is provided")
    void inheritedAssertTrue_passesWithFileInput() {
        SignPDFWithCertRequest req = new SignPDFWithCertRequest();
        req.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf",
                        new byte[] {1, 2, 3}));

        assertFalse(hasViolation(req, "valid"));
    }

    @Test
    @DisplayName("Inherited @AssertTrue fails when BOTH fileInput and fileId are provided")
    void inheritedAssertTrue_failsWhenBothProvided() {
        SignPDFWithCertRequest req = new SignPDFWithCertRequest();
        req.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf",
                        new byte[] {1, 2, 3}));
        req.setFileId("server-file-1");

        assertTrue(
                hasViolation(req, "valid"),
                () -> "Expected a 'valid' violation, got: " + describe(validator.validate(req)));
    }

    @Test
    @DisplayName("Inherited @AssertTrue fails when fileId is present but blank (whitespace)")
    void inheritedAssertTrue_failsWhenFileIdBlank() {
        SignPDFWithCertRequest req = new SignPDFWithCertRequest();
        req.setFileId("   ");

        assertTrue(hasViolation(req, "valid"));
    }

    @Test
    @DisplayName("A request with a valid file source produces no violations at all")
    void fullyValidRequest_noViolations() {
        SignPDFWithCertRequest req = buildPopulated();

        Set<ConstraintViolation<SignPDFWithCertRequest>> violations = validator.validate(req);
        assertTrue(violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString (Lombok @Data + @EqualsAndHashCode(callSuper=true))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        SignPDFWithCertRequest other = new SignPDFWithCertRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only String field breaks equality")
    void notEqualWhenCertTypeDiffers() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setCertType("JKS");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on a subclass Boolean flag breaks equality")
    void notEqualWhenShowSignatureDiffers() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setShowSignature(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the Integer pageNumber field breaks equality")
    void notEqualWhenPageNumberDiffers() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setPageNumber(99);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("hashCode differs when a subclass field differs")
    void hashCodeReflectsSubclassField() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();
        b.setPassword("a-different-password");

        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: not equal to null and to an unrelated type")
    void notEqualToNullOrOtherType() {
        assertNotEquals(null, request);
        assertNotEquals("a string", request);
    }

    @Test
    @DisplayName("equals: equal to a bare PDFFile parent instance is false (canEqual/type guard)")
    void notEqualToBareParentInstance() {
        // A SignPDFWithCertRequest is never equal to a plain PDFFile: Lombok's generated
        // canEqual guards against cross-type equality even when inherited state matches.
        stirling.software.common.model.api.PDFFile parent =
                new stirling.software.common.model.api.PDFFile();
        assertNotEquals(request, parent);
    }

    @Test
    @DisplayName("equals: reflexive and symmetric")
    void reflexiveAndSymmetric() {
        SignPDFWithCertRequest a = buildPopulated();
        SignPDFWithCertRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative subclass field name")
    void toStringContainsFieldNames() {
        request.setCertType("PEM");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("certType"), () -> "Unexpected toString: " + text);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Builds a fully-populated, valid request. A non-empty {@code fileId} (and no {@code fileInput})
     * satisfies the inherited {@link stirling.software.common.model.api.PDFFile} {@code @AssertTrue
     * isValid()} constraint. Note: {@link MultipartFile} fields are deliberately left null here so
     * that two independently-built instances are {@code equals}; {@code MockMultipartFile} does not
     * override {@code equals}, so two separate mock instances would never compare equal.
     */
    private SignPDFWithCertRequest buildPopulated() {
        SignPDFWithCertRequest r = new SignPDFWithCertRequest();
        r.setCertType("PEM");
        r.setPassword("s3cr3t");
        r.setShowSignature(Boolean.TRUE);
        r.setReason("Signed by SPDF");
        r.setLocation("SPDF");
        r.setName("SPDF");
        r.setPageNumber(1);
        r.setShowLogo(Boolean.TRUE);
        r.setFileId("file-1");
        return r;
    }

    private static boolean hasViolation(SignPDFWithCertRequest req, String property) {
        return validator.validate(req).stream()
                .anyMatch(v -> property.contentEquals(v.getPropertyPath().toString()));
    }

    private static String describe(Set<ConstraintViolation<SignPDFWithCertRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }
}
