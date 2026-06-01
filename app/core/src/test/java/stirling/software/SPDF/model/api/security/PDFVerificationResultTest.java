package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.PDFVerificationResult.ValidationIssue;

class PDFVerificationResultTest {

    @Test
    @DisplayName("no-args constructor yields default primitives and empty (non-null) lists")
    void noArgsConstructor_defaults() {
        PDFVerificationResult result = new PDFVerificationResult();

        assertNull(result.getStandard());
        assertNull(result.getStandardName());
        assertNull(result.getValidationProfile());
        assertNull(result.getValidationProfileName());
        assertNull(result.getComplianceSummary());
        assertFalse(result.isDeclaredPdfa());
        assertFalse(result.isCompliant());
        assertEquals(0, result.getTotalFailures());
        assertEquals(0, result.getTotalWarnings());
        assertNotNull(result.getFailures(), "failures list must default to a non-null list");
        assertNotNull(result.getWarnings(), "warnings list must default to a non-null list");
        assertTrue(result.getFailures().isEmpty());
        assertTrue(result.getWarnings().isEmpty());
    }

    @Test
    @DisplayName("addFailure appends to the list and keeps totalFailures in sync with list size")
    void addFailure_keepsTotalInSyncWithListSize() {
        PDFVerificationResult result = new PDFVerificationResult();

        ValidationIssue first = new ValidationIssue();
        ValidationIssue second = new ValidationIssue();

        result.addFailure(first);
        assertEquals(1, result.getFailures().size());
        assertEquals(1, result.getTotalFailures(), "totalFailures must equal failures.size()");
        assertSame(first, result.getFailures().get(0));

        result.addFailure(second);
        assertEquals(2, result.getFailures().size());
        assertEquals(2, result.getTotalFailures(), "totalFailures must equal failures.size()");
        assertSame(second, result.getFailures().get(1));
        // warnings must remain untouched by addFailure
        assertEquals(0, result.getTotalWarnings());
        assertTrue(result.getWarnings().isEmpty());
    }

    @Test
    @DisplayName("addWarning appends to the list and keeps totalWarnings in sync with list size")
    void addWarning_keepsTotalInSyncWithListSize() {
        PDFVerificationResult result = new PDFVerificationResult();

        ValidationIssue first = new ValidationIssue();
        ValidationIssue second = new ValidationIssue();

        result.addWarning(first);
        assertEquals(1, result.getWarnings().size());
        assertEquals(1, result.getTotalWarnings(), "totalWarnings must equal warnings.size()");
        assertSame(first, result.getWarnings().get(0));

        result.addWarning(second);
        assertEquals(2, result.getWarnings().size());
        assertEquals(2, result.getTotalWarnings(), "totalWarnings must equal warnings.size()");
        assertSame(second, result.getWarnings().get(1));
        // failures must remain untouched by addWarning
        assertEquals(0, result.getTotalFailures());
        assertTrue(result.getFailures().isEmpty());
    }

    @Test
    @DisplayName("addFailure permits null elements and still counts them toward totalFailures")
    void addFailure_allowsNullElement() {
        PDFVerificationResult result = new PDFVerificationResult();

        result.addFailure(null);

        assertEquals(1, result.getFailures().size());
        assertEquals(1, result.getTotalFailures());
        assertNull(result.getFailures().get(0));
    }

    @Test
    @DisplayName("addWarning permits null elements and still counts them toward totalWarnings")
    void addWarning_allowsNullElement() {
        PDFVerificationResult result = new PDFVerificationResult();

        result.addWarning(null);

        assertEquals(1, result.getWarnings().size());
        assertEquals(1, result.getTotalWarnings());
        assertNull(result.getWarnings().get(0));
    }

    @Test
    @DisplayName("repeated additions resync totalFailures to the exact list size every time")
    void addFailure_resyncsTotalOnEachCall() {
        PDFVerificationResult result = new PDFVerificationResult();

        for (int i = 1; i <= 5; i++) {
            result.addFailure(new ValidationIssue());
            assertEquals(
                    i,
                    result.getTotalFailures(),
                    () -> "totalFailures must track the running list size");
            assertEquals(result.getFailures().size(), result.getTotalFailures());
        }
    }

    @Test
    @DisplayName(
            "setFailures bypasses the counter: addFailure then recomputes total from the new list")
    void setFailures_thenAddFailure_recomputesFromCurrentList() {
        PDFVerificationResult result = new PDFVerificationResult();
        // Pre-seed a counter that does NOT match the (default empty) list.
        result.setTotalFailures(99);

        // addFailure ignores the stale counter and resets it to the list size.
        result.addFailure(new ValidationIssue());

        assertEquals(1, result.getFailures().size());
        assertEquals(
                1,
                result.getTotalFailures(),
                "addFailure must recompute totalFailures from list size, ignoring the prior value");
    }

    @Test
    @DisplayName("replacing the failures list via setter then adding keeps total tied to that list")
    void setFailures_withExistingElements_thenAdd() {
        PDFVerificationResult result = new PDFVerificationResult();

        List<ValidationIssue> seeded = new ArrayList<>();
        seeded.add(new ValidationIssue());
        seeded.add(new ValidationIssue());
        result.setFailures(seeded);

        // Counter is not auto-updated by the setter (only addFailure maintains it).
        assertEquals(0, result.getTotalFailures());

        result.addFailure(new ValidationIssue());

        assertEquals(3, result.getFailures().size());
        assertEquals(3, result.getTotalFailures(), "total must reflect the replaced list's size");
    }

