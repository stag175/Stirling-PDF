package stirling.software.proprietary.security.model.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.GeneralFile;

class EmailTest {

    private static MultipartFile file(String name, String content) {
        return new MockMultipartFile(
                "fileInput", name, "application/pdf", content.getBytes());
    }

    private static Email sample() {
        Email email = new Email();
        email.setTo("recipient@example.com");
        email.setSubject("Hello");
        email.setBody("World");
        email.setFileInput(file("doc.pdf", "data"));
        return email;
    }

    // -------------------------------------------------------------------------
    // Construction / defaults
    // -------------------------------------------------------------------------

    @Test
    void noArgsConstructor_leavesAllFieldsNull() {
        // The @Schema defaultValue annotations are documentation only; no Java
        // field initializers exist, so a fresh instance is entirely null.
        Email email = new Email();

        assertNull(email.getTo());
        assertNull(email.getSubject());
        assertNull(email.getBody());
        assertNull(email.getFileInput());
    }

    @Test
    void isInstanceOfGeneralFile() {
        assertTrue(new Email() instanceof GeneralFile);
    }

    // -------------------------------------------------------------------------
    // Getters / setters (own + inherited)
    // -------------------------------------------------------------------------

    @Test
    void settersAndGetters_roundTripOwnFields() {
        Email email = new Email();

        email.setTo("user@domain.test");
        email.setSubject("Subject line");
        email.setBody("<p>Body</p>");

        assertEquals("user@domain.test", email.getTo());
        assertEquals("Subject line", email.getSubject());
        assertEquals("<p>Body</p>", email.getBody());
    }

    @Test
    void setter_acceptsNullForOwnFields() {
        Email email = sample();

        email.setTo(null);
        email.setSubject(null);
        email.setBody(null);

        assertNull(email.getTo());
        assertNull(email.getSubject());
        assertNull(email.getBody());
    }

    @Test
    void setter_acceptsEmptyStrings() {
        Email email = new Email();

        email.setTo("");
        email.setSubject("");
        email.setBody("");

        assertEquals("", email.getTo());
        assertEquals("", email.getSubject());
        assertEquals("", email.getBody());
    }

    @Test
    void inheritedFileInputSetterGetter_roundTrips() {
        MultipartFile mf = file("report.pdf", "pdf-bytes");
        Email email = new Email();

        email.setFileInput(mf);

        assertEquals(mf, email.getFileInput());
    }

    // -------------------------------------------------------------------------
    // equals / hashCode  (callSuper = true => fileInput participates)
    // -------------------------------------------------------------------------

    @Test
    void equalsAndHashCode_equalWhenAllFieldsMatch_sharedFileReference() {
        MultipartFile shared = file("doc.pdf", "data");

        Email a = new Email();
        a.setTo("r@x.com");
        a.setSubject("S");
        a.setBody("B");
        a.setFileInput(shared);

        Email b = new Email();
        b.setTo("r@x.com");
        b.setSubject("S");
        b.setBody("B");
        b.setFileInput(shared);

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void equals_isReflexive() {
        Email a = sample();
        assertEquals(a, a);
    }

    @Test
    void equals_twoFreshInstances_areEqual() {
        // Both all-null, including inherited fileInput.
        assertEquals(new Email(), new Email());
        assertEquals(new Email().hashCode(), new Email().hashCode());
    }

    @Test
    void equals_differsWhenToDiffers() {
        Email a = new Email();
        a.setTo("a@x.com");
        Email b = new Email();
        b.setTo("b@x.com");

        assertNotEquals(a, b);
    }

    @Test
    void equals_differsWhenSubjectDiffers() {
        Email a = new Email();
        a.setSubject("one");
        Email b = new Email();
        b.setSubject("two");

        assertNotEquals(a, b);
    }

    @Test
    void equals_differsWhenBodyDiffers() {
        Email a = new Email();
        a.setBody("body-a");
        Email b = new Email();
        b.setBody("body-b");

        assertNotEquals(a, b);
    }

    @Test
    void equals_differsWhenInheritedFileInputDiffers() {
        // callSuper = true: the superclass fileInput field affects equality.
        Email a = new Email();
        a.setFileInput(file("one.pdf", "aaa"));
        Email b = new Email();
        b.setFileInput(file("two.pdf", "bbb"));

        assertNotEquals(a, b);
    }

    @Test
    void equals_returnsFalseForNullAndOtherType() {
        Email a = sample();

        assertNotEquals(a, null);
        assertNotEquals(a, "recipient@example.com");
    }

    @Test
    void equals_distinguishesNullVsNonNullField() {
        Email withSubject = new Email();
        withSubject.setSubject("present");
        Email withoutSubject = new Email();

        assertNotEquals(withSubject, withoutSubject);
    }

    // -------------------------------------------------------------------------
    // toString
    // -------------------------------------------------------------------------

    @Test
    void toString_containsClassNameAndOwnFieldValues() {
        Email email = new Email();
        email.setTo("contact@example.org");
        email.setSubject("Greetings");
        email.setBody("Message body");

        String text = email.toString();

        assertTrue(text.contains("Email"));
        assertTrue(text.contains("contact@example.org"));
        assertTrue(text.contains("Greetings"));
        assertTrue(text.contains("Message body"));
    }

    @Test
    void canEqual_trueForSameType_falseForUnrelatedType() {
        Email a = new Email();
        Email b = new Email();

        // Lombok-generated canEqual underpins symmetric equals for the hierarchy.
        assertTrue(a.canEqual(b));
        assertTrue(!a.canEqual("not an email"));
    }
}
