package stirling.software.proprietary.security.model.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.security.model.dto.AdminUserSummary.TeamSummary;

/**
 * Unit tests for the plain Lombok DTO {@link AdminUserSummary} and its nested {@link TeamSummary}.
 *
 * <p>Both types are annotated only with {@code @Getter @Setter @NoArgsConstructor @AllArgsConstructor}
 * (no {@code @Data}/{@code @EqualsAndHashCode}/{@code @ToString}), so these tests exercise the
 * constructors, getters and setters as pure POJOs - no Spring context, no persistence, no mocks. A
 * couple of tests cover the {@code @JsonInclude(NON_NULL)} contract using the legacy Jackson 2
 * {@code com.fasterxml.jackson.databind.ObjectMapper} (the same flavour the production class imports
 * its {@code @JsonInclude} annotation from).
 */
class AdminUserSummaryTest {

    private static final LocalDateTime CREATED = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
    private static final LocalDateTime UPDATED = LocalDateTime.of(2025, 6, 7, 8, 9, 10);

    // ─── AdminUserSummary: all-args constructor ──────────────────────────────────

    @Test
    void allArgsConstructor_populatesEveryField() {
        TeamSummary team = new TeamSummary(99L, "Platform");

        AdminUserSummary summary =
                new AdminUserSummary(
                        1L,
                        "alice",
                        "alice@example.com",
                        "adminUserSettings.admin",
                        "ROLE_ADMIN",
                        true,
                        Boolean.TRUE,
                        "WEB",
                        team,
                        CREATED,
                        UPDATED);

        assertEquals(1L, summary.getId());
        assertEquals("alice", summary.getUsername());
        assertEquals("alice@example.com", summary.getEmail());
        assertEquals("adminUserSettings.admin", summary.getRoleName());
        assertEquals("ROLE_ADMIN", summary.getRolesAsString());
        assertTrue(summary.isEnabled());
        assertEquals(Boolean.TRUE, summary.getIsFirstLogin());
        assertEquals("WEB", summary.getAuthenticationType());
        assertSame(team, summary.getTeam());
        assertEquals(CREATED, summary.getCreatedAt());
        assertEquals(UPDATED, summary.getUpdatedAt());
    }

    @Test
    void allArgsConstructor_acceptsNullsForObjectFieldsAndFalseEnabled() {
        AdminUserSummary summary =
                new AdminUserSummary(
                        null, null, null, null, null, false, null, null, null, null, null);

        assertNull(summary.getId());
        assertNull(summary.getUsername());
        assertNull(summary.getEmail());
        assertNull(summary.getRoleName());
        assertNull(summary.getRolesAsString());
        assertFalse(summary.isEnabled());
        assertNull(summary.getIsFirstLogin());
        assertNull(summary.getAuthenticationType());
        assertNull(summary.getTeam());
        assertNull(summary.getCreatedAt());
        assertNull(summary.getUpdatedAt());
    }

    // ─── AdminUserSummary: no-args constructor defaults ──────────────────────────

    @Test
    void noArgsConstructor_leavesObjectFieldsNullAndPrimitiveFalse() {
        AdminUserSummary summary = new AdminUserSummary();

        assertNull(summary.getId());
        assertNull(summary.getUsername());
        assertNull(summary.getEmail());
        assertNull(summary.getRoleName());
        assertNull(summary.getRolesAsString());
        // boolean primitive defaults to false (not null)
        assertFalse(summary.isEnabled());
        assertNull(summary.getIsFirstLogin());
        assertNull(summary.getAuthenticationType());
        assertNull(summary.getTeam());
        assertNull(summary.getCreatedAt());
        assertNull(summary.getUpdatedAt());
    }

    // ─── AdminUserSummary: setters round-trip ────────────────────────────────────

    @Test
    void setters_roundTripEveryField() {
        AdminUserSummary summary = new AdminUserSummary();
        TeamSummary team = new TeamSummary(7L, "QA");

        summary.setId(42L);
        summary.setUsername("bob");
        summary.setEmail("bob@example.com");
        summary.setRoleName("adminUserSettings.user");
        summary.setRolesAsString("ROLE_USER");
        summary.setEnabled(true);
        summary.setIsFirstLogin(Boolean.FALSE);
        summary.setAuthenticationType("OAUTH2");
        summary.setTeam(team);
        summary.setCreatedAt(CREATED);
        summary.setUpdatedAt(UPDATED);

        assertEquals(42L, summary.getId());
        assertEquals("bob", summary.getUsername());
        assertEquals("bob@example.com", summary.getEmail());
        assertEquals("adminUserSettings.user", summary.getRoleName());
        assertEquals("ROLE_USER", summary.getRolesAsString());
        assertTrue(summary.isEnabled());
        assertEquals(Boolean.FALSE, summary.getIsFirstLogin());
        assertEquals("OAUTH2", summary.getAuthenticationType());
        assertSame(team, summary.getTeam());
        assertEquals(CREATED, summary.getCreatedAt());
        assertEquals(UPDATED, summary.getUpdatedAt());
    }

    @Test
    void setEnabled_togglesBothWays() {
        AdminUserSummary summary = new AdminUserSummary();

        summary.setEnabled(true);
        assertTrue(summary.isEnabled());

        summary.setEnabled(false);
        assertFalse(summary.isEnabled());
    }

