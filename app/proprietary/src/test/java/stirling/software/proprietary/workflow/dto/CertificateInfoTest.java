package stirling.software.proprietary.workflow.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Date;

import org.junit.jupiter.api.Test;

class CertificateInfoTest {

    private static final long EPOCH_BEFORE = 1_000_000_000_000L; // 2001-09-09T01:46:40Z
    private static final long EPOCH_AFTER = 2_000_000_000_000L; // 2033-05-18T03:33:20Z

    private static CertificateInfo sample() {
        return new CertificateInfo(
                "CN=Alice", "CN=Root CA", new Date(EPOCH_BEFORE), new Date(EPOCH_AFTER), false);
    }

    // -------------------------------------------------------------------------
    // Component accessors
    // -------------------------------------------------------------------------

    @Test
    void accessors_returnConstructorArguments() {
        Date notBefore = new Date(EPOCH_BEFORE);
        Date notAfter = new Date(EPOCH_AFTER);

        CertificateInfo info =
                new CertificateInfo("CN=Alice", "CN=Root CA", notBefore, notAfter, true);

        assertThat(info.subjectName()).isEqualTo("CN=Alice");
        assertThat(info.issuerName()).isEqualTo("CN=Root CA");
        assertThat(info.notBefore()).isEqualTo(notBefore);
        assertThat(info.notAfter()).isEqualTo(notAfter);
        assertThat(info.selfSigned()).isTrue();
    }

    @Test
    void selfSigned_false_isPreserved() {
        assertThat(sample().selfSigned()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Null / empty components (record has no compact constructor — nulls allowed)
    // -------------------------------------------------------------------------

    @Test
    void allNullableComponents_acceptNull() {
        CertificateInfo info = new CertificateInfo(null, null, null, null, false);

        assertThat(info.subjectName()).isNull();
        assertThat(info.issuerName()).isNull();
        assertThat(info.notBefore()).isNull();
        assertThat(info.notAfter()).isNull();
        assertThat(info.selfSigned()).isFalse();
    }

    @Test
    void emptyStringNames_arePreserved() {
        CertificateInfo info =
                new CertificateInfo("", "", new Date(EPOCH_BEFORE), new Date(EPOCH_AFTER), true);

        assertThat(info.subjectName()).isEmpty();
        assertThat(info.issuerName()).isEmpty();
    }

    // -------------------------------------------------------------------------
    // equals / hashCode (value semantics)
    // -------------------------------------------------------------------------

    @Test
    void equals_and_hashCode_basedOnAllComponents() {
        CertificateInfo a = sample();
        CertificateInfo b = sample();

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_isReflexive() {
        CertificateInfo a = sample();
        assertThat(a).isEqualTo(a);
    }

    @Test
    void equals_differsWhenSubjectNameDiffers() {
        CertificateInfo a = sample();
        CertificateInfo b =
                new CertificateInfo(
                        "CN=Bob",
                        "CN=Root CA",
                        new Date(EPOCH_BEFORE),
                        new Date(EPOCH_AFTER),
                        false);

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenSelfSignedDiffers() {
        CertificateInfo notSelfSigned = sample();
        CertificateInfo selfSigned =
                new CertificateInfo(
                        "CN=Alice",
                        "CN=Root CA",
                        new Date(EPOCH_BEFORE),
                        new Date(EPOCH_AFTER),
                        true);

        assertThat(notSelfSigned).isNotEqualTo(selfSigned);
    }

    @Test
    void equals_differsWhenNotAfterDiffers() {
        CertificateInfo a = sample();
        CertificateInfo b =
                new CertificateInfo(
                        "CN=Alice",
                        "CN=Root CA",
                        new Date(EPOCH_BEFORE),
                        new Date(EPOCH_AFTER + 1),
                        false);

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_distinguishesNullVsNonNullComponent() {
        CertificateInfo withSubject = sample();
        CertificateInfo withoutSubject =
                new CertificateInfo(
                        null, "CN=Root CA", new Date(EPOCH_BEFORE), new Date(EPOCH_AFTER), false);

        assertThat(withSubject).isNotEqualTo(withoutSubject);
    }

    @Test
    void equals_twoAllNullRecords_areEqual() {
        CertificateInfo a = new CertificateInfo(null, null, null, null, true);
        CertificateInfo b = new CertificateInfo(null, null, null, null, true);

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_returnsFalseForNullAndOtherType() {
        CertificateInfo a = sample();

        assertThat(a).isNotEqualTo(null);
        assertThat(a).isNotEqualTo("CN=Alice");
    }

    // -------------------------------------------------------------------------
    // toString
    // -------------------------------------------------------------------------

    @Test
    void toString_containsComponentValues() {
        String text = sample().toString();

        assertThat(text)
                .contains("CertificateInfo")
                .contains("CN=Alice")
                .contains("CN=Root CA")
                .contains("selfSigned=false");
    }

    // -------------------------------------------------------------------------
    // Date reference handling (records do NOT defensively copy)
    // -------------------------------------------------------------------------

    @Test
    void notBefore_returnsSameInstance_recordDoesNotDefensivelyCopy() {
        Date notBefore = new Date(EPOCH_BEFORE);
        CertificateInfo info =
                new CertificateInfo(
                        "CN=Alice", "CN=Root CA", notBefore, new Date(EPOCH_AFTER), false);

        assertThat(info.notBefore()).isSameAs(notBefore);
    }

    @Test
    void mutatingSharedDate_changesAccessorResult_dueToReferenceSemantics() {
        Date notAfter = new Date(EPOCH_AFTER);
        CertificateInfo info =
                new CertificateInfo(
                        "CN=Alice", "CN=Root CA", new Date(EPOCH_BEFORE), notAfter, false);

        notAfter.setTime(EPOCH_AFTER + 5000L);

        assertThat(info.notAfter().getTime()).isEqualTo(EPOCH_AFTER + 5000L);
    }
}