    @Test
    @DisplayName("setters mutate every scalar field on the Lombok @Data instance")
    void setters_mutateScalarFields() {
        PDFVerificationResult result = new PDFVerificationResult();

        result.setStandard("PDF/A-1B");
        result.setStandardName("PDF/A-1 Level B");
        result.setValidationProfile("PDFA_1_B");
        result.setValidationProfileName("PDF/A-1B validation");
        result.setComplianceSummary("Document is compliant");
        result.setDeclaredPdfa(true);
        result.setCompliant(true);
        result.setTotalFailures(7);
        result.setTotalWarnings(3);

        assertEquals("PDF/A-1B", result.getStandard());
        assertEquals("PDF/A-1 Level B", result.getStandardName());
        assertEquals("PDFA_1_B", result.getValidationProfile());
        assertEquals("PDF/A-1B validation", result.getValidationProfileName());
        assertEquals("Document is compliant", result.getComplianceSummary());
        assertTrue(result.isDeclaredPdfa());
        assertTrue(result.isCompliant());
        assertEquals(7, result.getTotalFailures());
        assertEquals(3, result.getTotalWarnings());
    }

    @Test
    @DisplayName("all-args constructor sets every field exactly")
    void allArgsConstructor_setsEveryField() {
        ValidationIssue failure = new ValidationIssue("R1", "msg", "loc", "spec", "cl", "T1");
        ValidationIssue warning = new ValidationIssue("R2", "warn", "loc2", "spec2", "cl2", "T2");
        List<ValidationIssue> failures = new ArrayList<>(List.of(failure));
        List<ValidationIssue> warnings = new ArrayList<>(List.of(warning));

        PDFVerificationResult result =
                new PDFVerificationResult(
                        "std",
                        "stdName",
                        "profile",
                        "profileName",
                        "summary",
                        true,
                        false,
                        1,
                        1,
                        failures,
                        warnings);

        assertEquals("std", result.getStandard());
        assertEquals("stdName", result.getStandardName());
        assertEquals("profile", result.getValidationProfile());
        assertEquals("profileName", result.getValidationProfileName());
        assertEquals("summary", result.getComplianceSummary());
        assertTrue(result.isDeclaredPdfa());
        assertFalse(result.isCompliant());
        assertEquals(1, result.getTotalFailures());
        assertEquals(1, result.getTotalWarnings());
        assertSame(failures, result.getFailures());
        assertSame(warnings, result.getWarnings());
        assertSame(failure, result.getFailures().get(0));
        assertSame(warning, result.getWarnings().get(0));
    }

    @Test
    @DisplayName("equals/hashCode reflect value equality including list contents and counters")
    void equalsAndHashCode_valueSemantics() {
        PDFVerificationResult a = new PDFVerificationResult();
        a.setStandard("PDF/A-2B");
        a.addFailure(new ValidationIssue("R1", "m", "l", "s", "c", "T"));

        PDFVerificationResult b = new PDFVerificationResult();
        b.setStandard("PDF/A-2B");
        b.addFailure(new ValidationIssue("R1", "m", "l", "s", "c", "T"));

        assertEquals(a, b, "equal field values must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "equal objects must share a hash code");
        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-result");

        // A divergent counter makes the two unequal even with identical lists.
        b.setTotalFailures(b.getTotalFailures() + 1);
        assertNotEquals(a, b, "differing totalFailures must break equality");
    }

    @Test
    @DisplayName("toString includes scalar field values")
    void toString_containsFieldValues() {
        PDFVerificationResult result = new PDFVerificationResult();
        result.setStandard("PDF/A-3U");
        result.setComplianceSummary("summaryText");

        String text = result.toString();

        assertNotNull(text);
        assertTrue(text.contains("PDF/A-3U"), () -> "toString should contain standard: " + text);
        assertTrue(
                text.contains("summaryText"),
                () -> "toString should contain complianceSummary: " + text);
    }

    @Test
    @DisplayName("ValidationIssue: no-args constructor leaves all fields null")
    void validationIssue_noArgsConstructor_defaults() {
        ValidationIssue issue = new ValidationIssue();

        assertNull(issue.getRuleId());
        assertNull(issue.getMessage());
        assertNull(issue.getLocation());
        assertNull(issue.getSpecification());
        assertNull(issue.getClause());
        assertNull(issue.getTestNumber());
    }

    @Test
    @DisplayName("ValidationIssue: all-args constructor and setters round-trip every field")
    void validationIssue_allArgsAndSetters() {
        ValidationIssue issue =
                new ValidationIssue("ruleId", "message", "location", "spec", "clause", "T-7");

        assertEquals("ruleId", issue.getRuleId());
        assertEquals("message", issue.getMessage());
        assertEquals("location", issue.getLocation());
        assertEquals("spec", issue.getSpecification());
        assertEquals("clause", issue.getClause());
        assertEquals("T-7", issue.getTestNumber());

        issue.setRuleId("R2");
        issue.setMessage("changed");
        issue.setLocation("page 1");
        issue.setSpecification("ISO 19005-1");
        issue.setClause("6.1");
        issue.setTestNumber("T-9");

        assertEquals("R2", issue.getRuleId());
        assertEquals("changed", issue.getMessage());
        assertEquals("page 1", issue.getLocation());
        assertEquals("ISO 19005-1", issue.getSpecification());
        assertEquals("6.1", issue.getClause());
        assertEquals("T-9", issue.getTestNumber());
    }

    @Test
    @DisplayName("ValidationIssue: equals/hashCode use value semantics")
    void validationIssue_equalsAndHashCode() {
        ValidationIssue a = new ValidationIssue("R", "m", "l", "s", "c", "T");
        ValidationIssue b = new ValidationIssue("R", "m", "l", "s", "c", "T");
        ValidationIssue different = new ValidationIssue("R2", "m", "l", "s", "c", "T");

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertNotEquals(a, different);
        assertNotEquals(a, null);
        assertNotEquals(a, "not-an-issue");
        assertEquals(a, a);
    }
}