    @Test
    void setters_allowNullingOutPreviouslySetObjectFields() {
        AdminUserSummary summary =
                new AdminUserSummary(
                        1L,
                        "alice",
                        "alice@example.com",
                        "role",
                        "ROLE_ADMIN",
                        true,
                        Boolean.TRUE,
                        "WEB",
                        new TeamSummary(2L, "T"),
                        CREATED,
                        UPDATED);

        summary.setUsername(null);
        summary.setTeam(null);
        summary.setIsFirstLogin(null);
        summary.setCreatedAt(null);

        assertNull(summary.getUsername());
        assertNull(summary.getTeam());
        assertNull(summary.getIsFirstLogin());
        assertNull(summary.getCreatedAt());
        // untouched fields remain
        assertEquals(1L, summary.getId());
        assertTrue(summary.isEnabled());
        assertEquals(UPDATED, summary.getUpdatedAt());
    }

    // ─── Nested TeamSummary ──────────────────────────────────────────────────────

    @Nested
    class TeamSummaryTest {

        @Test
        void allArgsConstructor_setsIdAndName() {
            TeamSummary team = new TeamSummary(5L, "Engineering");

            assertEquals(5L, team.getId());
            assertEquals("Engineering", team.getName());
        }

        @Test
        void noArgsConstructor_leavesFieldsNull_thenSettersWork() {
            TeamSummary team = new TeamSummary();

            assertNull(team.getId());
            assertNull(team.getName());

            team.setId(11L);
            team.setName("Ops");

            assertEquals(11L, team.getId());
            assertEquals("Ops", team.getName());
        }

        @Test
        void setters_acceptNulls() {
            TeamSummary team = new TeamSummary(3L, "Initial");

            team.setId(null);
            team.setName(null);

            assertNull(team.getId());
            assertNull(team.getName());
        }
    }

    // ─── @JsonInclude(NON_NULL) serialization contract (Jackson 2) ───────────────

    @Nested
    class JsonSerializationTest {

        /**
         * Mirrors the production Jackson flavour: {@code com.fasterxml.jackson.databind}. Time fields
         * are deliberately left null so no JSR-310 module is required on the test classpath.
         */
        private ObjectMapper mapper() {
            return new ObjectMapper();
        }

        @Test
        void serialization_omitsNullFieldsPerJsonIncludeNonNull() throws Exception {
            AdminUserSummary summary = new AdminUserSummary();
            summary.setId(1L);
            summary.setUsername("alice");
            summary.setEnabled(true);
            // everything else (email, roleName, rolesAsString, isFirstLogin,
            // authenticationType, team, createdAt, updatedAt) left null

            String json = mapper().writeValueAsString(summary);

            // Present non-null fields appear.
            assertTrue(json.contains("\"id\":1"), json);
            assertTrue(json.contains("\"username\":\"alice\""), json);
            // enabled is a primitive boolean - always serialized regardless of NON_NULL.
            assertTrue(json.contains("\"enabled\":true"), json);

            // Null object fields are excluded by @JsonInclude(NON_NULL).
            assertFalse(json.contains("email"), json);
            assertFalse(json.contains("roleName"), json);
            assertFalse(json.contains("rolesAsString"), json);
            assertFalse(json.contains("isFirstLogin"), json);
            assertFalse(json.contains("authenticationType"), json);
            assertFalse(json.contains("team"), json);
            assertFalse(json.contains("createdAt"), json);
            assertFalse(json.contains("updatedAt"), json);
        }

        @Test
        void serialization_includesNestedTeamWhenPresent() throws Exception {
            AdminUserSummary summary = new AdminUserSummary();
            summary.setTeam(new TeamSummary(9L, "Platform"));

            String json = mapper().writeValueAsString(summary);

            assertTrue(json.contains("\"team\""), json);
            assertTrue(json.contains("\"id\":9"), json);
            assertTrue(json.contains("\"name\":\"Platform\""), json);
        }

        @Test
        void deserialization_roundTripsScalarFields() throws Exception {
            ObjectMapper mapper = mapper();
            String json =
                    "{\"id\":3,\"username\":\"carol\",\"email\":\"carol@example.com\","
                            + "\"roleName\":\"role\",\"rolesAsString\":\"ROLE_ADMIN\","
                            + "\"enabled\":true,\"isFirstLogin\":false,"
                            + "\"authenticationType\":\"SAML2\","
                            + "\"team\":{\"id\":4,\"name\":\"Sec\"}}";

            AdminUserSummary summary = mapper.readValue(json, AdminUserSummary.class);

            assertEquals(3L, summary.getId());
            assertEquals("carol", summary.getUsername());
            assertEquals("carol@example.com", summary.getEmail());
            assertEquals("role", summary.getRoleName());
            assertEquals("ROLE_ADMIN", summary.getRolesAsString());
            assertTrue(summary.isEnabled());
            assertEquals(Boolean.FALSE, summary.getIsFirstLogin());
            assertEquals("SAML2", summary.getAuthenticationType());
            assertEquals(4L, summary.getTeam().getId());
            assertEquals("Sec", summary.getTeam().getName());
        }

        @Test
        void deserialization_ignoresUnknownPropertiesWhenConfigured() throws Exception {
            ObjectMapper mapper =
                    mapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            String json = "{\"id\":1,\"username\":\"dave\",\"unexpectedKey\":\"ignored\"}";

            AdminUserSummary summary = mapper.readValue(json, AdminUserSummary.class);

            assertEquals(1L, summary.getId());
            assertEquals("dave", summary.getUsername());
            // Absent primitive 'enabled' defaults to false on deserialization.
            assertFalse(summary.isEnabled());
        }
    }
}
