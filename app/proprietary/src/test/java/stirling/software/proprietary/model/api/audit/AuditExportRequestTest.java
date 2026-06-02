package stirling.software.proprietary.model.api.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link AuditExportRequest}, a pure Lombok DTO
 * ({@code @Data}, {@code @NoArgsConstructor}, {@code @AllArgsConstructor},
 * {@code @EqualsAndHashCode(callSuper = true)}) extending {@link AuditDateExportRequest}.
 *
 * <p>No Spring context, mocks or IO are needed: every behaviour under test (constructors,
 * accessors, {@code equals}/{@code hashCode} across the hierarchy and {@code toString}) is a
 * synchronous, side-effect-free Lombok-generated artefact.
 *
 * <p>NOTE for the reviewer: Lombok's {@code @AllArgsConstructor} on a subclass generates a
 * constructor for the <em>declared</em> fields only - it cannot pass values to a super
 * constructor. So the all-args constructor here is {@code AuditExportRequest(String type,
 * String principal)}; the inherited {@code startDate}/{@code endDate} are populated through the
 * inherited setters. Please verify that matches the intended API.
 */
class AuditExportRequestTest {

    // ─── all-args constructor (declared fields only) ─────────────────────────────

    @Test
    void allArgsConstructor_setsOwnFields_andLeavesInheritedFieldsNull() {
        AuditExportRequest req = new AuditExportRequest("USER_LOGIN", "admin");

        assertEquals("USER_LOGIN", req.getType());
        assertEquals("admin", req.getPrincipal());
        // Inherited fields are not part of the generated all-args ctor.
        assertNull(req.getStartDate());
        assertNull(req.getEndDate());
    }

    @Test
    void allArgsConstructor_acceptsNullValues() {
        AuditExportRequest req = new AuditExportRequest(null, null);

        assertNull(req.getType());
        assertNull(req.getPrincipal());
    }

    // ─── no-args constructor + setters/getters (own & inherited) ─────────────────

    @Test
    void noArgsConstructor_initialisesEveryFieldToNull() {
        AuditExportRequest req = new AuditExportRequest();

        assertNull(req.getType());
        assertNull(req.getPrincipal());
        assertNull(req.getStartDate());
        assertNull(req.getEndDate());
    }

    @Test
    void setters_roundTripOwnAndInheritedFields() {
        LocalDate start = LocalDate.of(2025, 1, 1);
        LocalDate end = LocalDate.of(2025, 12, 31);

        AuditExportRequest req = new AuditExportRequest();
        req.setType("PDF_PROCESS");
        req.setPrincipal("operator");
        req.setStartDate(start);
        req.setEndDate(end);

        assertEquals("PDF_PROCESS", req.getType());
        assertEquals("operator", req.getPrincipal());
        assertEquals(start, req.getStartDate());
        assertEquals(end, req.getEndDate());
    }

    @Test
    void setters_acceptNullToClearFields() {
        AuditExportRequest req = new AuditExportRequest("SETTINGS_CHANGED", "root");
        req.setStartDate(LocalDate.now());

        req.setType(null);
        req.setPrincipal(null);
        req.setStartDate(null);

        assertNull(req.getType());
        assertNull(req.getPrincipal());
        assertNull(req.getStartDate());
    }

    // ─── equals / hashCode with callSuper = true ─────────────────────────────────

    @Test
    void equals_and_hashCode_trueWhenAllFieldsIncludingInheritedMatch() {
        AuditExportRequest a = fullyPopulated();
        AuditExportRequest b = fullyPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void equals_falseWhenOwnTypeFieldDiffers() {
        AuditExportRequest a = fullyPopulated();
        AuditExportRequest b = fullyPopulated();
        b.setType("HTTP_REQUEST");

        assertNotEquals(a, b);
    }

    @Test
    void equals_falseWhenOwnPrincipalFieldDiffers() {
        AuditExportRequest a = fullyPopulated();
        AuditExportRequest b = fullyPopulated();
        b.setPrincipal("someoneElse");

        assertNotEquals(a, b);
    }

    @Test
    void equals_falseWhenInheritedStartDateDiffers_provingCallSuperIsHonoured() {
        AuditExportRequest a = fullyPopulated();
        AuditExportRequest b = fullyPopulated();
        b.setStartDate(LocalDate.of(1999, 1, 1));

        // Only an inherited field differs; callSuper = true must make these unequal.
        assertNotEquals(a, b);
    }

    @Test
    void equals_falseWhenInheritedEndDateDiffers_provingCallSuperIsHonoured() {
        AuditExportRequest a = fullyPopulated();
        AuditExportRequest b = fullyPopulated();
        b.setEndDate(LocalDate.of(2099, 12, 31));

        assertNotEquals(a, b);
    }

    @Test
    void equals_isReflexive() {
        AuditExportRequest a = fullyPopulated();
        assertEquals(a, a);
    }

    @Test
    void equals_falseAgainstNullAndUnrelatedType() {
        AuditExportRequest a = fullyPopulated();

        assertNotEquals(a, null);
        assertNotEquals(a, "not an AuditExportRequest");
    }

    @Test
    void equals_twoFreshNoArgInstances_areEqual() {
        // Both have all-null fields, so equals/hashCode must agree.
        AuditExportRequest a = new AuditExportRequest();
        AuditExportRequest b = new AuditExportRequest();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    // ─── cross-hierarchy: canEqual asymmetry with a subclass ─────────────────────

    @Test
    void equals_notEqualToSubclassInstance_dueToCanEqual() {
        // AuditDataRequest extends AuditExportRequest. Lombok's generated canEqual()
        // makes a superclass instance unequal to a subclass instance even when shared
        // fields match, because the subclass refines the type.
        AuditExportRequest parent = new AuditExportRequest("USER_LOGIN", "admin");

        AuditDataRequest child = new AuditDataRequest();
        child.setType("USER_LOGIN");
        child.setPrincipal("admin");

        assertNotEquals(parent, child);
        assertNotEquals(child, parent);
    }

    // ─── toString ────────────────────────────────────────────────────────────────

    @Test
    void toString_containsOwnFieldValues() {
        AuditExportRequest req = new AuditExportRequest("USER_LOGOUT", "auditor");

        String s = req.toString();

        assertTrue(s.contains("USER_LOGOUT"), () -> "toString missing type: " + s);
        assertTrue(s.contains("auditor"), () -> "toString missing principal: " + s);
    }

    // ─── helpers ─────────────────────────────────────────────────────────────────

    private static AuditExportRequest fullyPopulated() {
        AuditExportRequest req = new AuditExportRequest("USER_LOGIN", "admin");
        req.setStartDate(LocalDate.of(2025, 1, 1));
        req.setEndDate(LocalDate.of(2025, 12, 31));
        return req;
    }
}
